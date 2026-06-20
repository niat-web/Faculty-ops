import { Router } from "express";
import { User } from "../models";
import { hashPassword, passwordIssue, verifyPassword, signSession, setSessionCookie, clearSessionCookie } from "../lib/auth";
import { hashResetToken, encrypt, maybeDecrypt } from "../lib/crypto";
import { recordLogin } from "../lib/services";
import { isLocked, recordFailure, clearFailures } from "../lib/throttle";
import { generateSecret, verifyToken, verifyTokenCounter, otpauthURL } from "../lib/totp";
import { googleConfigured, buildAuthUrl, exchangeCode, fetchUserInfo } from "../lib/google";
import { requireUser } from "../middleware";
import { isRoleEnabled, ROLE_DISABLED_MSG } from "../lib/settings";
import { config } from "../config";
import crypto from "crypto";

const router = Router();

const reqOrigin = (req: any) => `${req.protocol}://${req.get("host")}`;

// Whether the "Continue with Google" button should show.
router.get("/google/status", (_req, res) => res.json({ enabled: googleConfigured() }));

// Start Google sign-in: set a CSRF state cookie, redirect to Google's consent.
router.get("/google", (req, res) => {
  const origin = reqOrigin(req);
  if (!googleConfigured()) return res.redirect(303, `${config.appUrl}/login?error=google_unconfigured`);
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("g_oauth_state", state, { httpOnly: true, sameSite: config.isProd ? "none" : "lax", secure: config.isProd, path: "/", maxAge: 600000 });
  res.redirect(303, buildAuthUrl({ state, origin }));
});

// Google redirects back here with ?code & ?state.
router.get("/google/callback", async (req, res) => {
  const origin = reqOrigin(req);
  const fail = (e: string) => res.redirect(303, `${config.appUrl}/login?error=${e}`);
  if (!googleConfigured()) return fail("google_unconfigured");
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const saved = req.cookies?.g_oauth_state;
  res.cookie("g_oauth_state", "", { path: "/", maxAge: 0 });
  if (req.query.error || !code || !state || !saved || state !== saved) return fail("google_failed");

  let email = "";
  try {
    const tokens = await exchangeCode({ code, origin });
    const info = await fetchUserInfo(tokens.access_token);
    if (info.verified_email === false) return fail("google_failed");
    email = String(info.email || "").toLowerCase();
  } catch { return fail("google_failed"); }
  if (!email) return fail("google_failed");

  // Access is admin-managed: only sign in if a matching, active user exists.
  const user = await User.findOne({ email });
  if (!user || !user.active) return fail("google_noaccount");
  if (!(await isRoleEnabled(user.role))) return fail("role_disabled");
  setSessionCookie(res, signSession(user));
  await recordLogin(user, "google", req);
  res.redirect(303, `${config.appUrl}/app`);
});

// Current user (used by the React app on load).
router.get("/me", async (req, res) => {
  if (!req.user) return res.status(401).json({ user: null });
  const enabled = await isRoleEnabled(req.user.role);
  res.json({ user: req.user, blocked: !enabled, message: enabled ? undefined : ROLE_DISABLED_MSG });
});

// Email + password login (with lockout + optional TOTP 2FA).
router.post("/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const token = String(req.body?.token || "").trim();
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const ip = req.ip || "?";
  const key = `pw:${email}|${ip}`;       // password-stage lockout
  const otpKey = `2fa:${email}|${ip}`;    // separate OTP-stage lockout
  const lockedFor = await isLocked(key);
  if (lockedFor) return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(lockedFor / 60)} min.` });

  const user = await User.findOne({ email });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    await recordFailure(key);
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Role-level access gate (admin can disable a whole role in Settings → Account Access).
  if (!(await isRoleEnabled(user.role))) {
    await clearFailures(key);
    return res.status(403).json({ error: ROLE_DISABLED_MSG });
  }

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    if (!token) return res.status(200).json({ twoFactorRequired: true });
    if (await isLocked(otpKey)) return res.status(429).json({ error: "Too many code attempts. Try again later.", twoFactorRequired: true });
    const counter = verifyTokenCounter(maybeDecrypt(user.twoFactorSecret), token);
    // Reject invalid codes AND already-used counters (replay protection).
    if (counter === null || counter <= (user.twoFactorLastCounter || 0)) {
      await recordFailure(otpKey);
      return res.status(401).json({ error: "Invalid authentication code.", twoFactorRequired: true });
    }
    user.twoFactorLastCounter = counter;
    await user.save();
    await clearFailures(otpKey);
  }

  await clearFailures(key);
  setSessionCookie(res, signSession(user));
  await recordLogin(user, user.twoFactorEnabled ? "password+2fa" : "password", req);
  res.json({ ok: true, user: { id: String(user._id), email: user.email, name: user.name, role: user.role } });
});

// --- Two-factor (TOTP) management for the signed-in user ---
router.get("/2fa/setup", requireUser(), async (req, res) => {
  const me: any = await User.findById(req.user!.id);
  if (!me) return res.status(404).json({ error: "Not found" });
  const secret = generateSecret();
  me.twoFactorSecret = encrypt(secret); // staged; only flips `enabled` once a code is verified
  await me.save();
  res.json({ secret, otpauth: otpauthURL(secret, me.email) });
});

router.post("/2fa/enable", requireUser(), async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const me: any = await User.findById(req.user!.id);
  if (!me?.twoFactorSecret) return res.status(400).json({ error: "Start setup first." });
  const counter = verifyTokenCounter(maybeDecrypt(me.twoFactorSecret), token);
  if (counter === null) return res.status(400).json({ error: "Invalid code — try again." });
  me.twoFactorEnabled = true;
  me.twoFactorLastCounter = counter; // seed replay protection
  await me.save();
  res.json({ ok: true });
});

// Disable requires BOTH the password and a current authenticator code (step-up).
router.post("/2fa/disable", requireUser(), async (req, res) => {
  const password = String(req.body?.password || "");
  const token = String(req.body?.token || "").trim();
  const me: any = await User.findById(req.user!.id);
  if (!me || !(await verifyPassword(password, me.passwordHash))) return res.status(401).json({ error: "Password incorrect." });
  if (me.twoFactorEnabled && me.twoFactorSecret) {
    if (verifyTokenCounter(maybeDecrypt(me.twoFactorSecret), token) === null) return res.status(400).json({ error: "Enter a valid current authenticator code to disable." });
  }
  me.twoFactorEnabled = false;
  me.twoFactorSecret = null;
  me.twoFactorLastCounter = 0;
  await me.save();
  res.json({ ok: true });
});

router.get("/2fa/status", requireUser(), async (req, res) => {
  const me: any = await User.findById(req.user!.id).select("twoFactorEnabled").lean();
  res.json({ enabled: !!me?.twoFactorEnabled });
});

router.post("/logout", (_req, res) => { clearSessionCookie(res); res.json({ ok: true }); });

// Request a set-password / reset link (always 200 — never reveals if email exists).
router.post("/forgot", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const user = email ? await User.findOne({ email }) : null;
  if (user && user.active) {
    const { makeResetToken } = await import("../lib/crypto");
    const { token, hash } = makeResetToken();
    user.resetTokenHash = hash;
    user.resetTokenExp = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const { buildSetPasswordLink, sendSetPasswordEmail } = await import("../lib/invites");
    const { config } = await import("../config");
    await sendSetPasswordEmail(user, buildSetPasswordLink(config.appUrl, token, email));
  }
  res.json({ ok: true });
});

// Complete a password set/reset using the emailed token.
router.post("/reset", async (req, res) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  if (!token) return res.status(400).json({ error: "Invalid link." });
  const issue = passwordIssue(password);
  if (issue) return res.status(400).json({ error: issue });

  const user = await User.findOne({ resetTokenHash: hashResetToken(token), resetTokenExp: { $gt: new Date() } });
  if (!user) return res.status(400).json({ error: "This link is invalid or has expired." });

  user.passwordHash = await hashPassword(password);
  user.resetTokenHash = null;
  user.resetTokenExp = null;
  user.mustSetPassword = false;
  await user.save();
  res.json({ ok: true });
});

export default router;
