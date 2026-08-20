import nodemailer from 'nodemailer';

interface SendInviteParams {
  to: string;
  groupName: string;
  inviterName: string;
  inviteToken: string;
  appUrl?: string;
}

export function isSmtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

export function getEmailTransporter() {
  if (!isSmtpConfigured()) {
    return null;
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

export async function sendGroupInviteEmail({
  to,
  groupName,
  inviterName,
  inviteToken,
  appUrl,
}: SendInviteParams): Promise<{ success: boolean; smtpConfigured: boolean; messageId?: string; error?: string; inviteUrl: string }> {
  // Always ensure the public base URL is used, replacing private dev domains (ais-dev-) with shared public domains (ais-pre-)
  let cleanBaseUrl = (appUrl || process.env.APP_URL || 'https://ais-pre-qdpb2el4fke3xc6he2fbsw-971083840159.asia-southeast1.run.app').trim().replace(/\/$/, '');
  if (cleanBaseUrl.includes('ais-dev-')) {
    cleanBaseUrl = cleanBaseUrl.replace('ais-dev-', 'ais-pre-');
  }
  const inviteUrl = `${cleanBaseUrl}/?invite=${inviteToken}`;

  const smtpReady = isSmtpConfigured();
  if (!smtpReady) {
    console.log(
      `[SMTP NOTICE] SMTP is not configured. Invitation created for ${to}. Direct invite URL: ${inviteUrl}`
    );
    return {
      success: false,
      smtpConfigured: false,
      error: 'SMTP not configured in environment variables. Share the direct link or member will auto-join upon login with this Gmail ID.',
      inviteUrl,
    };
  }

  try {
    const transporter = getEmailTransporter();
    if (!transporter) {
      return {
        success: false,
        smtpConfigured: false,
        error: 'Transporter could not be initialized.',
        inviteUrl,
      };
    }

    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@marathwada.app';

    const info = await transporter.sendMail({
      from: `"Sunny (सन्नी) - Marathwada Katta" <${fromAddress}>`,
      to,
      subject: `[Invitation] ${inviterName} ने तुम्हाला "${groupName}" कट्ट्यावर आमंत्रित केले आहे!`,
      text: `नमस्कार!\n\n${inviterName} ने तुम्हाला "${groupName}" Marathwada Katta ग्रुपवर आमंत्रित केले आहे.\n\nग्रुपमध्ये सामील होण्यासाठी खालील लिंकवर क्लिक करा:\n${inviteUrl}\n\nसन्नी (Sunny) AI Voice Companion`,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 32px 20px; border-radius: 16px; max-width: 540px; margin: 0 auto; border: 1px solid #27272a;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #f59e0b; margin: 0; font-size: 24px;">मराठवाडा कट्टा (Marathwada Katta)</h1>
            <p style="color: #a1a1aa; font-size: 14px; margin-top: 4px;">Sunny (सन्नी) AI Voice Companion</p>
          </div>
          
          <div style="background-color: #18181b; border: 1px solid #3f3f46; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="font-size: 16px; margin: 0 0 12px 0; color: #fafafa;">
              <strong>${inviterName}</strong> ने तुम्हाला <strong>"${groupName}"</strong> कट्ट्यावर आमंत्रित केले आहे!
            </p>
            <p style="font-size: 14px; color: #d4d4d8; line-height: 1.5; margin: 0;">
              मित्रांसोबत मनमोकळ्या गप्पा, चर्चा आणि सन्नी सोबत रिअल-टाईम व्हॉईस संवाद साधण्यासाठी आत्ताच सामील व्हा.
            </p>
          </div>

          <div style="text-align: center; margin-bottom: 28px;">
            <a href="${inviteUrl}" style="background-color: #f59e0b; color: #09090b; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; display: inline-block;">
              कट्ट्यावर सामील व्हा (Join Circle)
            </a>
          </div>

          <p style="font-size: 12px; color: #71717a; text-align: center; word-break: break-all; margin: 0;">
            किंवा ही लिंक थेट ब्राऊझरमध्ये उघडा:<br/>
            <a href="${inviteUrl}" style="color: #fbbf24;">${inviteUrl}</a>
          </p>
        </div>
      `,
    });

    console.log(`[SMTP] Invitation email sent to ${to}: ${info.messageId}`);
    return {
      success: true,
      smtpConfigured: true,
      messageId: info.messageId,
      inviteUrl,
    };
  } catch (err: any) {
    console.error(`[SMTP ERROR] Failed to send email to ${to}:`, err);
    return {
      success: false,
      smtpConfigured: true,
      error: err?.message || 'SMTP delivery failed',
      inviteUrl,
    };
  }
}
