const { prisma } = require('../lib/prisma');


let colaAuditoria = Promise.resolve();

function encolarAuditoria(data) {
  colaAuditoria = colaAuditoria
    .then(() => prisma.auditoriaEvento.create({ data }))
    .catch((error) => {
      console.error('Error guardando auditoria:', error.message);
    });
}

function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.length > 0) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || null;
}

const auditMiddleware = (req, res, next) => {
  const inicio = Date.now();

  res.on('finish', () => {
    const user = req.user || null;
    const dataEvento = {
      metodo: req.method,
      endpoint: req.originalUrl || req.url,
      estadoHttp: res.statusCode,
      actorId: user?.id ? Number(user.id) : null,
      actorUsername: user?.username || null,
      actorRol: user?.rol || null,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
      detalle: JSON.stringify({
        duracionMs: Date.now() - inicio,
        params: req.params,
        query: req.query
      })
    };

    // Fuera del ciclo inmediato de respuesta para no competir con la transaccion principal.
    setImmediate(() => {
      encolarAuditoria(dataEvento);
    });
  });

  next();
};

module.exports = auditMiddleware;