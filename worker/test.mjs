// Prueba del Worker con una API de GitHub simulada en memoria:  node worker/test.mjs
import worker from './index.js';
import assert from 'node:assert/strict';

// --- GitHub falso: guarda un archivo con sha, exige el sha correcto al escribir y puede forzar un conflicto ---
const store = { exists: false, content: '', sha: 0, puts: [], conflictNext: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  assert.ok(String(url).startsWith('https://api.github.com/repos/Jamarlli/tesla-runner/contents/scores.json'), 'URL inesperada: ' + url);
  assert.equal(init.headers.Authorization, 'Bearer TEST_TOKEN');
  const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
  if ((init.method || 'GET') === 'GET') {
    assert.ok(String(url).includes('ref=leaderboard'));
    if (!store.exists) return json(404, { message: 'Not Found' });
    return json(200, { content: Buffer.from(store.content).toString('base64').replace(/(.{60})/g, '$1\n'), sha: 'sha' + store.sha });
  }
  const body = JSON.parse(init.body);
  assert.equal(body.branch, 'leaderboard');
  if (store.conflictNext > 0) { store.conflictNext--; store.sha++; return json(409, { message: 'conflict' }); }
  if (store.exists && body.sha !== 'sha' + store.sha) return json(409, { message: 'sha mismatch' });
  if (!store.exists && body.sha) return json(422, { message: 'bad sha' });
  store.exists = true; store.content = Buffer.from(body.content, 'base64').toString('utf8'); store.sha++; store.puts.push(body.message);
  return json(200, { content: { sha: 'sha' + store.sha } });
};

const env = { GITHUB_TOKEN: 'TEST_TOKEN', GITHUB_REPO: 'Jamarlli/tesla-runner', GITHUB_BRANCH: 'leaderboard', SCORES_PATH: 'scores.json', ALLOWED_ORIGIN: 'https://jamarlli.github.io' };
let ipN = 0;
const call = (method, body, path = '/api/scores', ip) => worker.fetch(new Request('https://api.test' + path, {
  method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'CF-Connecting-IP': ip || ('1.1.1.' + (ipN++ % 250)), 'Content-Type': 'application/json' },
}), env);
const post = (name, score, ip) => call('POST', { name, score }, '/api/scores', ip);
let n = 0; const ok = msg => console.log('  ✓', msg, `(${++n})`);

// 1) archivo inexistente -> lista vacía; CORS
let r = await call('GET'); assert.equal(r.status, 200); assert.deepEqual(await r.json(), []); assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://jamarlli.github.io'); ok('GET con archivo inexistente devuelve [] y CORS');
r = await call('OPTIONS'); assert.equal(r.status, 204); ok('OPTIONS (preflight) -> 204');
r = await call('GET', undefined, '/healthz'); assert.equal((await r.json()).ok, true); ok('/healthz');

// 2) primer envío crea el archivo (commit sin sha) y queda legible en la rama
r = await post('Javi', 1234); assert.equal(r.status, 201); assert.equal(store.puts.length, 1); assert.match(store.puts[0], /score: Javi 1234/); ok('POST crea scores.json con un commit');
assert.deepEqual(JSON.parse(store.content).map(e => e.name), ['Javi']); ok('el archivo contiene la entrada');

// 3) validaciones
for (const [name, score] of [['', 5], ['x', -1], ['x', 9999999], ['x', 'abc']]) { r = await post(name, score); assert.equal(r.status, 400); } ok('entradas inválidas -> 400');
r = await call('POST', 'esto no es json'.slice(0), '/api/scores'); assert.equal(r.status, 400); ok('JSON roto -> 400');
r = await post('<b>Ana  Maria</b>', 99); assert.equal(r.status, 201); assert.equal((await r.json()).name, 'bAna Maria/b'.slice(0, 12)); ok('se limpian < > y espacios repetidos, máx. 12 caracteres');

// 4) conflicto de escritura: el Worker relee y reintenta
store.conflictNext = 2; r = await post('Luis', 500); assert.equal(r.status, 201); ok('con 2 conflictos 409 seguidos reintenta y acaba guardando');
store.conflictNext = 10; r = await post('Pau', 600); assert.equal(r.status, 503); store.conflictNext = 0; ok('si siempre hay conflicto devuelve 503 (no se pierde nada ni se cuelga)');

// 5) TOP 100: con el ranking lleno solo entran las que superan a la 100ª
store.content = JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ name: 'P' + (i + 1), score: 100 + i, date: 1700000000000 + i })));
r = await post('Bajo', 100); assert.equal(r.status, 403); r = await post('Bajo', 50); assert.equal(r.status, 403); ok('puntuaciones <= la 100ª -> 403');
r = await post('Alto', 5000); assert.equal(r.status, 201);
const saved = JSON.parse(store.content); assert.equal(saved.length, 100); assert.equal(saved[0].name, 'Alto'); assert.equal(Math.min(...saved.map(e => e.score)), 101); ok('una puntuación alta entra, la peor sale y el total sigue en 100');
r = await call('GET'); const got = await r.json(); assert.equal(got.length, 100); assert.equal(got[0].score, 5000); ok('GET devuelve el top 100 ordenado (la caché se actualiza al escribir)');

// 6) límite por IP
let codes = []; for (let i = 0; i < 10; i++) codes.push((await post('Spam' + i, 9000 + i, '9.9.9.9')).status);
assert.deepEqual(codes.slice(-2), [429, 429]); ok('a partir del 9º envío por minuto desde la misma IP -> 429');

// 7) error de GitHub -> 502 sin filtrar detalles
globalThis.fetch = async () => new Response('boom', { status: 500 });
r = await post('Err', 7777, '8.8.8.8'); assert.equal(r.status, 502); assert.ok(!(await r.text()).includes('boom')); ok('fallo de GitHub -> 502 genérico');

globalThis.fetch = realFetch;
console.log(`\nWorker OK: ${n} comprobaciones`);
