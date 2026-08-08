import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

function createTransport() {
  if (env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  }
  // Dev fallback: log to console instead of sending
  return null
}

const transport = createTransport()

export interface EmailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  if (!transport) {
    console.log(`[Email dev] To: ${opts.to}\nSubject: ${opts.subject}\n${opts.text}`)
    return
  }
  await transport.sendMail({ from: env.EMAIL_FROM, ...opts })
}

export function notificationEmail(name: string, title: string, body: string): EmailOptions {
  return {
    subject: title,
    text: `Xin chào ${name},\n\n${title}\n${body}\n\n---\nHệ thống LMS Anh ngữ`,
    html: `<p>Xin chào <strong>${name}</strong>,</p>
<h3>${title}</h3>
<p>${body}</p>
<hr>
<small>Hệ thống LMS Anh ngữ</small>`,
    to: '',
  }
}
