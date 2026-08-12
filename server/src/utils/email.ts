import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

function otpHtml(otp: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#12352B">Đặt lại mật khẩu</h2>
      <p>Mã OTP của bạn là:</p>
      <div style="font-size:36px;font-weight:900;letter-spacing:12px;color:#12352B;padding:16px;background:#EDF0E9;border-radius:12px;text-align:center">
        ${otp}
      </div>
      <p style="color:#6B7A70;font-size:13px">
        Mã có hiệu lực trong <strong>${env.OTP_EXPIRES_MIN} phút</strong>.<br>
        Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.
      </p>
    </div>
  `
}

async function sendViaBrevoApi(to: string, otp: string): Promise<void> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: env.BREVO_SENDER_NAME,
        email: env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: to }],
      subject: `Mã OTP đặt lại mật khẩu: ${otp}`,
      htmlContent: otpHtml(otp),
      textContent: `Mã OTP của bạn là: ${otp}\n\nMã có hiệu lực trong ${env.OTP_EXPIRES_MIN} phút.`,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo API ${res.status}: ${body}`)
  }
}

// SMTP transport (local dev fallback)
function createSmtpTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  // 1. Brevo HTTP API (production — no port blocked)
  if (env.BREVO_API_KEY) {
    console.log(`[EMAIL] Sending OTP to ${to} via Brevo API`)
    await sendViaBrevoApi(to, otp)
    console.log(`[EMAIL] Sent OK via Brevo API`)
    return
  }

  // 2. SMTP (local dev with SMTP_HOST set)
  if (env.SMTP_HOST) {
    console.log(`[EMAIL] Sending OTP to ${to} via ${env.SMTP_HOST}`)
    const transport = createSmtpTransport()
    const info = await transport.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject: `Mã OTP đặt lại mật khẩu: ${otp}`,
      text: `Mã OTP của bạn là: ${otp}\n\nMã có hiệu lực trong ${env.OTP_EXPIRES_MIN} phút.`,
      html: otpHtml(otp),
    })
    console.log(`[EMAIL] Sent OK — messageId: ${info.messageId}`)
    return
  }

  // 3. Dev mode — log to console
  console.log(`[DEV] OTP for ${to}: ${otp}`)
}
