import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'
import type { UserRole } from '../models/User.js'

export interface AccessTokenPayload {
  sub: string   // userId
  email: string
  role: UserRole
  name: string
}

// ─── Access Token (short-lived, 15m) ─────────────────────────────────────────
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    audience: 'lms-client',
    issuer: 'lms-server',
  } as jwt.SignOptions)
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    audience: 'lms-client',
    issuer: 'lms-server',
  }) as AccessTokenPayload
}

// ─── Refresh Token (long-lived, 7d) ──────────────────────────────────────────
// Raw token is a 64-byte random hex string (never a JWT — no info leakage)
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex')
}

export async function hashRefreshToken(raw: string): Promise<string> {
  return bcrypt.hash(raw, 10)
}

export async function verifyRefreshToken(raw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(raw, hash)
}

// ─── OTP ─────────────────────────────────────────────────────────────────────
export function generateOtp(): string {
  // Cryptographically random 6-digit code (zero-padded)
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────
export const REFRESH_COOKIE = 'lms_refresh'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// Production: frontend (Vercel) and backend (Railway) are on different domains,
// so we need SameSite=None + Secure to allow cross-domain cookies.
export const refreshCookieOptions: import('express').CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: SEVEN_DAYS_MS,
  path: '/api/auth',
}

export const clearCookieOptions: import('express').CookieOptions = {
  ...refreshCookieOptions,
  maxAge: 0,
}

// ─── Expiry helpers ───────────────────────────────────────────────────────────
export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + SEVEN_DAYS_MS)
}

export function accessTokenExpiresIn(): number {
  // Parse "15m" → seconds
  const raw = env.JWT_ACCESS_EXPIRES_IN
  if (raw.endsWith('m')) return parseInt(raw) * 60
  if (raw.endsWith('h')) return parseInt(raw) * 3600
  return 900
}
