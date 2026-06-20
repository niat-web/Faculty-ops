// Google OAuth 2.0 (authorization-code flow) against Google's endpoints,
// plugging into the existing JWT-cookie session. Mirrors the old Next app.
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET. The redirect URI must point
// at THIS backend's /api/auth/google/callback (set GOOGLE_REDIRECT_URI in prod).

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;
}

export function buildAuthUrl({ state, origin }: { state: string; origin: string }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode({ code, origin }: { code: string; origin: string }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("token_exchange_failed");
  return res.json() as Promise<{ access_token: string; id_token?: string }>;
}

export async function fetchUserInfo(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("userinfo_failed");
  return res.json() as Promise<{ email?: string; name?: string; verified_email?: boolean }>;
}
