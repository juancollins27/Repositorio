// Sirve el informe (public/index.html) sin dependencias externas.
//
// Contraseña opcional por variables de entorno, con autenticación básica de
// HTTP: el navegador la pide una vez al entrar.
//   APP_PASSWORD           → si está, el informe pide usuario y contraseña
//   APP_USUARIO            → opcional, por defecto "balcarce"

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const { APP_PASSWORD, APP_USUARIO = 'balcarce' } = process.env;

function iguales(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function autorizado(req) {
  if (!APP_PASSWORD) return true;
  const [tipo, valor] = String(req.headers.authorization || '').split(' ');
  if (tipo !== 'Basic' || !valor) return false;
  const texto = Buffer.from(valor, 'base64').toString('utf-8');
  const i = texto.indexOf(':');
  return i > 0 && iguales(texto.slice(0, i), APP_USUARIO) && iguales(texto.slice(i + 1), APP_PASSWORD);
}

http.createServer((req, res) => {
  if (req.url === '/salud') return res.end('ok');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405);
    return res.end();
  }
  if (!autorizado(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Informe Balcarce", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Hace falta usuario y contraseña para ver el informe.');
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Robots-Tag': 'noindex, nofollow'
  });
  res.end(req.method === 'HEAD' ? undefined : HTML);
}).listen(PORT, () => {
  console.log(`Informe Balcarce en http://localhost:${PORT}`);
  if (!APP_PASSWORD) console.log('Atención: sin APP_PASSWORD el informe queda abierto a cualquiera que tenga la URL.');
});
