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

  // Email (nodemailer – optional, logs to console in dev)
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'no-reply@lms.local',

  // Admin invite code (required to register as admin)
  ADMIN_INVITE_CODE: process.env.ADMIN_INVITE_CODE ?? 'ADMIN2024',

  // CORS
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? 'BJ0s90OgKNNRCPMxoH5JDH33GHK11IxzwdhgWaNBKaD__nEMvAikn6bn0yxZ-Lyz7P88_viKDUXpkLXE8O2Yj-s',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? 'Ebht2REQdY82Fv9dcdyTxyAaNhYp9caIoR38XcY5P3g',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? 'mailto:admin@lms.local',
} as const
