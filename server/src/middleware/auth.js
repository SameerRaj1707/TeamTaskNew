const { verifyAccess } = require('../utils/token');
const { HttpError } = require('./helpers');

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Authentication required'));
  try {
    const payload = verifyAccess(token);
    req.userId = payload.sub;
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

// Cookie-authenticated endpoints must carry a custom header, which browsers
// will not send cross-site without a CORS preflight (defence in depth with SameSite=Strict).
function requireXHR(req, _res, next) {
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') return next(new HttpError(403, 'Forbidden'));
  next();
}

module.exports = { requireAuth, requireXHR };
