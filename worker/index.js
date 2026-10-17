// Tesla Runner · API del leaderboard como Cloudflare Worker.
// El TOP 100 vive en un archivo (scores.json) de una rama del propio repo de GitHub: el Worker lo lee y, cuando entra una
// puntuación nueva, hace un commit con el archivo actualizado. Misma API que server.js (GET/POST /api/scores).
//
// Variables (wrangler.toml): GITHUB_REPO, GITHUB_BRANCH, SCORES_PATH, ALLOWED_ORIGIN
// Secreto (npx wrangler secret put GITHUB_TOKEN): token de GitHub con permiso "Contents: Read and write" SOLO sobre el repo.

const MAX = 100;                 // solo se guarda el TOP 100
const POSTS_PER_MINUTE = 8;      // límite por IP (en memoria, por instancia: ayuda, no es infalible)

const top = (list, n) => list.slice().sort((a, b) => b.score - a.score || a.date - b.date).slice(0, n);
const b64enc = str => { let bin = ''; new TextEncoder().encode(str).forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin); };
const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

const cors = env => ({
  'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});
const reply = (env, code, body) => new Response(code === 204 ? null : JSON.stringify(body), {
  status: code, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(env) },
});

function github(env, query, init = {}) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${env.SCORES_PATH || 'scores.json'}${query}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'tesla-runner-worker',
      'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}),
    },
  });
}
const branch = env => env.GITHUB_BRANCH || 'leaderboard';

async function readScores(env) {
  const r = await github(env, `?ref=${encodeURIComponent(branch(env))}`);
  if (r.status === 404) return { list: [], sha: null };
  if (!r.ok) throw new Error('GitHub GET ' + r.status);
  const j = await r.json();
  let list = []; try { list = JSON.parse(b64dec(j.content)); } catch (e) {}
  return { list: Array.isArray(list) ? list : [], sha: j.sha };
}
function writeScores(env, list, sha, message) {
  const body = {
    message, content: b64enc(JSON.stringify(list, null, 2) + '\n'), branch: branch(env),
    committer: { name: 'Tesla Runner Leaderboard', email: 'leaderboard@users.noreply.github.com' },
  };
  if (sha) body.sha = sha;
  return github(env, '', { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
}

const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (arr.length >= POSTS_PER_MINUTE) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr); return false;
}
let cache = { t: 0, list: null };      // caché de 5 s para no gastar cuota de la API de GitHub en cada apertura del popup

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return reply(env, 204);
    if (url.pathname === '/healthz') return reply(env, 200, { ok: true });
    if (url.pathname !== '/api/scores') return reply(env, 404, { error: 'No encontrado' });
    try {
      if (request.method === 'GET') {
        if (cache.list && Date.now() - cache.t < 5000) return reply(env, 200, cache.list);
        const { list } = await readScores(env);
        cache = { t: Date.now(), list: top(list, MAX) };
        return reply(env, 200, cache.list);
      }
      if (request.method !== 'POST') return reply(env, 405, { error: 'Método no permitido' });
      if (limited(request.headers.get('CF-Connecting-IP') || 'local')) return reply(env, 429, { error: 'Demasiados envíos, espera un minuto' });
      let data; try { data = await request.json(); } catch (e) { return reply(env, 400, { error: 'JSON inválido' }); }
      const score = Math.floor(Number(data.score));
      const name = String(data.name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
      if (!name || !Number.isFinite(score) || score < 0 || score > 99999) return reply(env, 400, { error: 'Datos no válidos' });
      for (let attempt = 0; attempt < 4; attempt++) {
        const { list, sha } = await readScores(env);
        const sorted = top(list, MAX);
        if (sorted.length >= MAX && score <= sorted[MAX - 1].score) return reply(env, 403, { error: 'No entra en el TOP ' + MAX });
        const entry = { name, score, date: Date.now() };
        const next = top([...list, entry], MAX);
        const r = await writeScores(env, next, sha, `score: ${name} ${score}`);
        if (r.ok) { cache = { t: Date.now(), list: next }; return reply(env, 201, entry); }
        if (r.status !== 409 && r.status !== 422) throw new Error('GitHub PUT ' + r.status);
        // 409/422: alguien escribió a la vez (sha desactualizado) -> se vuelve a leer y se reintenta
      }
      return reply(env, 503, { error: 'Ocupado, inténtalo de nuevo' });
    } catch (e) {
      return reply(env, 502, { error: 'Error con el almacenamiento del leaderboard' });
    }
  },
};
