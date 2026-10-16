const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function signAccess(userId) {
  return jwt.sign({ sub: String(userId) }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
    algorithm: 'HS256',
  });
}

function signRefresh(userId) {
  return jwt.sign({ sub: String(userId), jti: crypto.randomUUID() }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: `${REFRESH_TTL_DAYS}d`,
    algorithm: 'HS256',
  });
}

const verifyAccess = (t) => jwt.verify(t, process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
const verifyRefresh = (t) => jwt.verify(t, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });

const COOKIE_NAME = 'rt';
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

module.exports = {
  sha256,
  signAccess,
  signRefresh,
  verifyAccess,
  verifyRefresh,
  COOKIE_NAME,
  cookieOptions,
  REFRESH_TTL_DAYS,
};
