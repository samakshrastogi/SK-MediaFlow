import type { Request } from "express"
import { prisma } from "../../config/prisma"

export type LoginSessionMeta = {
    ipAddress?: string | null
    userAgent?: string | null
    deviceLabel?: string | null
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const createUsernameBase = (email: string) =>
    normalizeEmail(email)
        .split("@")[0]
        .replace(/[^a-z0-9._-]/g, "")
        .replace(/[._-]{2,}/g, ".")
        .replace(/^[._-]+|[._-]+$/g, "") || "user"

export const createUniqueUsername = async (
    email: string,
    excludeUserId?: string
) => {
    const base = createUsernameBase(email).slice(0, 20)

    for (let index = 0; index < 20; index += 1) {
        const suffix = index === 0 ? "" : `${index + 1}`
        const candidate = `${base}${suffix}`.slice(0, 24)
        const existingUser = await prisma.user.findUnique({
            where: { username: candidate },
        })

        if (!existingUser || existingUser.id === excludeUserId) {
            return candidate
        }
    }

    return `${base}${Date.now().toString().slice(-6)}`.slice(0, 24)
}

export const getClientIp = (req: Request) => {
    const forwarded = req.headers["x-forwarded-for"]
    const forwardedValue = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded?.split(",")[0]

    return (
        forwardedValue?.trim() ||
        req.socket.remoteAddress ||
        req.ip ||
        "unknown"
    )
}

export const normalizeUserAgent = (userAgent?: string | null) =>
    userAgent?.trim().slice(0, 255) || "Unknown browser"

export const inferDeviceLabel = (userAgent?: string | null) => {
    const normalized = normalizeUserAgent(userAgent).toLowerCase()

    const browser = normalized.includes("edg/")
        ? "Edge"
        : normalized.includes("chrome/")
        ? "Chrome"
        : normalized.includes("firefox/")
        ? "Firefox"
        : normalized.includes("safari/") && !normalized.includes("chrome/")
        ? "Safari"
        : normalized.includes("opr/")
        ? "Opera"
        : "Browser"

    const os = normalized.includes("windows")
        ? "Windows"
        : normalized.includes("android")
        ? "Android"
        : normalized.includes("iphone") || normalized.includes("ipad")
        ? "iOS"
        : normalized.includes("mac os x")
        ? "macOS"
        : normalized.includes("linux")
        ? "Linux"
        : "Unknown OS"

    return `${browser} on ${os}`
}

export const buildLoginSessionMeta = (req: Request): LoginSessionMeta => {
    const userAgent = normalizeUserAgent(req.headers["user-agent"])

    return {
        ipAddress: getClientIp(req),
        userAgent,
        deviceLabel: inferDeviceLabel(userAgent),
    }
}
