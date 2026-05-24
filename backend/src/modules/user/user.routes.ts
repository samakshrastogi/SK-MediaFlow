// @ts-nocheck
import bcrypt from "bcrypt"
import { Router } from "express"
import { authenticate, AuthRequest } from "../../middlewares/auth.middleware"
import { prisma } from "../../config/prisma"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getSignedUrl as getCFSignedUrl } from "@aws-sdk/cloudfront-signer"
import { s3 } from "../../config/s3"
import { generateUniqueChannelUsername } from "../channel/channel.service"
import {
    listUserSessions,
    resendOTP,
    revokeUserSession,
} from "../auth/auth.service"
import { normalizeEmail } from "../auth/auth.utils"

const router = Router()
const SETTINGS_PASSWORD_MIN_LENGTH = 8

const normalizeLocale = (value: unknown, fallback = "en") => {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .slice(0, 10)

    return normalized || fallback
}

const mapSessionForSettings = (session: any, currentLoginId?: string) => ({
    id: session.id,
    method: session.method,
    deviceLabel: session.deviceLabel || "Unknown device",
    browser: session.userAgent || "Unknown browser",
    createdAt: session.createdAt,
    endedAt: session.endedAt,
    revokedAt: session.revokedAt,
    isCurrent: currentLoginId ? session.id === currentLoginId : false,
})

const requireAuthenticatedUser = async (req: AuthRequest, res: any) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        })
        return null
    }

    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { channel: true },
    })

    if (!user) {
        res.status(404).json({
            success: false,
            message: "User not found",
        })
        return null
    }

    return user
}

const requireCurrentPassword = async (user: any, currentPassword?: string) => {
    if (!user.password) {
        throw new Error("This account does not use a password. Sign in with your connected provider.")
    }

    if (!currentPassword) {
        throw new Error("Current password is required.")
    }

    const matches = await bcrypt.compare(currentPassword, user.password)
    if (!matches) {
        throw new Error("Current password is incorrect.")
    }
}

const revokeAllUserSessions = async (userId: string, reason: string, excludeLoginId?: string) => {
    const where: any = {
        userId,
        revokedAt: null,
    }

    if (excludeLoginId) {
        where.id = { not: excludeLoginId }
    }

    await prisma.userLogin.updateMany({
        where,
        data: {
            revokedAt: new Date(),
            revokedReason: reason,
        },
    })
}

/* ---------------- CF SIGN ---------------- */

const signCloudFrontUrl = (key: string) => {
    const encodedKey = encodeURI(key)

    const url = `https://${process.env.CLOUDFRONT_DOMAIN}/${encodedKey}`

    return getCFSignedUrl({
        url,
        keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID!,
        privateKey: process.env.CLOUDFRONT_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        dateLessThan: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })
}

/* ========================================================= */
/* ======================= PROFILE ========================== */
/* ========================================================= */

router.get("/me", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        /* ---------------- USER ---------------- */

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { channel: true }
        })

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            })
        }

        /* ---------------- STATS ---------------- */

        const [videosCount, playlistsCount, favoritesCount, commentsCount] =
            await Promise.all([
                prisma.video.count({
                    where: { channelId: user.channel?.id, status: "ACTIVE" }
                }),
                prisma.playlist.count({
                    where: { userId: user.id }
                }),
                prisma.videoReaction.count({
                    where: { userId: user.id, type: "LIKE" }
                }),
                prisma.videoComment.count({
                    where: { userId: user.id }
                })
            ])

        const sessions = await listUserSessions(user.id)
        const currentSession = req.user.loginId
            ? sessions.find((session) => session.id === req.user?.loginId)
            : null
        const latestSuccessfulSession = sessions[0] || null

        /* ---------------- UPLOADED VIDEOS ---------------- */

        const uploadedVideos = await prisma.video.findMany({
            where: {
                channelId: user.channel?.id,
                status: "ACTIVE"
            },
            include: {
                aiData: true,
                channel: {
                    select: {
                        name: true,
                        user: {
                            select: {
                                avatarKey: true,
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: "desc" },
            take: 12
        })

        /* ---------------- HISTORY (TEMP SAFE) ---------------- */
        const historyActions = await prisma.watchHistory.findMany({
            where: {
                userId: user.id,
                video: {
                    status: "ACTIVE"
                }
            },
            include: {
                video: {
                    include: {
                        aiData: true,
                        channel: {
                            select: {
                                name: true,
                                user: {
                                    select: {
                                        avatarKey: true,
                                        name: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { lastWatchedAt: "desc" },
            take: 12
        })

        /* ---------------- FAVORITES ---------------- */

        const favoriteActions = await prisma.videoReaction.findMany({
            where: {
                userId: user.id,
                type: "LIKE",
                video: {
                    status: "ACTIVE"
                }
            },
            include: {
                video: {
                    include: {
                        aiData: true,
                        channel: {
                            select: {
                                name: true,
                                user: {
                                    select: {
                                        avatarKey: true,
                                        name: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: "desc" },
            take: 12
        })

        /* ---------------- PLAYLISTS (FIXED) ---------------- */

        const playlists = await prisma.playlist.findMany({
            where: { userId: user.id },
            include: {
                actions: {
                    where: {
                        actionType: "ADD_TO_PLAYLIST",
                        video: {
                            status: "ACTIVE"
                        }
                    },
                    include: {
                        video: {
                            include: { aiData: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        })

        /* ---------------- RESPONSE ---------------- */

        return res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    name: user.name,
                    platformAdmin: user.platformAdmin,
                    avatarKey: user.avatarKey,
                    avatarUrl: user.avatarKey
                        ? user.avatarKey.startsWith("http")
                            ? user.avatarKey
                            : signCloudFrontUrl(user.avatarKey)
                        : null,
                    coverKey: user.coverKey,
                    coverUrl: user.coverKey
                        ? user.coverKey.startsWith("http")
                            ? user.coverKey
                            : signCloudFrontUrl(user.coverKey)
                        : null,
                    provider: user.provider,
                    createdAt: user.createdAt
                },

                channel: user.channel,

                stats: {
                    videos: videosCount,
                    playlists: playlistsCount,
                    favorites: favoritesCount,
                    comments: commentsCount
                },
                security: {
                    currentLoginId: req.user.loginId || null,
                    lastSuccessfulLogin: latestSuccessfulSession
                        ? {
                            createdAt: latestSuccessfulSession.createdAt,
                            deviceLabel: latestSuccessfulSession.deviceLabel,
                            ipAddress: latestSuccessfulSession.ipAddress,
                        }
                        : null,
                    currentSession: currentSession
                        ? {
                            id: currentSession.id,
                            createdAt: currentSession.createdAt,
                            deviceLabel: currentSession.deviceLabel,
                            ipAddress: currentSession.ipAddress,
                        }
                        : null,
                    sessions,
                },

                /* ---------- VIDEOS ---------- */

                uploadedVideos: uploadedVideos.map(v => ({
                    id: v.id,
                    publicId: v.publicId,
                    title: v.title,
                    aiTitle: v.aiData?.aiTitle ?? null,
                    thumbnailKey: v.thumbnailKey,
                    channel: { name: v.channel?.name || "Unknown channel" },
                    uploaderAvatarKey: v.channel?.user?.avatarKey ?? null,
                    uploaderAvatarUrl: v.channel?.user?.avatarKey
                        ? signCloudFrontUrl(v.channel.user.avatarKey)
                        : null,
                    uploaderName: v.channel?.user?.name ?? null,
                    createdAt: v.createdAt
                })),

                history: historyActions.map(h => {
                    const video = h.video as typeof h.video & {
                        channel?: {
                            name?: string | null
                            user?: { avatarKey?: string | null, name?: string | null }
                        }
                    }

                    return {
                        publicId: video.publicId,
                        id: video.id,
                        title: video.title || video.aiData?.aiTitle || "Untitled",
                        aiTitle: video.aiData?.aiTitle ?? null,
                        thumbnailKey: video.thumbnailKey,
                        channel: { name: video.channel?.name || "Unknown channel" },
                        uploaderAvatarKey: video.channel?.user?.avatarKey ?? null,
                        uploaderAvatarUrl: video.channel?.user?.avatarKey
                            ? signCloudFrontUrl(video.channel.user.avatarKey)
                            : null,
                        uploaderName: video.channel?.user?.name ?? null,
                        createdAt: h.lastWatchedAt
                    }
                }),

                favorites: favoriteActions.map(f => {
                    const video = f.video as typeof f.video & {
                        channel?: {
                            name?: string | null
                            user?: { avatarKey?: string | null, name?: string | null }
                        }
                    }

                    return {
                        publicId: video.publicId,
                        id: video.id,
                        title: video.title,
                        aiTitle: video.aiData?.aiTitle ?? null,
                        thumbnailKey: video.thumbnailKey,
                        channel: { name: video.channel?.name || "Unknown channel" },
                        uploaderAvatarKey: video.channel?.user?.avatarKey ?? null,
                        uploaderAvatarUrl: video.channel?.user?.avatarKey
                            ? signCloudFrontUrl(video.channel.user.avatarKey)
                            : null,
                        uploaderName: video.channel?.user?.name ?? null,
                        createdAt: video.createdAt
                    }
                }),

                /* ---------- PLAYLISTS (FIXED MAPPING) ---------- */

                playlists: playlists.map(p => ({
                    id: p.id,
                    name: p.name,
                    videos: p.actions.map(a => {
                        const video = a.video as typeof a.video & {
                            channel?: {
                                name?: string | null
                                user?: { avatarKey?: string | null, name?: string | null }
                            }
                        }

                        return {
                            publicId: video.publicId,
                            id: video.id,
                            title: video.title || video.aiData?.aiTitle || "Untitled",
                            aiTitle: video.aiData?.aiTitle ?? null,
                            thumbnailKey: video.thumbnailKey,
                            channel: { name: video.channel?.name || "Unknown channel" },
                            uploaderAvatarKey: video.channel?.user?.avatarKey ?? null,
                            uploaderAvatarUrl: video.channel?.user?.avatarKey
                                ? signCloudFrontUrl(video.channel.user.avatarKey)
                                : null,
                            uploaderName: video.channel?.user?.name ?? null,
                            createdAt: video.createdAt
                        }
                    })
                }))
            }
        })

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error"
        })
    }
})

/* ========================================================= */
/* =================== UPDATE PROFILE ======================= */
/* ========================================================= */

router.patch("/profile", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const {
            name,
            username,
            channelName,
            channelTitle,
            description,
            channelDescription
        } = req.body

        const finalChannelName = (channelTitle ?? channelName ?? "").trim()
        const finalChannelDescription = (
            channelDescription ?? description ?? ""
        ).trim()

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                name: name?.trim() || undefined,
                username: username?.trim() || undefined
            }
        })

        const existingChannel = await prisma.channel.findUnique({
            where: { userId: req.user.id }
        })

        let channel = existingChannel

        if (existingChannel) {
            channel = await prisma.channel.update({
                where: { userId: req.user.id },
                data: {
                    name: finalChannelName || undefined,
                    description: finalChannelDescription || undefined
                }
            })
        } else if (finalChannelName) {
            const generatedUsername = await generateUniqueChannelUsername(
                username?.trim() || finalChannelName || user.name || `user-${user.id}`
            )

            channel = await prisma.channel.create({
                data: {
                    name: finalChannelName,
                    description: finalChannelDescription || undefined,
                    username: generatedUsername,
                    userId: req.user.id
                }
            })
        }

        return res.json({
            success: true,
            data: { user, channel }
        })

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Profile update failed"
        })
    }
})

/* ========================================================= */
/* =================== AVATAR UPLOAD ======================== */
/* ========================================================= */

router.post("/avatar-upload-url", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { fileType } = req.body

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { channel: true }
        })

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User not found"
            })
        }

        const ext = fileType.split("/")[1]

        const keyPrefix = user.channel?.username
            ? `${user.channel.username}/avatar`
            : `users/${user.id}/avatar`
        const key = `${keyPrefix}/avatar_${Date.now()}.${ext}`

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: key,
            ContentType: fileType
        })

        const uploadUrl = await getSignedUrl(s3, command, {
            expiresIn: 60 * 5
        })

        return res.json({
            success: true,
            uploadUrl,
            key
        })

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to generate upload URL"
        })
    }
})

router.post("/avatar", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { key } = req.body

        await prisma.user.update({
            where: { id: req.user.id },
            data: { avatarKey: key }
        })

        const avatarUrl = signCloudFrontUrl(key)

        return res.json({
            success: true,
            avatarUrl
        })

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to save avatar"
        })
    }
})

router.get("/settings", authenticate, async (req: AuthRequest, res) => {
    try {
        const user = await requireAuthenticatedUser(req, res)
        if (!user) return

        const sessions = await listUserSessions(user.id)

        return res.json({
            success: true,
            data: {
                account: {
                    name: user.name,
                    email: user.email,
                    isVerified: user.isVerified,
                    connectedMethods: {
                        google: Boolean(user.googleId || user.provider === "GOOGLE"),
                        password: Boolean(user.password),
                    },
                    canChangeEmail: Boolean(user.password) || user.provider === "LOCAL",
                    canChangePassword: Boolean(user.password),
                },
                notifications: {
                    emailNotificationsEnabled: user.emailNotificationsEnabled,
                    productUpdatesEnabled: user.productUpdatesEnabled,
                    marketingEmailsEnabled: user.marketingEmailsEnabled,
                },
                privacy: {
                    publicProfileEnabled: user.publicProfileEnabled,
                    activityVisibilityEnabled: user.activityVisibilityEnabled,
                },
                preferences: {
                    preferredLanguage: user.preferredLanguage || "en",
                    autoplayEnabled: user.autoplayEnabled,
                    subtitlesEnabled: user.subtitlesEnabled,
                    subtitleLanguage: user.subtitleLanguage || "en",
                },
                security: {
                    currentSessionId: req.user?.loginId || null,
                    sessions: sessions.map((session) =>
                        mapSessionForSettings(session, req.user?.loginId)
                    ),
                },
            },
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to load settings",
        })
    }
})

router.patch("/settings/preferences", authenticate, async (req: AuthRequest, res) => {
    try {
        const user = await requireAuthenticatedUser(req, res)
        if (!user) return

        const notifications = req.body?.notifications || {}
        const privacy = req.body?.privacy || {}
        const preferences = req.body?.preferences || {}

        const updated = await prisma.user.update({
            where: { id: user.id },
            data: {
                emailNotificationsEnabled:
                    typeof notifications.emailNotificationsEnabled === "boolean"
                        ? notifications.emailNotificationsEnabled
                        : user.emailNotificationsEnabled,
                productUpdatesEnabled:
                    typeof notifications.productUpdatesEnabled === "boolean"
                        ? notifications.productUpdatesEnabled
                        : user.productUpdatesEnabled,
                marketingEmailsEnabled:
                    typeof notifications.marketingEmailsEnabled === "boolean"
                        ? notifications.marketingEmailsEnabled
                        : user.marketingEmailsEnabled,
                publicProfileEnabled:
                    typeof privacy.publicProfileEnabled === "boolean"
                        ? privacy.publicProfileEnabled
                        : user.publicProfileEnabled,
                activityVisibilityEnabled:
                    typeof privacy.activityVisibilityEnabled === "boolean"
                        ? privacy.activityVisibilityEnabled
                        : user.activityVisibilityEnabled,
                preferredLanguage: normalizeLocale(
                    preferences.preferredLanguage,
                    user.preferredLanguage || "en"
                ),
                autoplayEnabled:
                    typeof preferences.autoplayEnabled === "boolean"
                        ? preferences.autoplayEnabled
                        : user.autoplayEnabled,
                subtitlesEnabled:
                    typeof preferences.subtitlesEnabled === "boolean"
                        ? preferences.subtitlesEnabled
                        : user.subtitlesEnabled,
                subtitleLanguage: normalizeLocale(
                    preferences.subtitleLanguage,
                    user.subtitleLanguage || "en"
                ),
            },
        })

        return res.json({
            success: true,
            message: "Settings updated.",
            data: {
                notifications: {
                    emailNotificationsEnabled: updated.emailNotificationsEnabled,
                    productUpdatesEnabled: updated.productUpdatesEnabled,
                    marketingEmailsEnabled: updated.marketingEmailsEnabled,
                },
                privacy: {
                    publicProfileEnabled: updated.publicProfileEnabled,
                    activityVisibilityEnabled: updated.activityVisibilityEnabled,
                },
                preferences: {
                    preferredLanguage: updated.preferredLanguage,
                    autoplayEnabled: updated.autoplayEnabled,
                    subtitlesEnabled: updated.subtitlesEnabled,
                    subtitleLanguage: updated.subtitleLanguage,
                },
            },
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to update settings",
        })
    }
})

router.patch("/settings/email", authenticate, async (req: AuthRequest, res) => {
    try {
        const user = await requireAuthenticatedUser(req, res)
        if (!user) return

        if (!user.password && user.provider !== "LOCAL") {
            return res.status(400).json({
                success: false,
                message: "This email is managed by your connected sign-in provider.",
            })
        }

        const nextEmail = normalizeEmail(String(req.body?.email || ""))
        const currentPassword = String(req.body?.currentPassword || "")

        if (!nextEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required.",
            })
        }

        if (nextEmail === user.email) {
            return res.status(400).json({
                success: false,
                message: "Enter a different email address.",
            })
        }

        await requireCurrentPassword(user, currentPassword)

        const existing = await prisma.user.findUnique({
            where: { email: nextEmail },
        })

        if (existing && existing.id !== user.id) {
            return res.status(409).json({
                success: false,
                message: "Email already registered",
            })
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                email: nextEmail,
                isVerified: false,
                otp: null,
                otpExpiry: null,
                otpAttemptCount: 0,
                otpResendCount: 0,
                otpResendWindowStart: null,
                otpLastSentAt: null,
                resetToken: null,
                resetTokenExp: null,
                resetRequestedAt: null,
            },
        })

        await revokeAllUserSessions(user.id, "EMAIL_CHANGED")

        const otpResult = await resendOTP(nextEmail)

        return res.json({
            success: true,
            message: "Email updated. Verify your new email to continue.",
            data: otpResult,
        })
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            message: error?.message || "Failed to update email",
        })
    }
})

router.patch("/settings/password", authenticate, async (req: AuthRequest, res) => {
    try {
        const user = await requireAuthenticatedUser(req, res)
        if (!user) return

        const currentPassword = String(req.body?.currentPassword || "")
        const newPassword = String(req.body?.newPassword || "")
        const confirmPassword = String(req.body?.confirmPassword || "")

        await requireCurrentPassword(user, currentPassword)

        if (newPassword.length < SETTINGS_PASSWORD_MIN_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Password must be at least ${SETTINGS_PASSWORD_MIN_LENGTH} characters.`,
            })
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match.",
            })
        }

        if (newPassword === currentPassword) {
            return res.status(400).json({
                success: false,
                message: "Choose a new password different from your current password.",
            })
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12)

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                failedLoginAttempts: 0,
                lockUntil: null,
            },
        })

        await revokeAllUserSessions(user.id, "PASSWORD_CHANGED", req.user?.loginId)

        return res.json({
            success: true,
            message: "Password updated. Other devices have been signed out.",
        })
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            message: error?.message || "Failed to update password",
        })
    }
})

router.post("/settings/sessions/revoke-others", authenticate, async (req: AuthRequest, res) => {
    try {
        const user = await requireAuthenticatedUser(req, res)
        if (!user) return

        await revokeAllUserSessions(
            user.id,
            "USER_REVOKED_OTHER_SESSIONS",
            req.user?.loginId
        )

        return res.json({
            success: true,
            message: "Other devices have been signed out.",
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to sign out other devices",
        })
    }
})

router.delete("/settings/history/watch", authenticate, async (req: AuthRequest, res) => {
    try {
        const user = await requireAuthenticatedUser(req, res)
        if (!user) return

        await prisma.watchHistory.deleteMany({
            where: { userId: user.id },
        })

        return res.json({
            success: true,
            message: "Watch history cleared.",
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to clear watch history",
        })
    }
})

router.post("/settings/account/deactivate", authenticate, async (req: AuthRequest, res) => {
    try {
        const user = await requireAuthenticatedUser(req, res)
        if (!user) return

        if (user.password) {
            await requireCurrentPassword(user, String(req.body?.currentPassword || ""))
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                deactivatedAt: new Date(),
            },
        })

        await revokeAllUserSessions(user.id, "ACCOUNT_DEACTIVATED")

        return res.json({
            success: true,
            message: "Account deactivated.",
        })
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            message: error?.message || "Failed to deactivate account",
        })
    }
})

router.post("/settings/account/delete", authenticate, async (req: AuthRequest, res) => {
    try {
        const user = await requireAuthenticatedUser(req, res)
        if (!user) return

        const confirmation = String(req.body?.confirmation || "").trim().toUpperCase()
        if (confirmation !== "DELETE") {
            return res.status(400).json({
                success: false,
                message: 'Type "DELETE" to confirm account deletion.',
            })
        }

        if (user.password) {
            await requireCurrentPassword(user, String(req.body?.currentPassword || ""))
        }

        const deletedAt = new Date()
        const deletedEmail = `deleted+${user.id}-${Date.now()}@deleted.local`
        const deletedUsername = `deleted-${user.id.slice(-6)}`

        await prisma.user.update({
            where: { id: user.id },
            data: {
                email: deletedEmail,
                username: deletedUsername,
                name: "Deleted User",
                password: null,
                googleId: null,
                avatarKey: null,
                coverKey: null,
                isVerified: false,
                publicProfileEnabled: false,
                activityVisibilityEnabled: false,
                emailNotificationsEnabled: false,
                productUpdatesEnabled: false,
                marketingEmailsEnabled: false,
                otp: null,
                otpExpiry: null,
                otpAttemptCount: 0,
                otpResendCount: 0,
                otpResendWindowStart: null,
                otpLastSentAt: null,
                resetToken: null,
                resetTokenExp: null,
                resetRequestedAt: null,
                deactivatedAt: deletedAt,
                deletedAt,
            },
        })

        if (user.channel?.id) {
            await prisma.channel.update({
                where: { id: user.channel.id },
                data: {
                    name: "Deleted User",
                    description: "",
                },
            })
        }

        await revokeAllUserSessions(user.id, "ACCOUNT_DELETED")

        return res.json({
            success: true,
            message: "Account deleted.",
        })
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            message: error?.message || "Failed to delete account",
        })
    }
})

router.delete("/sessions/:sessionId", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            })
        }

        const result = await revokeUserSession(
            req.user.id,
            String(req.params.sessionId || ""),
            req.user.loginId
        )

        return res.json({
            success: true,
            message: result.message,
        })
    } catch (error: any) {
        return res.status(error?.statusCode || 500).json({
            success: false,
            message: error?.message || "Failed to revoke session",
        })
    }
})

router.post("/cover-upload-url", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { fileType } = req.body

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { channel: true }
        })

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User not found"
            })
        }

        const ext = fileType.split("/")[1]
        const keyPrefix = user.channel?.username
            ? `${user.channel.username}/cover`
            : `users/${user.id}/cover`
        const key = `${keyPrefix}/cover_${Date.now()}.${ext}`

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: key,
            ContentType: fileType
        })

        const uploadUrl = await getSignedUrl(s3, command, {
            expiresIn: 60 * 5
        })

        return res.json({
            success: true,
            uploadUrl,
            key
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to generate cover upload URL"
        })
    }
})

router.post("/cover", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { key } = req.body

        await prisma.user.update({
            where: { id: req.user.id },
            data: { coverKey: key }
        })

        const coverUrl = signCloudFrontUrl(key)

        return res.json({
            success: true,
            coverUrl
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to save cover photo"
        })
    }
})

export default router
