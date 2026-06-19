// Set-password ("invite") links. New users are created without a usable
// password; an admin sends them a one-hour link to set their own. Reuses the
// password-reset token machinery.
import { makeResetToken } from "./crypto.js";
import { sendEmail } from "./email.js";

const ONE_HOUR = 60 * 60 * 1000;

// Stamp a fresh 1-hour set-password token onto a User doc (caller saves).
// Returns the plaintext token to put in the link.
export function stampSetPasswordToken(userDoc) {
  const { token, hash } = makeResetToken();
  userDoc.resetTokenHash = hash;
  userDoc.resetTokenExp = new Date(Date.now() + ONE_HOUR);
  userDoc.mustSetPassword = true;
  return token;
}

export function buildSetPasswordLink(base, token, email) {
  return `${base}/reset?token=${token}&email=${encodeURIComponent(email)}&setup=1`;
}

export async function sendSetPasswordEmail(user, link) {
  return sendEmail({
    to: user.email,
    subject: "Set your FacultyOps password",
    html:
      `<p>Hi ${user.name || ""},</p>` +
      `<p>Your FacultyOps (NIAT) account is ready. Click below to set your password and sign in. ` +
      `For security, this link is valid for <b>1 hour</b>.</p>` +
      `<p><a href="${link}">Set my password</a></p>` +
      `<p style="color:#64748b;font-size:12px">If the button doesn't work, paste this link:<br>${link}</p>` +
      `<p style="color:#94a3b8;font-size:12px">If you weren't expecting this, you can ignore this email.</p>`,
    text: `Set your FacultyOps password (valid 1 hour): ${link}`,
  });
}

// Convenience: stamp + save + email a single user. Returns the link + whether
// the email was actually delivered (false when SES isn't configured).
export async function inviteUser(userDoc, base) {
  const token = stampSetPasswordToken(userDoc);
  await userDoc.save();
  const link = buildSetPasswordLink(base, token, userDoc.email);
  let delivered = false;
  try { const r = await sendSetPasswordEmail(userDoc, link); delivered = !!r?.delivered; } catch { delivered = false; }
  return { link, delivered, email: userDoc.email };
}
