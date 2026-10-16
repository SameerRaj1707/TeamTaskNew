const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/User');
const { asyncHandler, validate, HttpError } = require('../middleware/helpers');
const { requireAuth, requireXHR } = require('../middleware/auth');
const {
  sha256,
  signAccess,
  signRefresh,
  verifyRefresh,
  COOKIE_NAME,
  cookieOptions,
  REFRESH_TTL_DAYS,
} = require('../utils/token');

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const ROTATION_GRACE_MS = 20 * 1000; // tolerates two tabs refreshing at the same moment
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12); // equalises timing for unknown emails

const email = z.string().trim().toLowerCase().email().max(254);
const strongPassword = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[A-Za-z]/, 'Must contain a letter')
  .regex(/\d/, 'Must contain a number');

const registerSchema = z.object({ name: z.string().trim().min(1).max(80), email, password: strongPassword });
const loginSchema = z.object({ email, password: z.string().min(1).max(72) });
const changePwSchema = z.object({ currentPassword: z.string().min(1).max(72), newPassword: strongPassword });

const refreshExpiry = () => new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

async function startSession(user, req, res) {
  const refresh = signRefresh(user._id);
  const now = new Date();
  const kept = (user.sessions || []).filter((s) => s.expiresAt > now).slice(-9);
  kept.push({
    hash: sha256(refresh),
    expiresAt: refreshExpiry(),
    device: String(req.headers['user-agent'] || '').slice(0, 120),
  });
  await User.updateOne({ _id: user._id }, { $set: { sessions: kept } });
  res.cookie(COOKIE_NAME, refresh, cookieOptions());
  return signAccess(user._id);
}

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email: addr, password } = req.body;
    if (await User.exists({ email: addr })) throw new HttpError(409, 'An account with this email already exists');
    const user = await User.create({ name, email: addr, password: await User.hashPassword(password) });
    const accessToken = await startSession(user, req, res);
    res.status(201).json({ accessToken, user });
  })
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email: addr, password } = req.body;
    const user = await User.findOne({ email: addr }).select('+password +sessions');
    const generic = new HttpError(401, 'Invalid email or password');

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw generic;
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
      throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.');
    }
    if (!(await user.verifyPassword(password))) {
      const failed = user.failedLogins + 1;
      await User.updateOne(
        { _id: user._id },
        failed >= MAX_FAILED
          ? { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS) } }
          : { $set: { failedLogins: failed } }
      );
      throw generic;
    }
    if (user.failedLogins || user.lockUntil) {
      await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockUntil: null } });
    }
    const accessToken = await startSession(user, req, res);
    res.json({ accessToken, user });
  })
);

router.post(
  '/refresh',
  requireXHR,
  asyncHandler(async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    const fail = () => {
      res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
      return new HttpError(401, 'Session expired');
    };
    if (!token) throw new HttpError(401, 'No session');

    let payload;
    try {
      payload = verifyRefresh(token);
    } catch {
      throw fail();
    }
    const user = await User.findById(payload.sub).select('+sessions');
    if (!user) throw fail();

    const now = new Date();
    const hash = sha256(token);
    const idx = user.sessions.findIndex((s) => s.hash === hash && s.expiresAt > now);
    if (idx === -1) {
      // Valid signature but unknown token => likely stolen/replayed. Revoke every session.
      await User.updateOne({ _id: user._id }, { $set: { sessions: [] } });
      throw fail();
    }

    const old = user.sessions[idx];
    const newRefresh = signRefresh(user._id);
    const sessions = user.sessions
      .filter((s) => s.expiresAt > now && s.hash !== hash)
      .concat([
        { hash, expiresAt: new Date(Math.min(old.expiresAt.getTime(), Date.now() + ROTATION_GRACE_MS)), device: old.device },
        { hash: sha256(newRefresh), expiresAt: refreshExpiry(), device: old.device },
      ])
      .slice(-12);
    await User.updateOne({ _id: user._id }, { $set: { sessions } });
    res.cookie(COOKIE_NAME, newRefresh, cookieOptions());
    res.json({ accessToken: signAccess(user._id), user });
  })
);

router.post(
  '/logout',
  requireXHR,
  asyncHandler(async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (token) {
      try {
        const { sub } = verifyRefresh(token);
        await User.updateOne({ _id: sub }, { $pull: { sessions: { hash: sha256(token) } } });
      } catch {
        /* ignore invalid token */
      }
    }
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  })
);

router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.userId }, { $set: { sessions: [] } });
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw new HttpError(401, 'Account not found');
    res.json({ user });
  })
);

router.post(
  '/change-password',
  requireAuth,
  validate(changePwSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).select('+password');
    if (!user || !(await user.verifyPassword(req.body.currentPassword))) {
      throw new HttpError(400, 'Current password is incorrect');
    }
    user.password = await User.hashPassword(req.body.newPassword);
    user.sessions = []; // sign out everywhere
    await user.save();
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  })
);

module.exports = router;
