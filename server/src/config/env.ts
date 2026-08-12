import 'dotenv/config'

function required(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  MONGO_URI: required('MONGO_URI'),

  // JWT
  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  // OTP
  OTP_EXPIRES_MIN: Number(process.env.OTP_EXPIRES_MIN ?? 10),

  // Email — Brevo HTTP API (preferred) or SMTP fallback
  BREVO_API_KEY: process.env.BREVO_API_KEY ?? '',
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL ?? '',
  BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME ?? 'EDU Portal',
  // SMTP kept for local dev / fallback
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'no-reply@lms.local',

  // Admin invite code (required to register as admin)
  ADMIN_INVITE_CODE: required('ADMIN_INVITE_CODE'),

  // CORS
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',

  // Web Push (VAPID) — optional, push disabled if not set
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? '',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? 'mailto:admin@lms.local',
} as const
