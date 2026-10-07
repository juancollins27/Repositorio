// Protección con contraseña para publicar el panel (por ejemplo en Railway).
//
// Se activa con variables de entorno; sin ellas el panel queda abierto, como
// al correrlo en la propia computadora.
//   APP_USUARIO / APP_PASSWORD                 → acceso completo (ver y editar)
//   APP_USUARIO_LECTURA / APP_PASSWORD_LECTURA → sólo ver (no puede guardar,
//                                                editar, importar ni borrar)
// Usa la autenticación básica de HTTP: el navegador pide usuario y contraseña
// una vez y los recuerda para las llamadas a la API.

import crypto from 'node:crypto';

function iguales(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cuentasConfiguradas() {
  const cuentas = [];
  const { APP_USUARIO, APP_PASSWORD, APP_USUARIO_LECTURA, APP_PASSWORD_LECTURA } = process.env;
  if (APP_PASSWORD) cuentas.push({ usuario: APP_USUARIO || 'admin', password: APP_PASSWORD, rol: 'edicion' });
  if (APP_PASSWORD_LECTURA) cuentas.push({ usuario: APP_USUARIO_LECTURA || 'lectura', password: APP_PASSWORD_LECTURA, rol: 'lectura' });
  return cuentas;
}

export function proteccionActiva() {
  return cuentasConfiguradas().length > 0;
}

export function controlDeAcceso(req, res, next) {
  const cuentas = cuentasConfiguradas();
  if (!cuentas.length) return next();

  const [tipo, valor] = String(req.headers.authorization || '').split(' ');
  let cuenta = null;
  if (tipo === 'Basic' && valor) {
    const texto = Buffer.from(valor, 'base64').toString('utf-8');
    const i = texto.indexOf(':');
    const usuario = texto.slice(0, i), password = texto.slice(i + 1);
    cuenta = cuentas.find((c) => iguales(c.usuario, usuario) && iguales(c.password, password)) || null;
  }
  if (!cuenta) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Panel Comercial", charset="UTF-8"');
    return res.status(401).send('Hace falta usuario y contraseña para ver el panel.');
  }
  if (cuenta.rol === 'lectura' && !['GET', 'HEAD'].includes(req.method)) {
    return res.status(403).json({ error: 'este usuario es de sólo lectura' });
  }
  req.rol = cuenta.rol;
  next();
}
