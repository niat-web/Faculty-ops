// Google OAuth 2.0 (authorization-code flow), implemented directly against
// Google's endpoints so it plugs into the existing JWT-cookie session.
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET. Redirect URI defaults to
// `${APP_URL}/api/auth/google/callback` unless GOOGLE_REDIRECT_URI is set.

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin) {
  return process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || origin}/api/auth/google/callback`;
}

export function buildAuthUrl({ state, origin }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode({ code, origin }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("token_exchange_failed");
  return res.json(); // { access_token, id_token, ... }
}

export async function fetchUserInfo(accessToken) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("userinfo_failed");
  return res.json(); // { email, name, verified_email, ... }
}
