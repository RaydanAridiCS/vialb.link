/**
 * HTML and plain-text auth emails. Table layout with inline styles so they
 * render in Gmail, Apple Mail, Outlook and mobile clients.
 */

export interface VerificationEmailProps {
  appName: string;
  siteUrl: string;
  verificationUrl: string;
  userEmail: string;
  userName?: string | null;
}

export interface PasswordResetEmailProps {
  appName: string;
  siteUrl: string;
  resetUrl: string;
  userEmail: string;
  userName?: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Plain-text greeting; HTML-escape it before putting it in the HTML body. */
function greet(userName?: string | null): string {
  return userName ? `Hi ${userName},` : "Hi there,";
}

export function renderVerificationEmail({
  appName,
  siteUrl,
  verificationUrl,
  userEmail,
  userName,
}: VerificationEmailProps): { text: string; html: string } {
  const greeting = escapeHtml(greet(userName));
  const escapedEmail = escapeHtml(userEmail);
  const escapedApp = escapeHtml(appName);
  const escapedInitial = escapeHtml(appName.charAt(0).toUpperCase());
  const escapedUrl = escapeHtml(verificationUrl);
  const escapedSiteUrl = escapeHtml(siteUrl);

  const text = [
    greet(userName),
    "",
    `Thank you for creating an account on ${appName}!`,
    `Please confirm your email address (${userEmail}) to activate your account:`,
    "",
    verificationUrl,
    "",
    "This link will expire in 1 hour.",
    `If you did not sign up for ${appName}, you can safely ignore this email.`,
    "",
    `The ${appName} team`,
    siteUrl,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your ${escapedApp} email</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f7f6f3;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    table { border-collapse: collapse; }
    a { color: #166534; text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f7f6f3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #e7e5e0; box-shadow: 0 4px 20px rgba(0,0,0,0.04); overflow: hidden;" cellpadding="0" cellspacing="0" border="0">
          
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 36px 36px 20px 36px; text-align: left;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <!-- Brand Icon Tile -->
                    <div style="width: 38px; height: 38px; background-color: #166534; border-radius: 10px; text-align: center; line-height: 38px; display: inline-block;">
                      <span style="color: #ffffff; font-size: 20px; font-weight: bold; line-height: 38px;">${escapedInitial}</span>
                    </div>
                  </td>
                  <td style="vertical-align: middle; padding-left: 12px;">
                    <span style="font-size: 19px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">${escapedApp}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 10px 36px 36px 36px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Verify your email address
              </h1>
              
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                ${greeting}
              </p>
              
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                Thanks for starting with <strong>${escapedApp}</strong>! Please verify that <strong style="color: #0f172a;">${escapedEmail}</strong> belongs to you by clicking the button below.
              </p>

              <!-- Call to Action Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 32px 0;">
                <tr>
                  <td align="left" style="border-radius: 8px; background-color: #166534;">
                    <a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background-color: #166534; letter-spacing: 0.2px;">
                      Verify email address &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct Link -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin: 0 0 24px 0;">
                <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b; font-weight: 500;">
                  If the button above doesn't work, copy and paste this URL into your browser:
                </p>
                <p style="margin: 0; font-size: 12px; line-height: 1.4; word-break: break-all;">
                  <a href="${escapedUrl}" style="color: #166534; text-decoration: underline;">${escapedUrl}</a>
                </p>
              </div>

              <!-- Security Notice -->
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                This verification link expires in <strong>1 hour</strong>.<br>
                If you didn't create a ${escapedApp} account, no action is needed and you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px; background-color: #fafaf9; border-top: 1px solid #e7e5e0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                ${escapedApp} &bull; The simple, privacy-friendly open-source link shortener<br>
                <a href="${escapedSiteUrl}" style="color: #64748b; text-decoration: underline;">${escapedSiteUrl}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}

export function renderPasswordResetEmail({
  appName,
  siteUrl,
  resetUrl,
  userEmail,
  userName,
}: PasswordResetEmailProps): { text: string; html: string } {
  const greeting = escapeHtml(greet(userName));
  const escapedEmail = escapeHtml(userEmail);
  const escapedApp = escapeHtml(appName);
  const escapedInitial = escapeHtml(appName.charAt(0).toUpperCase());
  const escapedUrl = escapeHtml(resetUrl);
  const escapedSiteUrl = escapeHtml(siteUrl);

  const text = [
    greet(userName),
    "",
    `Someone requested a password reset for your ${appName} account (${userEmail}).`,
    "Click the link below to set a new password (valid for 1 hour):",
    "",
    resetUrl,
    "",
    `If you didn't request a password reset, you can safely ignore this email.`,
    "",
    `The ${appName} team`,
    siteUrl,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your ${escapedApp} password</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f7f6f3;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    table { border-collapse: collapse; }
    a { color: #166534; text-decoration: none; }
  </style>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f7f6f3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #e7e5e0; box-shadow: 0 4px 20px rgba(0,0,0,0.04); overflow: hidden;" cellpadding="0" cellspacing="0" border="0">
          
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 36px 36px 20px 36px; text-align: left;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <div style="width: 38px; height: 38px; background-color: #166534; border-radius: 10px; text-align: center; line-height: 38px; display: inline-block;">
                      <span style="color: #ffffff; font-size: 20px; font-weight: bold; line-height: 38px;">${escapedInitial}</span>
                    </div>
                  </td>
                  <td style="vertical-align: middle; padding-left: 12px;">
                    <span style="font-size: 19px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">${escapedApp}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 10px 36px 36px 36px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Reset your password
              </h1>
              
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                ${greeting}
              </p>
              
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                We received a request to reset the password for your ${escapedApp} account associated with <strong style="color: #0f172a;">${escapedEmail}</strong>. Click the button below to choose a new password.
              </p>

              <!-- Call to Action Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 32px 0;">
                <tr>
                  <td align="left" style="border-radius: 8px; background-color: #166534;">
                    <a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background-color: #166534; letter-spacing: 0.2px;">
                      Reset password &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct Link -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin: 0 0 24px 0;">
                <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b; font-weight: 500;">
                  If the button doesn't work, copy and paste this URL into your browser:
                </p>
                <p style="margin: 0; font-size: 12px; line-height: 1.4; word-break: break-all;">
                  <a href="${escapedUrl}" style="color: #166534; text-decoration: underline;">${escapedUrl}</a>
                </p>
              </div>

              <!-- Security Notice -->
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                This reset link expires in <strong>1 hour</strong>.<br>
                If you didn't request a password reset, you can safely disregard this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px; background-color: #fafaf9; border-top: 1px solid #e7e5e0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                ${escapedApp} &bull; The simple, privacy-friendly open-source link shortener<br>
                <a href="${escapedSiteUrl}" style="color: #64748b; text-decoration: underline;">${escapedSiteUrl}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}
