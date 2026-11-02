'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { HttpError } = require('./errors');

const COOKIE_NAME = 'qrmenu_sid';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const FAILURE_WINDOW_MS = 60 * 1000;
const MAX_FAILURES = 5;

const sha256 = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest();

/**
 * Password login with in-memory sessions. Sessions vanish on restart, which only
 * means the admin logs in again. Failed logins are limited per IP.
 */
function createAuth({ password }) {
  const passwordHash = sha256(password);
  const sessions = new Map(); // token -> expiresAt
  const failures = new Map(); // ip -> timestamps of recent failed logins

  function sweep(now = Date.now()) {
    for (const [token, expiresAt] of sessions) if (expiresAt <= now) sessions.delete(token);
    for (const [ip, times] of failures) {
      const recent = times.filter((t) => now - t < FAILURE_WINDOW_MS);
      if (recent.length) failures.set(ip, recent);
      else failures.delete(ip);
    }
  }
  const sweeper = setInterval(sweep, 5 * 60 * 1000);
  sweeper.unref();

  function isValidSession(req) {
    const token = req.cookies?.[COOKIE_NAME];
    if (typeof token !== 'string') return false;
    const expiresAt = sessions.get(token);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function requireAdmin(req, res, next) {
    if (!isValidSession(req)) {
      next(new HttpError(401, 'Bu işlem için giriş yapmalısınız.'));
      return;
    }
    next();
  }

  const router = express.Router();

  router.post('/login', (req, res) => {
    const now = Date.now();
    const ip = req.ip || 'unknown';
    const recent = (failures.get(ip) || []).filter((t) => now - t < FAILURE_WINDOW_MS);
    if (recent.length >= MAX_FAILURES) {
      const retryAfter = Math.ceil((recent[0] + FAILURE_WINDOW_MS - now) / 1000);
      res.set('Retry-After', String(Math.max(retryAfter, 1)));
      throw new HttpError(429, 'Çok fazla hatalı deneme yapıldı. Lütfen bir dakika sonra tekrar deneyin.');
    }

    const given = req.body?.password;
    const ok = typeof given === 'string' && given.length > 0 && crypto.timingSafeEqual(sha256(given), passwordHash);
    if (!ok) {
      recent.push(now);
      failures.set(ip, recent);
      throw new HttpError(401, 'Şifre hatalı.');
    }

    failures.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, now + SESSION_TTL_MS);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
    res.json({ authenticated: true });
  });

  router.post('/logout', (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (typeof token === 'string') sessions.delete(token);
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' });
    res.json({ authenticated: false });
  });

  router.get('/me', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ authenticated: isValidSession(req) });
  });

  return { router, requireAdmin };
}

module.exports = { createAuth, COOKIE_NAME };
