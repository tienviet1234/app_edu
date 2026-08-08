import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

function createTransport() {
  if (!env.SMTP_HOST) {
    // Development: log to console instead of sending
    return nodemailer.createTransport({ jsonTransport: true })
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  })
}

const transport = createTransport()

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const info = await transport.sendMail({
    from: `"LMS Hệ thống" <${env.EMAIL_FROM}>`,
    to,
    subject: `Mã OTP đặt lại mật khẩu: ${otp}`,
    text: `Mã OTP của bạn là: ${otp}\n\nMã có hiệu lực trong ${env.OTP_EXPIRES_MIN} phút.\nNếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.`,
    html: `
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
    `,
  })

  // In dev (jsonTransport), log the OTP so devs can test without SMTP
  if (!env.SMTP_HOST) {
    console.log(`[DEV] OTP for ${to}: ${otp}`)
    console.log('[DEV] Email preview:', JSON.stringify(info))
  }
}
