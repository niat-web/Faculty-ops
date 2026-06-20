import { makeResetToken } from "./crypto";
import { sendEmail } from "./email";

const ONE_HOUR = 60 * 60 * 1000;

export function stampSetPasswordToken(userDoc: any) {
  const { token, hash } = makeResetToken();
  userDoc.resetTokenHash = hash;
  userDoc.resetTokenExp = new Date(Date.now() + ONE_HOUR);
  userDoc.mustSetPassword = true;
  return token;
}
export function buildSetPasswordLink(base: string, token: string, email: string) {
  return `${base}/reset?token=${token}&email=${encodeURIComponent(email)}&setup=1`;
}
export async function sendSetPasswordEmail(user: { email: string; name?: string }, link: string) {
  return sendEmail({
    to: user.email, subject: "Set your FacultyOps password",
    html: `<p>Hi ${user.name || ""},</p><p>Your FacultyOps (NIAT) account is ready. Click below to set your password and sign in. For security, this link is valid for <b>1 hour</b>.</p><p><a href="${link}">Set my password</a></p><p style="color:#64748b;font-size:12px">If the button doesn't work, paste this link:<br>${link}</p>`,
    text: `Set your FacultyOps password (valid 1 hour): ${link}`,
  });
}
export async function inviteUser(userDoc: any, base: string) {
  const token = stampSetPasswordToken(userDoc);
  await userDoc.save();
  const link = buildSetPasswordLink(base, token, userDoc.email);
  let delivered = false;
  try { const r = await sendSetPasswordEmail(userDoc, link); delivered = !!(r as any)?.delivered; } catch { delivered = false; }
  return { link, delivered, email: userDoc.email };
}
