import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import { prisma } from "../../config/prisma"
import {
    renderBrandedEmail,
    sendEmail,
    type MailSendResult,
} from "../../services/mail.service"
import {
    createUniqueUsername,
    normalizeEmail,
    type LoginSessionMeta,
} from "./auth.utils"
const EMAIL_FROM = process.env.EMAIL_FROM as string
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO as string
const JWT_SECRET = process.env.JWT_SECRET as string
const CLIENT_URL = process.env.CLIENT_URL
if (!JWT_SECRET) throw new Error("JWT_SECRET not defined")

const SALT_ROUNDS = 12
const OTP_EXPIRY_MINUTES = 10
const OTP_RESEND_COOLDOWN_SECONDS = 60
const OTP_MAX_ATTEMPTS = 5
const OTP_MAX_RESENDS_PER_HOUR = 5
const OTP_RESEND_WINDOW_MS = 60 * 60 * 1000
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILED_ATTEMPTS_PER_IP = 8
const MAX_FAILED_ATTEMPTS_PER_EMAIL = 5
const ACCOUNT_LOCK_THRESHOLD = 5
const ACCOUNT_LOCK_MS = 15 * 60 * 1000
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000

const getRestrictedAccountMessage = () =>
    "This account is no longer available. Please contact support if you think this is a mistake."

type AuthOtpResponse = {
    message: string
    emailDeliveryMode: MailSendResult["mode"]
    email: string
    otpExpiresAt: string
    resendCooldownSeconds: number
    resendCountRemaining: number
}

class AuthError extends Error {
    statusCode: number
    details?: Record<string, unknown>
    constructor(
        message: string,
        statusCode = 400,
        details?: Record<string, unknown>
    ) {
        super(message)
        this.statusCode = statusCode
        this.details = details
    }
}

/* ---------------- UTILITIES ---------------- */

const generateOTP = () =>
    Math.floor(100000 + Math.random() * 900000).toString()

const buildOtpExpiry = () =>
    new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

const getOtpCooldownRemainingSeconds = (lastSentAt?: Date | null) => {
    if (!lastSentAt) return 0

    const remainingMs =
        lastSentAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now()

    return Math.max(0, Math.ceil(remainingMs / 1000))
}

const getOtpResendState = (
    resendCount: number,
    resendWindowStart?: Date | null
) => {
    if (
        !resendWindowStart ||
        resendWindowStart.getTime() <= Date.now() - OTP_RESEND_WINDOW_MS
    ) {
        return {
            resendCount: 0,
            resendWindowStart: new Date(),
        }
    }

    return {
        resendCount,
        resendWindowStart,
    }
}

const failedLoginAttemptsByIp = new Map<string, number[]>()
const failedLoginAttemptsByEmail = new Map<string, number[]>()

const pruneAttempts = (attempts: number[]) =>
    attempts.filter((timestamp) => timestamp > Date.now() - LOGIN_WINDOW_MS)

const recordAttempt = (map: Map<string, number[]>, key: string) => {
    if (!key) return 0

    const attempts = pruneAttempts(map.get(key) || [])
    attempts.push(Date.now())
    map.set(key, attempts)
    return attempts.length
}

const getAttemptCount = (map: Map<string, number[]>, key: string) => {
    if (!key) return 0

    const attempts = pruneAttempts(map.get(key) || [])
    map.set(key, attempts)
    return attempts.length
}

const clearAttempts = (map: Map<string, number[]>, key: string) => {
    if (key) map.delete(key)
}

const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))

const enforceFailedLoginRateLimit = (normalizedEmail: string, ipAddress: string) => {
    const ipFailures = getAttemptCount(failedLoginAttemptsByIp, ipAddress)
    if (ipFailures >= MAX_FAILED_ATTEMPTS_PER_IP) {
        throw new AuthError(
            "Too many failed login attempts from this network. Please wait 15 minutes and try again.",
            429
        )
    }

    const emailFailures = getAttemptCount(
        failedLoginAttemptsByEmail,
        normalizedEmail
    )
    if (emailFailures >= MAX_FAILED_ATTEMPTS_PER_EMAIL) {
        throw new AuthError(
            "Too many failed login attempts for this email. Please wait 15 minutes and try again.",
            429
        )
    }
}

const registerFailedLogin = async (
    normalizedEmail: string,
    ipAddress: string,
    userId?: string
) => {
    const ipFailures = recordAttempt(failedLoginAttemptsByIp, ipAddress)
    const emailFailures = recordAttempt(
        failedLoginAttemptsByEmail,
        normalizedEmail
    )

    if (userId) {
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { failedLoginAttempts: true },
        })

        const nextAttempts = (currentUser?.failedLoginAttempts || 0) + 1
        const lockUntil =
            nextAttempts >= ACCOUNT_LOCK_THRESHOLD
                ? new Date(Date.now() + ACCOUNT_LOCK_MS)
                : null

        await prisma.user.update({
            where: { id: userId },
            data: {
                failedLoginAttempts: nextAttempts,
                lockUntil,
            },
        })

        if (lockUntil) {
            throw new AuthError(
                "Your account is temporarily locked for 15 minutes after repeated failed login attempts.",
                423
            )
        }

        await sleep(Math.min(nextAttempts * 400, 2000))
    } else {
        await sleep(Math.min(Math.max(ipFailures, emailFailures) * 300, 1500))
    }
}

const clearFailedLoginState = async (normalizedEmail: string, ipAddress: string, userId: string) => {
    clearAttempts(failedLoginAttemptsByIp, ipAddress)
    clearAttempts(failedLoginAttemptsByEmail, normalizedEmail)

    await prisma.user.update({
        where: { id: userId },
        data: {
            failedLoginAttempts: 0,
            lockUntil: null,
        },
    })
}

const createLoginSession = async (
    user: {
        id: string
        email: string
        username: string | null
        name: string | null
        avatarKey: string | null
        platformAdmin: boolean
    },
    method: "LOCAL" | "GOOGLE",
    remember: boolean,
    meta: LoginSessionMeta
) => {
    const loginRecord = await prisma.userLogin.create({
        data: {
            userId: user.id,
            method,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            deviceLabel: meta.deviceLabel,
        },
    })

    const token = jwt.sign(
        { sub: user.id, email: user.email, loginId: loginRecord.id },
        JWT_SECRET,
        { expiresIn: remember ? "30d" : "1d" }
    )

    return {
        token,
        loginId: loginRecord.id,
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
            name: user.name,
            avatarKey: user.avatarKey,
            platformAdmin: user.platformAdmin,
        },
    }
}

/* ---------------- EMAIL SENDERS ---------------- */

const sendOTPEmail = async (
    email: string,
    otp: string
): Promise<MailSendResult> => {
    const body = `
                                    <tr>
                                        <td align="center" style="padding: 12px 0 18px;">
                                            <table role="presentation" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #dbeafe; border-radius: 8px;">
                                                <tr>
                                                    <td style="font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 38px; line-height: 44px; font-weight: 800; letter-spacing: 10px; padding: 18px 22px; text-align: center;">
                                                        ${otp}
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="font-family: Arial, Helvetica, sans-serif; color: #475569; font-size: 14px; line-height: 22px; text-align: center;">
                                            This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>. For your security, do not share it with anyone.
                                        </td>
                                    </tr>`

    return sendEmail({
        from: `"SK-MediaFlow Team" <${EMAIL_FROM}>`,
        replyTo: `"SK-MediaFlow Support" <${EMAIL_REPLY_TO}>`,
        to: email,
        subject: "Verify your SK-MediaFlow email",
        text: `Your SK-MediaFlow verification code is ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
        html: renderBrandedEmail({
            eyebrow: "Email verification",
            title: "Verify your account",
            intro: "Use this one-time code to finish setting up your SK-MediaFlow account.",
            bodyHtml: body,
            action: {
                label: "Open SK-MediaFlow",
                url: CLIENT_URL || "http://localhost:5173",
            },
            footerNote:
                "This verification code is private. SK-MediaFlow support will never ask you to share it.",
        }),
    })
}

const sendResetEmail = async (
    email: string,
    resetLink: string
): Promise<MailSendResult> => {
    const body = `
                                    <tr>
                                        <td style="padding: 8px 0 0;">
                                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;">
                                                <tr>
                                                    <td style="font-family: Arial, Helvetica, sans-serif; color: #7c2d12; font-size: 14px; line-height: 22px; padding: 16px;">
                                                        This reset link expires in <strong>1 hour</strong>. After changing your password, active sessions for your account will be revoked.
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>`

    return sendEmail({
        from: `"SK-MediaFlow" <${EMAIL_FROM}>`,
        to: email,
        subject: "Reset your SK-MediaFlow password",
        text: `Reset your SK-MediaFlow password using this link: ${resetLink}`,
        html: renderBrandedEmail({
            eyebrow: "Password reset",
            title: "Reset your password",
            intro: "We received a request to reset the password for your SK-MediaFlow account.",
            bodyHtml: body,
            action: {
                label: "Reset password",
                url: resetLink,
            },
            footerNote:
                "If you did not request a password reset, ignore this email and your password will stay unchanged.",
        }),
    })
}

/* ---------------- AUTH SERVICES ---------------- */

const sendOtpForUser = async (
    email: string,
    otp: string,
    otpExpiry: Date,
    message: string,
    resendCount = 0
): Promise<AuthOtpResponse> => {
    let mailResult: MailSendResult = { delivered: false, mode: "console" }

    try {
        mailResult = await sendOTPEmail(email, otp)
    } catch (err) {
        console.error("Email failed:", err)
    }

    return {
        message: mailResult.delivered
            ? message
            : "Account created, but OTP email could not be delivered.",
        emailDeliveryMode: mailResult.mode,
        email,
        otpExpiresAt: otpExpiry.toISOString(),
        resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        resendCountRemaining: Math.max(0, OTP_MAX_RESENDS_PER_HOUR - resendCount),
    }
}

export const registerUser = async (
    name: string,
    email: string,
    password: string,
    confirmPassword: string
) => {
    const normalizedEmail = normalizeEmail(email)
    const trimmedName = name.trim()

    if (!trimmedName || !normalizedEmail || !password || !confirmPassword)
        throw new AuthError("All fields are required")

    if (password !== confirmPassword)
        throw new AuthError("Passwords do not match")

    if (password.length < 6)
        throw new AuthError("Password must be at least 6 characters")

    const otp = generateOTP()
    const otpExpiry = buildOtpExpiry()
    const otpLastSentAt = new Date()
    const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
    })

    if (existingUser?.deletedAt || existingUser?.deactivatedAt) {
        throw new AuthError(getRestrictedAccountMessage(), 403)
    }

    if (existingUser?.isVerified) {
        throw new AuthError("Email already registered", 409)
    }

    if (existingUser && existingUser.provider !== "LOCAL") {
        throw new AuthError(
            "This email is already linked to a social login. Please sign in with that provider.",
            409
        )
    }

    if (existingUser) {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

        await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                name: trimmedName,
                email: normalizedEmail,
                username:
                    existingUser.username ||
                    (await createUniqueUsername(normalizedEmail, existingUser.id)),
                password: hashedPassword,
                provider: "LOCAL",
                otp,
                otpExpiry,
                otpAttemptCount: 0,
                otpResendCount: 0,
                otpResendWindowStart: otpLastSentAt,
                otpLastSentAt,
            },
        })
    } else {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)
        const username = await createUniqueUsername(normalizedEmail)

        await prisma.user.create({
            data: {
                name: trimmedName,
                email: normalizedEmail,
                username,
                password: hashedPassword,
                provider: "LOCAL",
                otp,
                otpExpiry,
                otpAttemptCount: 0,
                otpResendCount: 0,
                otpResendWindowStart: otpLastSentAt,
                otpLastSentAt,
            },
        })
    }

    return sendOtpForUser(
        normalizedEmail,
        otp,
        otpExpiry,
        existingUser ? "A new OTP has been sent to your email." : "OTP sent to your email.",
        0
    )
}

export const resendOTP = async (email: string) => {
    const normalizedEmail = normalizeEmail(email)
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (!user) throw new AuthError("User not found", 404)
    if (user.deletedAt || user.deactivatedAt)
        throw new AuthError(getRestrictedAccountMessage(), 403)
    if (user.provider !== "LOCAL")
        throw new AuthError("This account uses a different sign-in provider.", 409)
    if (user.isVerified) throw new AuthError("Account already verified")

    const cooldownRemainingSeconds = getOtpCooldownRemainingSeconds(
        user.otpLastSentAt
    )
    if (cooldownRemainingSeconds > 0) {
        throw new AuthError(
            `Please wait ${cooldownRemainingSeconds} seconds before requesting another OTP.`,
            429,
            {
                cooldownSeconds: cooldownRemainingSeconds,
            }
        )
    }

    const resendState = getOtpResendState(
        user.otpResendCount || 0,
        user.otpResendWindowStart
    )
    if (resendState.resendCount >= OTP_MAX_RESENDS_PER_HOUR) {
        throw new AuthError(
            "You have reached the maximum OTP resend limit for this hour. Please try again later.",
            429,
            {
                cooldownSeconds: Math.max(
                    0,
                    Math.ceil(
                        (resendState.resendWindowStart.getTime() +
                            OTP_RESEND_WINDOW_MS -
                            Date.now()) /
                            1000
                    )
                ),
            }
        )
    }

    const otp = generateOTP()
    const otpExpiry = buildOtpExpiry()
    const otpLastSentAt = new Date()
    const nextResendCount = resendState.resendCount + 1

    await prisma.user.update({
        where: { id: user.id },
        data: {
            otp,
            otpExpiry,
            otpAttemptCount: 0,
            otpResendCount: nextResendCount,
            otpResendWindowStart: resendState.resendWindowStart,
            otpLastSentAt,
        },
    })

    return sendOtpForUser(
        normalizedEmail,
        otp,
        otpExpiry,
        "A new OTP has been sent to your email.",
        nextResendCount
    )
}

export const verifyOTP = async (email: string, otp: string) => {
    const normalizedEmail = normalizeEmail(email)
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (!user) throw new AuthError("User not found", 404)
    if (user.deletedAt || user.deactivatedAt)
        throw new AuthError(getRestrictedAccountMessage(), 403)
    if (user.isVerified) throw new AuthError("Account already verified")

    if (!user.otp || !user.otpExpiry) throw new AuthError("Invalid OTP")
    if (user.otpExpiry < new Date()) throw new AuthError("OTP expired")

    if (user.otp !== otp) {
        const nextAttemptCount = (user.otpAttemptCount || 0) + 1

        await prisma.user.update({
            where: { id: user.id },
            data:
                nextAttemptCount >= OTP_MAX_ATTEMPTS
                    ? {
                        otp: null,
                        otpExpiry: null,
                        otpAttemptCount: 0,
                    }
                    : {
                        otpAttemptCount: nextAttemptCount,
                    },
        })

        if (nextAttemptCount >= OTP_MAX_ATTEMPTS) {
            throw new AuthError(
                "Too many incorrect OTP attempts. Request a new code and try again.",
                429
            )
        }

        throw new AuthError(
            `Incorrect OTP. ${OTP_MAX_ATTEMPTS - nextAttemptCount} attempt(s) remaining.`,
            400
        )
    }

    await prisma.user.update({
        where: { id: user.id },
        data: {
            isVerified: true,
            otp: null,
            otpExpiry: null,
            otpAttemptCount: 0,
            otpResendCount: 0,
            otpResendWindowStart: null,
            otpLastSentAt: null,
        },
    })

    return { message: "Account verified successfully" }
}

export const loginUser = async (
    email: string,
    password: string,
    remember = false,
    meta: LoginSessionMeta = {}
) => {
    const normalizedEmail = normalizeEmail(email)
    const ipAddress = meta.ipAddress || "unknown"

    enforceFailedLoginRateLimit(normalizedEmail, ipAddress)

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (!user || user.provider !== "LOCAL") {
        await registerFailedLogin(normalizedEmail, ipAddress)
        throw new AuthError("Invalid credentials", 401)
    }

    if (user.deletedAt || user.deactivatedAt) {
        throw new AuthError(getRestrictedAccountMessage(), 403)
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
        throw new AuthError(
            "Your account is temporarily locked. Please try again later.",
            423
        )
    }

    if (!user.isVerified)
        throw new AuthError("Verify your email first", 403, {
            requiresVerification: true,
            email: normalizedEmail,
        })

    const match = await bcrypt.compare(password, user.password!)

    if (!match) {
        await registerFailedLogin(normalizedEmail, ipAddress, user.id)
        throw new AuthError("Invalid credentials", 401)
    }

    await clearFailedLoginState(normalizedEmail, ipAddress, user.id)

    return createLoginSession(
        {
            id: user.id,
            email: user.email,
            username: user.username,
            name: user.name,
            avatarKey: user.avatarKey,
            platformAdmin: user.platformAdmin,
        },
        "LOCAL",
        remember,
        meta
    )
}

export const listUserSessions = async (userId: string) => {
    const sessions = await prisma.userLogin.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 12,
    })

    return sessions.map((session) => ({
        id: session.id,
        method: session.method,
        deviceLabel: session.deviceLabel || "Unknown device",
        ipAddress: session.ipAddress || "Unknown IP",
        userAgent: session.userAgent || "Unknown browser",
        sessionLengthSec: session.sessionLengthSec || 0,
        createdAt: session.createdAt,
        endedAt: session.endedAt,
        revokedAt: session.revokedAt,
    }))
}

export const revokeUserSession = async (
    userId: string,
    sessionId: string,
    currentLoginId?: string
) => {
    if (currentLoginId && sessionId === currentLoginId) {
        throw new AuthError("Use logout to end your current session.", 400)
    }

    const session = await prisma.userLogin.findUnique({
        where: { id: sessionId },
    })

    if (!session || session.userId !== userId) {
        throw new AuthError("Session not found", 404)
    }

    if (session.revokedAt) {
        return { message: "Session already revoked" }
    }

    await prisma.userLogin.update({
        where: { id: sessionId },
        data: {
            revokedAt: new Date(),
            revokedReason: "USER_REVOKED",
        },
    })

    return { message: "Session revoked successfully" }
}

export const generateResetToken = async (email: string) => {
    const normalizedEmail = normalizeEmail(email)
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (!user) {
        return {
            message: "If the account exists, reset instructions were sent.",
            emailDeliveryMode: "smtp" as MailSendResult["mode"],
            cooldownSeconds: Math.floor(RESET_REQUEST_COOLDOWN_MS / 1000),
        }
    }

    if (
        user.resetRequestedAt &&
        user.resetRequestedAt.getTime() > Date.now() - RESET_REQUEST_COOLDOWN_MS
    ) {
        return {
            message: "If the account exists, reset instructions were sent.",
            emailDeliveryMode: "smtp" as MailSendResult["mode"],
            cooldownSeconds: Math.ceil(
                (user.resetRequestedAt.getTime() + RESET_REQUEST_COOLDOWN_MS - Date.now()) /
                    1000
            ),
        }
    }

    const resetToken = crypto.randomBytes(32).toString("hex")
    const expiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS)

    await prisma.user.update({
        where: { id: user.id },
        data: {
            resetToken,
            resetTokenExp: expiry,
            resetRequestedAt: new Date(),
        },
    })

    const resetLink = `${CLIENT_URL}/reset-password?token=${resetToken}`

    let mailResult: MailSendResult = { delivered: false, mode: "console" }

    try {
        mailResult = await sendResetEmail(normalizedEmail, resetLink)
    } catch (err) {
        console.error("Reset email failed:", err)
    }

    const response: {
        message: string
        resetLink?: string
        emailDeliveryMode: MailSendResult["mode"]
        cooldownSeconds: number
    } = {
        message: "If the account exists, reset instructions were sent.",
        emailDeliveryMode: mailResult.mode,
        cooldownSeconds: Math.floor(RESET_REQUEST_COOLDOWN_MS / 1000),
    }

    if (process.env.NODE_ENV !== "production" && !mailResult.delivered) {
        response.resetLink = resetLink
    }

    return response
}

export const resetPassword = async (token: string, newPassword: string) => {
    const user = await prisma.user.findFirst({
        where: { resetToken: token },
    })

    if (!user || !user.resetTokenExp)
        throw new AuthError("This reset link is invalid or has already been used.")

    if (new Date(user.resetTokenExp).getTime() <= Date.now())
        throw new AuthError("This reset link has expired. Request a new password reset email.")

    if (!newPassword || newPassword.length < 6)
        throw new AuthError("Password must be at least 6 characters")

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS)

    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashedPassword,
            resetToken: null,
            resetTokenExp: null,
            resetRequestedAt: null,
        },
    })

    await prisma.userLogin.updateMany({
        where: {
            userId: user.id,
        },
        data: {
            revokedAt: new Date(),
            revokedReason: "PASSWORD_RESET",
        },
    })

    return {
        message: "Password reset successful. Please sign in again.",
    }
}
