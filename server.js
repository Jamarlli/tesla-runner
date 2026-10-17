// Servidor de Tesla Runner: sirve el juego y guarda el leaderboard (TOP 100) en un archivo JSON.
//   node server.js        -> http://localhost:3000
// Sin dependencias. Variables de entorno (todas opcionales):
//   PORT            puerto (por defecto 3000)
//   DATA_DIR        carpeta donde se guarda scores.json (monta aquí un volumen persistente al desplegar)
//   SCORES_FILE     ruta completa del archivo (anula DATA_DIR)
//   ALLOWED_ORIGIN  origen permitido por CORS para el API (por defecto "*"; pon tu dominio si sirves el juego desde otro sitio)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || ROOT;
const FILE = process.env.SCORES_FILE || path.join(DATA_DIR, 'scores.json');
const ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const MAX_ENTRIES = 100;           // solo se guarda el TOP 100
const POSTS_PER_MINUTE = 8;        // límite por IP

fs.mkdirSync(path.dirname(FILE), { recursive: true });

function readScores() {
  try { const l = JSON.parse(fs.readFileSync(FILE, 'utf8')); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
function writeScores(list) {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, FILE);
}
const top = (list, n) => list.slice().sort((a, b) => b.score - a.score || a.date - b.date).slice(0, n);

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// límite simple de envíos por IP (en memoria)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (arr.length >= POSTS_PER_MINUTE) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr); return false;
}
setInterval(() => { const now = Date.now(); for (const [ip, arr] of hits) if (!arr.some(t => now - t < 60000)) hits.delete(ip); }, 300000).unref();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (url.pathname === '/healthz') return send(res, 200, { ok: true });
  if (url.pathname === '/api/scores') {
    if (req.method === 'GET') return send(res, 200, top(readScores(), MAX_ENTRIES));
    if (req.method === 'POST') {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
      if (limited(ip)) return send(res, 429, { error: 'Demasiados envíos, espera un minuto' });
      let body = '';
      req.on('data', c => { body += c; if (body.length > 2048) req.destroy(); });
      req.on('end', () => {
        let data; try { data = JSON.parse(body); } catch (e) { return send(res, 400, { error: 'JSON inválido' }); }
        const score = Math.floor(Number(data.score));
        const name = String(data.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
        if (!name || !Number.isFinite(score) || score < 0 || score > 99999) return send(res, 400, { error: 'Datos no válidos' });
        const list = readScores();
        const sorted = top(list, MAX_ENTRIES);
        if (sorted.length >= MAX_ENTRIES && score <= sorted[MAX_ENTRIES - 1].score) return send(res, 403, { error: 'No entra en el TOP ' + MAX_ENTRIES });
        const entry = { name, score, date: Date.now() };
        list.push(entry);
        writeScores(top(list, MAX_ENTRIES));
        return send(res, 201, entry);
      });
      return;
    }
    return send(res, 405, { error: 'Método no permitido' });
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return fs.readFile(path.join(ROOT, 'index.html'), (err, buf) => err ? send(res, 500, 'Error', 'text/plain') : send(res, 200, buf, 'text/html; charset=utf-8'));
  }
  send(res, 404, 'No encontrado', 'text/plain');
});

server.listen(PORT, () => console.log(`Tesla Runner en http://localhost:${PORT}  (leaderboard: ${FILE})`));
