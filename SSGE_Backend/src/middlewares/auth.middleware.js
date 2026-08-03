const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: payload.sub,
      username: payload.username,
      rol: payload.rol
    };

    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    return next();
  };
}

function requireIngestaApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.INGESTA_API_KEY) {
    return res.status(401).json({ error: 'API key de ingesta invalida' });
  }

  req.user = {
    id: null,
    username: 'ingesta',
    rol: 'INGESTA',
  };

  return next();
}

module.exports = { requireAuth, requireRole, requireIngestaApiKey };