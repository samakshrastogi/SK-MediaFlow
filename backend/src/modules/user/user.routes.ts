// @ts-nocheck
import { Router } from "express"
import { authenticate, AuthRequest } from "../../middlewares/auth.middleware"
import { prisma } from "../../config/prisma"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getSignedUrl as getCFSignedUrl } from "@aws-sdk/cloudfront-signer"
import { s3 } from "../../config/s3"
import { generateUniqueChannelUsername } from "../channel/channel.service"

const router = Router()

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
