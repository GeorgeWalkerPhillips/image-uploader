// Shared branded HTML shell for every Valere email, so send-event-created-email,
// paystack-webhook's receipt, and purge-expired-events' archive email all
// look like one product instead of three ad-hoc templates. Email clients
// (especially Gmail/Outlook) strip <style> blocks and don't support
// backdrop-filter/box-shadow/custom fonts the way the app's own CSS does,
// so this is a simplified, inline-styled approximation of the app's look
// (serif italic wordmark, black pill buttons, soft card) rather than a
// literal port of Login.module.css.

const BRAND_NAME = "Valere";
const SERIF_STACK = "Georgia, 'Times New Roman', serif";
const SANS_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export function wrapEmail(bodyHtml: string) {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f3f1;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f3f1;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background-color:#ffffff;border-radius:20px;border:1px solid #e8e6e2;">
            <tr>
              <td style="padding:40px 40px 8px;text-align:center;">
                <div style="font-family:${SERIF_STACK};font-style:italic;font-weight:700;font-size:30px;letter-spacing:0.02em;color:#111111;">${BRAND_NAME}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 40px;color:#333333;font-family:${SANS_STACK};font-size:15px;line-height:1.65;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px;background-color:#fafaf8;border-top:1px solid #f0efec;border-radius:0 0 20px 20px;text-align:center;">
                <p style="margin:0;color:#999999;font-size:12px;font-family:${SANS_STACK};">${BRAND_NAME} &middot; photos from your people, in one place</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function emailHeading(text: string) {
  return `<h1 style="margin:0 0 16px;font-family:${SERIF_STACK};font-style:italic;font-weight:600;font-size:22px;color:#111111;">${text}</h1>`;
}

export function emailButton(url: string, label: string) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:30px;background-color:#111111;">
          <a href="${url}" style="display:inline-block;padding:14px 30px;font-family:${SANS_STACK};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:30px;">${label}</a>
        </td>
      </tr>
    </table>`;
}

export function emailFootnote(text: string) {
  return `<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #f0efec;color:#999999;font-size:12px;line-height:1.6;font-family:${SANS_STACK};">${text}</p>`;
}

// Public QR-image API, no key required — simplest reliable way to get a QR
// PNG into an email (most clients load remote <img> fine; generating and
// inlining/attaching one from a Deno QR library is possible but adds a
// dependency for no real benefit here). Swap for a self-hosted generator
// later if this third-party dependency becomes a concern.
export function qrCodeImage(dataUrl: string, size = 220) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(dataUrl)}`;
  return `<img src="${src}" width="${size}" height="${size}" alt="QR code to join the event" style="display:block;margin:20px auto;border-radius:12px;border:1px solid #e8e6e2;" />`;
}
