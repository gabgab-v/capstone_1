const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Pabukid <no-reply@pabukid.app>';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || null;

export function isEmailServiceConfigured() {
  return Boolean(RESEND_API_KEY && EMAIL_FROM);
}

export async function sendTransactionalEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      message: 'Email service is not configured.',
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
        text,
        ...(EMAIL_REPLY_TO ? { reply_to: EMAIL_REPLY_TO } : {}),
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Resend error response:', payload);
      return {
        ok: false,
        code: 'DELIVERY_FAILED',
        message:
          payload?.message ||
          payload?.error ||
          'Unable to send email through the configured provider.',
      };
    }

    return { ok: true, code: 'SENT', id: payload?.id ?? null };
  } catch (error) {
    console.error('Resend request failed:', error);
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Email provider request failed.',
    };
  }
}
