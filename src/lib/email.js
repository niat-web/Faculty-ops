// AWS SES email sender. If credentials are not configured, it logs instead of
// sending — so the app works end-to-end before you add SES secrets to .env.

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) return null;
  // Lazy import keeps the SDK out of the edge/runtime bundle when unused.
  // eslint-disable-next-line global-require
  const { SESClient } = require("@aws-sdk/client-ses");
  cachedClient = new SESClient({
    region: AWS_REGION || "ap-south-1",
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
  });
  return cachedClient;
}

export async function sendEmail({ to, subject, html, text }) {
  if (!to) return;
  const from = process.env.SES_FROM_EMAIL || "no-reply@example.com";
  const client = getClient();

  if (!client) {
    console.log(`[email:dev] To:${to} | ${subject}`);
    return { delivered: false, reason: "SES not configured" };
  }
  try {
    const { SendEmailCommand } = require("@aws-sdk/client-ses");
    await client.send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: {
            Html: { Data: html || text || subject },
            Text: { Data: text || subject },
          },
        },
      })
    );
    return { delivered: true };
  } catch (e) {
    console.error("[email] SES send failed:", e.message);
    return { delivered: false, reason: e.message };
  }
}
