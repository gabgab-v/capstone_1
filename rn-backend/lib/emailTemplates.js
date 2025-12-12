const BRAND_NAME = process.env.BRAND_NAME || 'Pabukid';
const BRAND_COLOR = process.env.EMAIL_BRAND_COLOR || '#2e7d32';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || null;

function safeName(name) {
  if (!name || typeof name !== 'string') return 'there';
  const trimmed = name.trim();
  return trimmed.length ? trimmed : 'there';
}

export function buildConfirmEmailTemplate({ name, actionLink }) {
  const userName = safeName(name);
  const accent = BRAND_COLOR;
  const faintAccent = '#e9f5ec';
  const previewText = `Confirm your ${BRAND_NAME} account`;
  const subject = `${BRAND_NAME} email confirmation`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
    <style>
      a.button {
        display: inline-block;
        background: ${accent};
        color: #ffffff !important;
        padding: 14px 18px;
        border-radius: 10px;
        font-weight: 700;
        letter-spacing: 0.2px;
        text-decoration: none;
        box-shadow: 0 10px 30px rgba(46, 125, 50, 0.22);
      }
      .card {
        border-radius: 14px;
        border: 1px solid #e5e7eb;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f6f8fb;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
    <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;color:transparent;overflow:hidden;">
      ${previewText}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" class="card" style="background:#ffffff;padding:32px;">
            <tr>
              <td align="left" style="padding-bottom:18px;">
                <div style="display:inline-block;padding:8px 12px;border-radius:9999px;background:${faintAccent};color:${accent};font-size:13px;font-weight:700;letter-spacing:0.3px;">${BRAND_NAME}</div>
              </td>
            </tr>
            <tr>
              <td style="font-size:22px;font-weight:800;padding-bottom:12px;">Confirm your email</td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.7;color:#1f2937;padding-bottom:12px;">
                Hi ${userName},
                <br /><br />
                Welcome to ${BRAND_NAME}! Tap the button below to verify your email and start exploring curated trails and groups safely.
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:12px 0 26px 0;">
                <a class="button" href="${actionLink}" target="_blank" rel="noopener">Confirm email</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:1.6;color:#475569;padding-bottom:18px;">
                If the button does not work, copy and paste this link into your browser:
                <br />
                <a href="${actionLink}" style="color:${accent};word-break:break-all;">${actionLink}</a>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:12px;color:#64748b;line-height:1.6;">
                Need help? ${SUPPORT_EMAIL ? `Email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:${accent};">${SUPPORT_EMAIL}</a>` : 'Reply to this message'} and we will get back to you.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    previewText,
    '',
    `Hi ${userName},`,
    `Welcome to ${BRAND_NAME}! Confirm your email to finish setting up your account.`,
    actionLink,
    '',
    SUPPORT_EMAIL ? `Questions? Reach us at ${SUPPORT_EMAIL}.` : 'You can reply to this email if you need help.',
  ].join('\n');

  return { subject, previewText, html, text };
}
