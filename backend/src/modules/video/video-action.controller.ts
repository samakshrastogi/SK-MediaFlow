// @ts-nocheck
import { Response } from "express"
import { prisma } from "../../config/prisma"
import { AuthRequest } from "../../middlewares/auth.middleware"
import { getSignedUrl as getCFSignedUrl } from "@aws-sdk/cloudfront-signer"
import { getOrganizationAccessContext } from "../organization/organization.service"

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

const findVideoByPublicId = async (publicId: string) => {
    return prisma.video.findUnique({
        where: { publicId },
        include: {
            channel: {
                select: {
                    id: true,
                    userId: true
                }
            }
        }
    })
}

const assertVideoAccess = async (video: any, userId: string) => {
    const access = await getOrganizationAccessContext(userId)

    if (video.visibility === "PUBLIC" && !access.canSeePublic) {
        throw new Error("Public videos are restricted by your organization policy")
    }

    if (
        video.visibility === "PRIVATE" &&
        video.channel?.userId !== userId &&
        !access.canSeePrivate
    ) {
        throw new Error("This video is private")
    }

    if (
        video.visibility === "ORGANIZATION" &&
        (
            !access.canSeeOrganization ||
            !access.activeOrganizationId ||
            video.organizationId !== access.activeOrganizationId
        )
    ) {
        throw new Error("This video is organization-only")
    }
}

export const handleRecordView = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const { publicId } = req.body
        const video = await findVideoByPublicId(publicId)

        if (!video || video.status !== "ACTIVE") return res.status(404).json({ message: "Video not found" })
        await assertVideoAccess(video, req.user.id)

        const recent = await prisma.videoView.findFirst({
            where: {
                userId: req.user.id,
                videoId: video.id,
                createdAt: {
                    gte: new Date(Date.now() - 30 * 1000)
                }
            }
        })

        if (!recent) {
            await prisma.videoView.create({
                data: {
                    userId: req.user.id,
                    videoId: video.id
                }
            })
        }

        const views = await prisma.videoView.count({ where: { videoId: video.id } })
        return res.json({ views })
    } catch {
        return res.status(500).json({ message: "Failed to record view" })
    }
}

export const handleWatchProgress = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const { publicId, watchedSeconds, currentPositionSeconds } = req.body
        const safeWatched = Math.max(0, Math.min(300, Number(watchedSeconds) || 0))
        const safePosition = Math.max(0, Number(currentPositionSeconds) || 0)

        if (!safeWatched) return res.json({ success: true })

        const video = await findVideoByPublicId(publicId)
        if (!video || video.status !== "ACTIVE") return res.status(404).json({ message: "Video not found" })
        await assertVideoAccess(video, req.user.id)

        await prisma.watchHistory.upsert({
            where: {
                userId_videoId: {
                    userId: req.user.id,
                    videoId: video.id
                }
            },
            update: {
                watchedSeconds: {
                    increment: Math.round(safeWatched)
                },
                lastPositionSeconds: Math.round(safePosition),
                lastWatchedAt: new Date()
            },
            create: {
                userId: req.user.id,
                videoId: video.id,
                watchedSeconds: Math.round(safeWatched),
                lastPositionSeconds: Math.round(safePosition),
                lastWatchedAt: new Date()
            }
        })

        return res.json({ success: true })
    } catch {
        return res.status(500).json({ message: "Failed to save watch progress" })
    }
}

export const handleReaction = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const { publicId, type } = req.body
        if (!["LIKE", "DISLIKE"].includes(type)) {
            return res.status(400).json({ message: "Invalid reaction type" })
        }

        const video = await findVideoByPublicId(publicId)
        if (!video || video.status !== "ACTIVE") return res.status(404).json({ message: "Video not found" })
        await assertVideoAccess(video, req.user.id)

        const existing = await prisma.videoReaction.findUnique({
            where: {
                userId_videoId: {
                    userId: req.user.id,
                    videoId: video.id
                }
            }
        })

        if (existing && existing.type === type) {
            await prisma.videoReaction.delete({ where: { id: existing.id } })
            return res.json({ removed: true })
        }

        await prisma.videoReaction.upsert({
            where: {
                userId_videoId: {
                    userId: req.user.id,
                    videoId: video.id
                }
            },
            update: { type },
            create: {
                userId: req.user.id,
                videoId: video.id,
                type
            }
        })

        return res.json({ success: true })
    } catch {
        return res.status(500).json({ message: "Reaction failed" })
    }
}

export const handleComment = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const { publicId, text } = req.body
        if (!text?.trim()) return res.status(400).json({ message: "Comment text is required" })

        const video = await findVideoByPublicId(publicId)
        if (!video || video.status !== "ACTIVE") return res.status(404).json({ message: "Video not found" })
        await assertVideoAccess(video, req.user.id)

        const comment = await prisma.videoComment.create({
            data: {
                userId: req.user.id,
                videoId: video.id,
                text: text.trim()
            }
        })

        return res.json(comment)
    } catch {
        return res.status(500).json({ message: "Comment failed" })
    }
}

export const handleShare = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const { publicId, method } = req.body
        const allowedMethods = [
            "COPY_LINK",
            "NATIVE",
            "WHATSAPP",
            "TELEGRAM",
            "X",
            "FACEBOOK",
            "LINKEDIN",
            "EMAIL"
        ]
        const shareMethod = allowedMethods.includes(method)
            ? method
            : "COPY_LINK"

        const video = await findVideoByPublicId(publicId)
        if (!video) return res.status(404).json({ message: "Video not found" })
        await assertVideoAccess(video, req.user.id)

        await prisma.videoShare.create({
            data: {
                userId: req.user.id,
                videoId: video.id,
                method: shareMethod
            }
        })

        const shares = await prisma.videoShare.count({ where: { videoId: video.id } })
        return res.json({ success: true, shares })
    } catch {
        return res.status(500).json({ message: "Share failed" })
    }
}

export const handleToggleSubscribe = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const { publicId } = req.body
        const video = await findVideoByPublicId(publicId)

        if (!video || video.status !== "ACTIVE" || !video?.channel?.id) return res.status(404).json({ message: "Channel not found" })
        await assertVideoAccess(video, req.user.id)

        if (video.channel.userId === req.user.id) {
            return res.status(400).json({ message: "Cannot subscribe to your own channel" })
        }

        const existing = await prisma.subscription.findUnique({
            where: {
                subscriberId_channelId: {
                    subscriberId: req.user.id,
                    channelId: video.channel.id
                }
            }
        })

        let subscribed = false

        if (existing) {
            await prisma.subscription.delete({ where: { id: existing.id } })
            subscribed = false
        } else {
            await prisma.subscription.create({
                data: {
                    subscriberId: req.user.id,
                    channelId: video.channel.id
                }
            })
            subscribed = true
        }

        const subscribers = await prisma.subscription.count({
            where: { channelId: video.channel.id }
        })

        return res.json({ subscribed, subscribers })
    } catch {
        return res.status(500).json({ message: "Subscribe action failed" })
    }
}

export const handleAddToPlaylist = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const { publicId, playlistId } = req.body

        const video = await prisma.video.findUnique({
            where: { publicId },
            include: {
                channel: {
                    select: { userId: true }
                }
            }
        })
        if (!video || video.status !== "ACTIVE") return res.status(404).json({ message: "Video not found" })
        await assertVideoAccess(video, req.user.id)

        const action = await prisma.videoAction.create({
            data: {
                userId: req.user.id,
                videoId: video.id,
                playlistId: playlistId ? String(playlistId) : null,
                actionType: "ADD_TO_PLAYLIST"
            }
        })

        return res.json(action)
    } catch {
        return res.status(500).json({ message: "Playlist action failed" })
    }
}

export const handleGetPlaylists = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const playlists = await prisma.playlist.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: "desc" }
        })

        return res.json(playlists)
    } catch {
        return res.status(500).json({ message: "Failed to fetch playlists" })
    }
}

export const handleCreatePlaylist = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const { name } = req.body

        const playlist = await prisma.playlist.create({
            data: {
                name,
                userId: req.user.id
            }
        })

        return res.json(playlist)
    } catch {
        return res.status(500).json({ message: "Failed to create playlist" })
    }
}

export const handleGetVideoActions = async (req: AuthRequest, res: Response) => {
    try {
        const publicId = req.params.publicId
        const video = await findVideoByPublicId(publicId)

        if (!video || video.status !== "ACTIVE") {
            return res.status(404).json({
                success: false,
                message: "Video not found"
            })
        }

        if (!req.user) return res.status(401).json({ message: "Unauthorized" })
        await assertVideoAccess(video, req.user.id)

        const videoId = video.id

        const [likes, dislikes, views, shares, subscribers, commentsRaw, reaction] = await Promise.all([
            prisma.videoReaction.count({ where: { videoId, type: "LIKE" } }),
            prisma.videoReaction.count({ where: { videoId, type: "DISLIKE" } }),
            prisma.videoView.count({ where: { videoId } }),
            prisma.videoShare.count({ where: { videoId } }),
            prisma.subscription.count({ where: { channelId: video.channelId } }),
            prisma.videoComment.findMany({
                where: { videoId },
                include: {
                    user: {
                        select: {
                            username: true,
                            channel: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: "desc" }
            }),
            req.user
                ? prisma.videoReaction.findUnique({
                    where: {
                        userId_videoId: {
                            userId: req.user.id,
                            videoId
                        }
                    }
                })
                : Promise.resolve(null)
        ])

        const comments = commentsRaw.map((c) => ({
            id: c.id,
            commentText: c.text,
            username: c.user.username,
            channelName: c.user.channel?.name ?? c.user.username,
            createdAt: c.createdAt
        }))

        let userReaction: "LIKE" | "DISLIKE" | null = null
        if (reaction?.type === "LIKE" || reaction?.type === "DISLIKE") {
            userReaction = reaction.type
        }

        let subscribed = false
        if (req.user) {
            const sub = await prisma.subscription.findUnique({
                where: {
                    subscriberId_channelId: {
                        subscriberId: req.user.id,
                        channelId: video.channelId
                    }
                }
            })
            subscribed = Boolean(sub)
        }

        return res.json({
            likes,
            dislikes,
            views,
            shares,
            subscribers,
            comments,
            userReaction,
            subscribed
        })
    } catch {
        return res.status(500).json({ message: "Fetch failed" })
    }
}

export const handleGetFavouriteVideos = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const likes = await prisma.videoReaction.findMany({
            where: {
                userId: req.user.id,
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
            orderBy: {
                createdAt: "desc"
            }
        })

        const videos = likes
            .map((l) => l.video)
            .filter((v): v is NonNullable<typeof v> => v !== null)
            .map((video) => {
                const v = video as typeof video & {
                    channel?: {
                        name?: string | null
                        user?: { avatarKey?: string | null; name?: string | null }
                    }
                }

                return {
                    publicId: v.publicId,
                    title: v.title,
                    aiTitle: v.aiData?.aiTitle ?? null,
                    thumbnailKey: v.thumbnailKey,
                    uploaderAvatarKey: v.channel?.user?.avatarKey ?? null,
                    uploaderAvatarUrl: v.channel?.user?.avatarKey
                        ? signCloudFrontUrl(v.channel.user.avatarKey)
                        : null,
                    uploaderName: v.channel?.user?.name ?? null,
                    channel: { name: v.channel?.name || "Unknown channel" },
                    size: Number(v.size),
                    createdAt: v.createdAt
                }
            })

        return res.json(videos)
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch favourite videos" })
    }
}

export const handleGetUserPlaylistsWithVideos = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const playlists = await prisma.playlist.findMany({
            where: { userId: req.user.id },
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
                            include: {
                                aiData: true,
                                metadata: {
                                    select: {
                                        orientation: true
                                    }
                                },
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
                    orderBy: { createdAt: "desc" }
                }
            },
            orderBy: { createdAt: "desc" }
        })

        const formatted = playlists.map((playlist) => ({
            id: playlist.id,
            name: playlist.name,
            createdAt: playlist.createdAt,
            videos: playlist.actions
                .map((action) => action.video)
                .filter((v): v is NonNullable<typeof v> => v !== null)
                .map((video) => {
                    const v = video as typeof video & {
                        channel?: {
                            name?: string | null
                            user?: { avatarKey?: string | null; name?: string | null }
                        }
                    }

                    return {
                        publicId: v.publicId,
                        title: v.title,
                        aiTitle: v.aiData?.aiTitle ?? null,
                        thumbnailKey: v.thumbnailKey,
                        uploaderAvatarKey: v.channel?.user?.avatarKey ?? null,
                        uploaderAvatarUrl: v.channel?.user?.avatarKey
                            ? signCloudFrontUrl(v.channel.user.avatarKey)
                            : null,
                        uploaderName: v.channel?.user?.name ?? null,
                        channel: { name: v.channel?.name || "Unknown channel" },
                        size: Number(v.size),
                        createdAt: v.createdAt,
                        orientation: v.metadata?.orientation ?? null
                    }
                })
        }))

        return res.json(formatted)
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch playlists" })
    }
}

export const handleGetUserActivity = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Unauthorized" })

        const [watch, likes, comments, shares] = await Promise.all([
            prisma.watchHistory.findMany({
                where: {
                    userId: req.user.id,
                    video: {
                        status: "ACTIVE"
                    }
                },
                include: { video: true },
                orderBy: { lastWatchedAt: "desc" },
                take: 20
            }),
            prisma.videoReaction.findMany({
                where: {
                    userId: req.user.id,
                    type: "LIKE",
                    video: {
                        status: "ACTIVE"
                    }
                },
                include: { video: true },
                orderBy: { createdAt: "desc" },
                take: 20
            }),
            prisma.videoComment.findMany({
                where: {
                    userId: req.user.id,
                    video: {
                        status: "ACTIVE"
                    }
                },
                include: { video: true },
                orderBy: { createdAt: "desc" },
                take: 20
            }),
            prisma.videoShare.findMany({
                where: {
                    userId: req.user.id,
                    video: {
                        status: "ACTIVE"
                    }
                },
                include: { video: true },
                orderBy: { createdAt: "desc" },
                take: 20
            })
        ])

        const activity = [
            ...watch.map((a) => ({
                type: "Watched",
                title: a.video?.title || "Video",
                createdAt: a.lastWatchedAt
            })),
            ...likes.map((a) => ({
                type: "Liked",
                title: a.video?.title || "Video",
                createdAt: a.createdAt
            })),
            ...comments.map((a) => ({
                type: "Commented",
                title: a.video?.title || "Video",
                createdAt: a.createdAt
            })),
            ...shares.map((a) => ({
                type: "Shared",
                title: a.video?.title || "Video",
                createdAt: a.createdAt
            }))
        ]
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
            .slice(0, 20)

        return res.json(activity)
    } catch (error) {
        return res.status(500).json({ message: "Failed to fetch activity" })
    }
}
