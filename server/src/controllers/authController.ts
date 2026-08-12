import type { Request, Response } from 'express'
import { z } from 'zod'
import { Types } from 'mongoose'
import { User } from '../models/User.js'
import { InviteToken } from '../models/InviteToken.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { OtpToken } from '../models/OtpToken.js'
import { env } from '../config/env.js'
import {
  signAccessToken, generateRefreshToken, hashRefreshToken, verifyRefreshToken,
  generateOtp, refreshTokenExpiry, accessTokenExpiresIn,
  REFRESH_COOKIE, refreshCookieOptions, clearCookieOptions,
} from '../utils/jwt.js'
import { sendOtpEmail } from '../utils/email.js'
import { ok, badRequest, unauthorized, serverError } from '../utils/response.js'

// ─── Validation schemas ───────────────────────────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  role: z.enum(['admin', 'teacher', 'student', 'parent']).default('teacher'),
  inviteCode: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
})

const forgotSchema = z.object({
  email: z.string().email().toLowerCase(),
})

const verifyOtpSchema = z.object({
  email: z.string().email().toLowerCase(),
  otp: z.string().length(6),
})

const resetSchema = z.object({
  email: z.string().email().toLowerCase(),
  otp: z.string().length(6),
  newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
})

// ─── Shared: issue tokens + set cookie ───────────────────────────────────────
async function issueTokens(
  user: InstanceType<typeof User>,
  req: Request,
  res: Response,
): Promise<void> {
  // Access token (in-body)
  const accessToken = signAccessToken({
    sub: String(user._id),
    email: user.email,
    role: user.role,
    name: user.name,
  })

  // Refresh token (httpOnly cookie)
  const rawRefresh = generateRefreshToken()
  const tokenHash = await hashRefreshToken(rawRefresh)
  await RefreshToken.create({
    userId: user._id,
    tokenHash,
    tokenPrefix: rawRefresh.slice(0, 16), // index key for O(1) lookup
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    expiresAt: refreshTokenExpiry(),
  })

  res.cookie(REFRESH_COOKIE, rawRefresh, refreshCookieOptions)

  ok(res, {
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
    },
    accessToken,
    expiresIn: accessTokenExpiresIn(),
  })
}

// ─── POST /auth/register ──────────────────────────────────────────────────────
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      badRequest(res, 'Dữ liệu không hợp lệ', parsed.error.flatten().fieldErrors as Record<string, string>)
      return
    }
    const { name, email, password, role, inviteCode } = parsed.data
    const codeInput = inviteCode?.trim()

    // ── Resolve effective role via invite code ────────────────────────────────
    let effectiveRole = role
    let teacherToken: InstanceType<typeof InviteToken> | null = null

    if (codeInput) {
      if (codeInput === env.ADMIN_INVITE_CODE.trim()) {
        // Static admin invite code
        effectiveRole = 'admin'
      } else {
        // Try to atomically claim a teacher InviteToken
        teacherToken = await InviteToken.findOneAndUpdate(
          {
            code: codeInput.toUpperCase(),
            isRevoked: false,
            usedAt: { $exists: false },
            expiresAt: { $gt: new Date() },
          },
          { $set: { usedAt: new Date() } },
          { new: true },
        )
        if (!teacherToken) {
          badRequest(res, 'Mã mời không hợp lệ, đã được sử dụng hoặc đã hết hạn.')
          return
        }
        effectiveRole = teacherToken.role // 'teacher'
      }
    } else {
      if (effectiveRole === 'admin') {
        badRequest(res, 'Vai trò Admin yêu cầu mã mời quản trị viên.')
        return
      }
      if (effectiveRole === 'teacher') {
        badRequest(res, 'Giáo viên cần mã mời. Vui lòng liên hệ quản trị viên để nhận mã mời.')
        return
      }
    }

    if (await User.findOne({ email })) {
      // If we consumed a teacher token, release it on email conflict
      if (teacherToken) {
        await InviteToken.updateOne({ _id: teacherToken._id }, { $unset: { usedAt: 1 } })
      }
      badRequest(res, 'Email đã được sử dụng.')
      return
    }

    const user = await User.create({ name, email, passwordHash: password, role: effectiveRole, isActive: true })

    // Bind teacher token to the created user
    if (teacherToken) {
      await InviteToken.updateOne({ _id: teacherToken._id }, { usedBy: new Types.ObjectId(String(user._id)) })
    }

    await issueTokens(user, req, res)
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /auth/login ─────────────────────────────────────────────────────────
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      badRequest(res, 'Dữ liệu không hợp lệ')
      return
    }
    const { email, password } = parsed.data

    const user = await User.findOne({ email }).select('+passwordHash')
    if (!user) {
      unauthorized(res, 'Email hoặc mật khẩu không đúng.')
      return
    }

    const valid = await user.comparePassword(password)
    if (!valid) {
      unauthorized(res, 'Email hoặc mật khẩu không đúng.')
      return
    }

    if (!user.isActive) {
      unauthorized(res, 'Tài khoản đang chờ được quản trị viên duyệt. Vui lòng liên hệ quản trị viên.')
      return
    }

    user.lastLoginAt = new Date()
    await user.save()

    await issueTokens(user, req, res)
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const rawToken: string | undefined = req.cookies[REFRESH_COOKIE]
    if (!rawToken) {
      unauthorized(res, 'Không có refresh token.')
      return
    }

    // O(1) lookup: filter by tokenPrefix index first, then bcrypt only 1-2 docs
    const candidates = await RefreshToken.find({
      tokenPrefix: rawToken.slice(0, 16),
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }).select('+tokenHash')

    let matched: InstanceType<typeof RefreshToken> | null = null
    for (const t of candidates) {
      if (await verifyRefreshToken(rawToken, t.tokenHash)) {
        matched = t
        break
      }
    }

    if (!matched) {
      res.clearCookie(REFRESH_COOKIE, clearCookieOptions)
      unauthorized(res, 'Refresh token không hợp lệ hoặc đã hết hạn.')
      return
    }

    // Rotate: revoke old token
    matched.revokedAt = new Date()
    await matched.save()

    const user = await User.findById(matched.userId)
    if (!user || !user.isActive) {
      res.clearCookie(REFRESH_COOKIE, clearCookieOptions)
      unauthorized(res, 'Tài khoản không tồn tại hoặc đã bị khóa.')
      return
    }

    await issueTokens(user, req, res)
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /auth/logout ────────────────────────────────────────────────────────
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const rawToken: string | undefined = req.cookies[REFRESH_COOKIE]
    if (rawToken) {
      // Best-effort: revoke the matching token using prefix index
      const candidates = await RefreshToken.find({
        tokenPrefix: rawToken.slice(0, 16),
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      for (const t of candidates) {
        if (await verifyRefreshToken(rawToken, t.tokenHash)) {
          t.revokedAt = new Date()
          await t.save()
          break
        }
      }
    }
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions)
    ok(res, null, 'Đã đăng xuất.')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /auth/forgot-password ───────────────────────────────────────────────
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const parsed = forgotSchema.safeParse(req.body)
    if (!parsed.success) {
      badRequest(res, 'Email không hợp lệ.')
      return
    }
    const { email } = parsed.data
    console.log(`[FORGOT] Request for: ${email}`)

    // Always return success to prevent user enumeration
    const user = await User.findOne({ email })
    console.log(`[FORGOT] User found: ${!!user}`)
    if (user) {
      // Invalidate previous OTPs for this email
      await OtpToken.deleteMany({ email, purpose: 'reset_password' })

      const otp = generateOtp()
      await OtpToken.create({
        email,
        otpHash: otp,
        purpose: 'reset_password',
        expiresAt: new Date(Date.now() + env.OTP_EXPIRES_MIN * 60_000),
      })

      // Fire-and-forget: don't block response on SMTP
      sendOtpEmail(email, otp).catch(err =>
        console.error(`[EMAIL] Failed to send OTP to ${email}:`, err)
      )
    }

    ok(res, null, `Nếu email tồn tại, mã OTP đã được gửi.`)
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────
export async function verifyOtp(req: Request, res: Response): Promise<void> {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body)
    if (!parsed.success) {
      badRequest(res, 'Dữ liệu không hợp lệ.')
      return
    }
    const { email, otp } = parsed.data

    const record = await OtpToken.findOne({
      email,
      purpose: 'reset_password',
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }).select('+otpHash')

    if (!record) {
      badRequest(res, 'Mã OTP không hợp lệ hoặc đã hết hạn.')
      return
    }

    // Brute-force protection: max 5 attempts
    if (record.attempts >= 5) {
      await record.deleteOne()
      badRequest(res, 'Quá nhiều lần thử. Vui lòng yêu cầu mã OTP mới.')
      return
    }

    const valid = await record.compareOtp(otp)
    if (!valid) {
      record.attempts += 1
      await record.save()
      badRequest(res, `Mã OTP không đúng. Còn ${5 - record.attempts} lần thử.`)
      return
    }

    ok(res, null, 'OTP hợp lệ.')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /auth/reset-password ────────────────────────────────────────────────
export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const parsed = resetSchema.safeParse(req.body)
    if (!parsed.success) {
      badRequest(res, 'Dữ liệu không hợp lệ.', parsed.error.flatten().fieldErrors as Record<string, string>)
      return
    }
    const { email, otp, newPassword } = parsed.data

    const record = await OtpToken.findOne({
      email,
      purpose: 'reset_password',
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }).select('+otpHash')

    if (!record) {
      badRequest(res, 'Phiên đặt lại mật khẩu không hợp lệ. Vui lòng bắt đầu lại.')
      return
    }

    const valid = await record.compareOtp(otp)
    if (!valid) {
      badRequest(res, 'Mã OTP không đúng.')
      return
    }

    const user = await User.findOne({ email }).select('+passwordHash')
    if (!user) {
      badRequest(res, 'Tài khoản không tồn tại.')
      return
    }

    // Mark OTP used
    record.usedAt = new Date()
    await record.save()

    // Update password (pre-save hook will re-hash)
    user.passwordHash = newPassword
    await user.save()

    // Revoke all existing refresh tokens (force re-login everywhere)
    await RefreshToken.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { revokedAt: new Date() },
    )

    ok(res, null, 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── POST /auth/change-password ──────────────────────────────────────────────
export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const parsed = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
    }).safeParse(req.body)
    if (!parsed.success) {
      badRequest(res, 'Mật khẩu mới không hợp lệ. Tối thiểu 8 ký tự, có chữ hoa và chữ số.')
      return
    }
    const { currentPassword, newPassword } = parsed.data
    const userId = (req as Request & { userId?: string }).userId
    const user = await User.findById(userId).select('+passwordHash')
    if (!user) { unauthorized(res, 'Không tìm thấy tài khoản.'); return }

    const valid = await user.comparePassword(currentPassword)
    if (!valid) { badRequest(res, 'Mật khẩu hiện tại không đúng.'); return }

    user.passwordHash = newPassword
    await user.save()

    // Revoke all refresh tokens except the current session (force re-auth on other devices)
    await RefreshToken.updateMany(
      { userId: user._id, revokedAt: { $exists: false } },
      { revokedAt: new Date() },
    )
    ok(res, null, 'Đổi mật khẩu thành công.')
  } catch (err) {
    serverError(res, err)
  }
}

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
export async function getMe(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId
  const user = await User.findById(userId)
  if (!user) { unauthorized(res, 'Không tìm thấy tài khoản.'); return }
  ok(res, {
    id: String(user._id), name: user.name, email: user.email,
    role: user.role, avatar: user.avatar, phone: (user as unknown as Record<string, unknown>).phone,
  })
}

// ─── PATCH /auth/me ───────────────────────────────────────────────────────────
export async function updateMe(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId
  const allowed = ['name', 'phone', 'avatar'] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key]
  }
  const user = await User.findByIdAndUpdate(userId, patch, { new: true, runValidators: true })
  if (!user) { unauthorized(res, 'Không tìm thấy tài khoản.'); return }
  ok(res, {
    id: String(user._id), name: user.name, email: user.email,
    role: user.role, avatar: user.avatar, phone: (user as unknown as Record<string, unknown>).phone,
  })
}

// ─── POST /auth/logout-all ───────────────────────────────────────────────────
export async function logoutAll(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { userId?: string }).userId
    if (userId) {
      await RefreshToken.updateMany(
        { userId, revokedAt: { $exists: false } },
        { revokedAt: new Date() },
      )
    }
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions)
    ok(res, null, 'Đã đăng xuất khỏi tất cả thiết bị.')
  } catch (err) {
    serverError(res, err)
  }
}
