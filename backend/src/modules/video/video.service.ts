// @ts-nocheck
import {
    PutObjectCommand,
    ListObjectsV2Command,
    GetObjectCommand
} from "@aws-sdk/client-s3"
import { nanoid } from "nanoid"
import { getSignedUrl as getCFSignedUrl } from "@aws-sdk/cloudfront-signer"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import fs from "fs"
import os from "os"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { pipeline } from "stream/promises"

import { prisma } from "../../config/prisma"
import { s3 } from "../../config/s3"
import { emitNewVideoUploaded } from "../../services/realtime.service"
import { getOrganizationAccessContext } from "../organization/organization.service"

import { startVideoPostUploadPipeline } from "./video-processing.service"

const AWS_BUCKET = process.env.AWS_BUCKET as string
const execAsync = promisify(exec)

class HttpError extends Error {
    statusCode: number

    constructor(statusCode: number, message: string) {
        super(message)
        this.statusCode = statusCode
    }
}

if (!AWS_BUCKET) {
    throw new Error("AWS_BUCKET not configured")
}

const ACTIVE_VIDEO_STATUS = "ACTIVE"

const DAY_IN_MS = 24 * 60 * 60 * 1000

const formatDurationLabel = (durationSeconds?: number | null) => {
    if (!durationSeconds || durationSeconds <= 0) return null

    const totalSeconds = Math.round(durationSeconds)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
        return `${hours}h ${minutes}m`
    }

    if (minutes > 0) {
        return `${minutes}m`
    }

    return `${Math.max(1, seconds)}s`
}

const signCloudFrontUrl = (key: string) => {
    const encodedKey = encodeURI(key)

    const url = `https://${process.env.CLOUDFRONT_DOMAIN}/${encodedKey}`

    return getCFSignedUrl({
        url,
        keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID!,
        privateKey: process.env.CLOUDFRONT_PRIVATE_KEY!.replace(/\\n/g, "\n"),
        dateLessThan: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    })
}

export const generatePresignedUrl = async (
    userId: string,
    fileName: string,
    fileType: string
) => {
    const orgAccess = await getOrganizationAccessContext(userId)
    if (orgAccess.activeOrganizationId && !orgAccess.canUpload) {
        throw new Error(orgAccess.blockedReason || "You are not allowed to upload in this organization")
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { channel: true }
    })

    if (!user) throw new Error("User not found")
    if (!user.channel) throw new Error("Please create a channel first")

    const safeFileName = fileName
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]/g, "")

    const key = `${user.channel.username}/videos/${Date.now()}_${safeFileName}`

    const command = new PutObjectCommand({
        Bucket: AWS_BUCKET,
        Key: key,
        ContentType: fileType,
        CacheControl: "public, max-age=31536000"
    })

    const uploadUrl = await getSignedUrl(s3, command, {
        expiresIn: 60 * 5
    })

    return { uploadUrl, key }
}

const filenameFromS3Key = (key: string) => {
    const rawName = key.split("/").pop() || "Untitled"
    const withoutTimestamp = rawName.replace(/^\d+_/, "")
    const withoutExtension = withoutTimestamp.replace(/\.[^.]+$/, "")
    return withoutExtension.replace(/[_-]+/g, " ").trim() || "Untitled"
}

export const generateThumbnailPresignedUrl = async (
    userId: string,
    fileName: string,
    fileType: string
) => {
    const orgAccess = await getOrganizationAccessContext(userId)
    if (orgAccess.activeOrganizationId && !orgAccess.canUpload) {
        throw new Error(orgAccess.blockedReason || "You are not allowed to upload in this organization")
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { channel: true }
    })

    if (!user) throw new Error("User not found")
    if (!user.channel) throw new Error("Please create a channel first")

    const safeFileName = fileName
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]/g, "")

    const key = `${user.channel.username}/thumbnails/custom_${Date.now()}_${safeFileName}`

    const command = new PutObjectCommand({
        Bucket: AWS_BUCKET,
        Key: key,
        ContentType: fileType,
        CacheControl: "public, max-age=31536000"
    })

    const uploadUrl = await getSignedUrl(s3, command, {
        expiresIn: 60 * 5
    })

    return { uploadUrl, key }
}

export const completeUpload = async (
    userId: string,
    key: string,
    title: string | undefined,
    size: number,
    visibility?: "PUBLIC" | "PRIVATE" | "ORGANIZATION",
    description?: string,
    thumbnailKey?: string
) => {
    const orgAccess = await getOrganizationAccessContext(userId)
    if (orgAccess.activeOrganizationId && !orgAccess.canUpload) {
        throw new Error(orgAccess.blockedReason || "You are not allowed to upload in this organization")
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { channel: true }
    })

    if (!user?.channel) {
        throw new Error("Channel not found")
    }

    const existing = await prisma.video.findUnique({
        where: { s3Key: key }
    })

    if (existing) return existing

    const finalVisibility =
        visibility ||
        (orgAccess.activeOrganizationId ? "ORGANIZATION" : "PUBLIC")

    const fallbackTitle = filenameFromS3Key(key)
    const submittedTitle = (title ?? "").trim()
    const submittedDescription = (description ?? "").trim()

    const video = await prisma.video.create({
        data: {
            publicId: nanoid(10), // ✅ ADD THIS

            title: submittedTitle || fallbackTitle,
            s3Key: key,
            size: String(size),
            thumbnailKey: thumbnailKey || null,
            uploadSource: "MANUAL",
            status: ACTIVE_VIDEO_STATUS,
            channelId: user.channel.id,
            visibility: finalVisibility,
            organizationId: finalVisibility === "ORGANIZATION" ? orgAccess.activeOrganizationId : null
        }
    })

    await startVideoPostUploadPipeline(
        video.id,
        key,
        user.channel.username,
        submittedDescription || fallbackTitle
    )

    emitNewVideoUploaded({
        publicId: video.publicId,
        title: video.title?.trim() || fallbackTitle,
        uploaderName: user.name || user.channel.name
    })

    return video
}

export const scanS3Videos = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { channel: true }
    })

    if (!user?.channel) {
        throw new Error("Channel not found")
    }

    const prefix = `${user.channel.username}/videos/`

    let continuationToken: string | undefined
    const s3Keys: string[] = []

    do {
        const command = new ListObjectsV2Command({
            Bucket: AWS_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
            MaxKeys: 1000
        })

        const response = await s3.send(command)

        const objects =
            response.Contents?.filter(
                (obj) => obj.Key && !obj.Key.endsWith("/")
            ) || []

        objects.forEach((obj) => {
            if (obj.Key) {
                s3Keys.push(obj.Key)
            }
        })

        continuationToken = response.NextContinuationToken
    } while (continuationToken)

    const dbVideos = await prisma.video.findMany({
        where: { channelId: user.channel.id },
        select: { s3Key: true }
    })

    const dbKeySet = new Set(dbVideos.map((v) => v.s3Key))

    const remainingVideos = s3Keys.filter(
        (key) => !dbKeySet.has(key)
    )

    return {
        totalInS3: s3Keys.length,
        alreadyImported: dbVideos.length,
        remaining: remainingVideos.length,
        remainingVideos
    }
}

const buildVisibilityWhere = async (userId?: string) => {
    if (!userId) {
        return {
            OR: [{ visibility: "PUBLIC" as const }]
        }
    }

    const access = await getOrganizationAccessContext(userId)

    const clauses: any[] = [{ visibility: "PUBLIC" }]
    if (access.canSeePrivate) clauses.push({ visibility: "PRIVATE" })
    if (access.canSeeOrganization && access.activeOrganizationId) {
        let adminUserIds: string[] | null = null
        if (access.restrictToAdminUploads) {
            const admins = await prisma.organizationMembership.findMany({
                where: {
                    organizationId: access.activeOrganizationId,
                    status: "APPROVED",
                    role: "ADMIN"
                },
                select: { userId: true }
            })
            adminUserIds = admins.map((a) => a.userId)
        }

        clauses.push({
            visibility: "ORGANIZATION",
            organizationId: access.activeOrganizationId,
            ...(adminUserIds ? { channel: { userId: { in: adminUserIds } } } : {})
        })
    }

    if (!clauses.length) {
        return {
            OR: [{ id: "__none__" }]
        }
    }

    return { OR: clauses }
}

export const getAllVideos = async (userId?: string) => {
    const visibilityWhere = await buildVisibilityWhere(userId)
    const userWatchHistoryInclude = userId
        ? {
            watchHistory: {
                where: { userId },
                orderBy: { lastWatchedAt: "desc" as const },
                take: 1
            }
        }
        : {}

    const videos = await prisma.video.findMany({
        where: {
            status: ACTIVE_VIDEO_STATUS,
            ...visibilityWhere
        },
        include: {
            channel: {
                select: {
                    name: true,
                    username: true,
                    user: {
                        select: {
                            avatarKey: true,
                            name: true
                        }
                    }
                }
            },
            aiData: true,
            metadata: {
                select: {
                    orientation: true,
                    duration: true
                }
            },
            ...userWatchHistoryInclude
        },
        orderBy: {
            createdAt: "desc"
        }
    })

    return hydrateVideoCards(videos, userId)
}

const hydrateVideoCards = async (videos: any[], userId?: string) => {
    if (!videos.length) {
        return []
    }

    const videoIds = videos.map((video) => video.id)
    const now = Date.now()
    const last24h = new Date(now - DAY_IN_MS)
    const last7d = new Date(now - 7 * DAY_IN_MS)

    const [viewRows, reactionRows, shareRows, commentRows, activeWatchRows, userReactionRows] = await Promise.all([
        prisma.videoView.findMany({
            where: { videoId: { in: videoIds } },
            select: { videoId: true, createdAt: true }
        }),
        prisma.videoReaction.findMany({
            where: { videoId: { in: videoIds } },
            select: { videoId: true, type: true, createdAt: true }
        }),
        prisma.videoShare.findMany({
            where: { videoId: { in: videoIds } },
            select: { videoId: true, createdAt: true }
        }),
        prisma.videoComment.findMany({
            where: { videoId: { in: videoIds } },
            select: { videoId: true, createdAt: true }
        }),
        prisma.watchHistory.findMany({
            where: {
                videoId: { in: videoIds },
                lastWatchedAt: { gte: last24h }
            },
            select: {
                videoId: true
            }
        }),
        userId
            ? prisma.videoReaction.findMany({
                where: {
                    videoId: { in: videoIds },
                    userId
                },
                select: {
                    videoId: true,
                    type: true
                }
            })
            : Promise.resolve([])
    ])

    const metricsByVideo = new Map<string, {
        viewsCount: number
        viewsLast24h: number
        viewsLast7d: number
        likesCount: number
        dislikesCount: number
        likesLast7d: number
        sharesCount: number
        sharesLast7d: number
        commentsCount: number
        commentsLast7d: number
        activeSessionsCount: number
        userReaction: "LIKE" | "DISLIKE" | null
    }>()

    const ensureMetrics = (videoId: string) => {
        if (!metricsByVideo.has(videoId)) {
            metricsByVideo.set(videoId, {
                viewsCount: 0,
                viewsLast24h: 0,
                viewsLast7d: 0,
                likesCount: 0,
                dislikesCount: 0,
                likesLast7d: 0,
                sharesCount: 0,
                sharesLast7d: 0,
                commentsCount: 0,
                commentsLast7d: 0,
                activeSessionsCount: 0,
                userReaction: null
            })
        }

        return metricsByVideo.get(videoId)!
    }

    for (const row of viewRows) {
        const metrics = ensureMetrics(row.videoId)
        metrics.viewsCount += 1
        if (row.createdAt >= last7d) metrics.viewsLast7d += 1
        if (row.createdAt >= last24h) metrics.viewsLast24h += 1
    }

    for (const row of reactionRows) {
        const metrics = ensureMetrics(row.videoId)
        if (row.type === "LIKE") {
            metrics.likesCount += 1
            if (row.createdAt >= last7d) metrics.likesLast7d += 1
        } else if (row.type === "DISLIKE") {
            metrics.dislikesCount += 1
        }
    }

    for (const row of shareRows) {
        const metrics = ensureMetrics(row.videoId)
        metrics.sharesCount += 1
        if (row.createdAt >= last7d) metrics.sharesLast7d += 1
    }

    for (const row of commentRows) {
        const metrics = ensureMetrics(row.videoId)
        metrics.commentsCount += 1
        if (row.createdAt >= last7d) metrics.commentsLast7d += 1
    }

    for (const row of activeWatchRows) {
        const metrics = ensureMetrics(row.videoId)
        metrics.activeSessionsCount += 1
    }

    for (const row of userReactionRows) {
        const metrics = ensureMetrics(row.videoId)
        metrics.userReaction = row.type === "LIKE" || row.type === "DISLIKE" ? row.type : null
    }

    return videos.map((video) => {
        const metrics = metricsByVideo.get(video.id)
        const userWatch = Array.isArray(video.watchHistory) ? video.watchHistory[0] : null
        const durationSeconds = video.metadata?.duration ?? null
        const rawProgress = durationSeconds && userWatch?.lastPositionSeconds
            ? Math.round((Math.min(userWatch.lastPositionSeconds, durationSeconds) / durationSeconds) * 100)
            : null

        return {
            publicId: video.publicId,
            title: video.title,
            aiTitle: video.aiData?.aiTitle ?? null,
            aiDescription: video.aiData?.aiDescription ?? null,
            keywords: video.aiData?.keywords ?? [],
            tags: video.aiData?.tags ?? [],
            channel: video.channel,
            uploaderAvatarKey: video.channel.user?.avatarKey ?? null,
            uploaderAvatarUrl: video.channel.user?.avatarKey
                ? signCloudFrontUrl(video.channel.user.avatarKey)
                : null,
            uploaderName: video.channel.user?.name ?? null,
            createdAt: video.createdAt,
            thumbnailKey: video.thumbnailKey,
            orientation: video.metadata?.orientation ?? null,
            duration: formatDurationLabel(durationSeconds),
            durationSeconds,
            visibility: video.visibility,
            signedUrl: signCloudFrontUrl(video.s3Key),
            size: video.size,
            progress: rawProgress !== null ? Math.max(0, Math.min(100, rawProgress)) : undefined,
            watchedSeconds: userWatch?.watchedSeconds ?? 0,
            lastPositionSeconds: userWatch?.lastPositionSeconds ?? 0,
            lastWatchedAt: userWatch?.lastWatchedAt ?? null,
            viewsCount: metrics?.viewsCount ?? 0,
            viewsLast24h: metrics?.viewsLast24h ?? 0,
            viewsLast7d: metrics?.viewsLast7d ?? 0,
            likesCount: metrics?.likesCount ?? 0,
            dislikesCount: metrics?.dislikesCount ?? 0,
            likesLast7d: metrics?.likesLast7d ?? 0,
            sharesCount: metrics?.sharesCount ?? 0,
            sharesLast7d: metrics?.sharesLast7d ?? 0,
            commentsCount: metrics?.commentsCount ?? 0,
            commentsLast7d: metrics?.commentsLast7d ?? 0,
            activeSessionsCount: metrics?.activeSessionsCount ?? 0,
            userReaction: metrics?.userReaction ?? null
        }
    })
}

export const getPortraitVideos = async (userId?: string) => {
    const userWatchHistoryInclude = userId
        ? {
            watchHistory: {
                where: { userId },
                orderBy: { lastWatchedAt: "desc" as const },
                take: 1
            }
        }
        : {}

    const videos = await prisma.video.findMany({
        where: {
            status: ACTIVE_VIDEO_STATUS,
            visibility: "PUBLIC",
            metadata: {
                is: {
                    orientation: "PORTRAIT"
                }
            }
        },
        include: {
            channel: {
                select: {
                    name: true,
                    username: true,
                    user: {
                        select: {
                            avatarKey: true,
                            name: true
                        }
                    }
                }
            },
            aiData: true,
            metadata: {
                select: {
                    orientation: true,
                    duration: true
                }
            },
            ...userWatchHistoryInclude
        },
        orderBy: {
            createdAt: "desc"
        }
    })

    return hydrateVideoCards(videos, userId)
}

export const getOrganizationRowVideos = async (
    userId: string,
    organizationId: string
) => {
    const membership = await prisma.organizationMembership.findUnique({
        where: {
            organizationId_userId: {
                organizationId,
                userId
            }
        },
        select: { status: true }
    })

    if (!membership || membership.status !== "APPROVED") {
        throw new Error("Organization access required")
    }

    const admins = await prisma.organizationMembership.findMany({
        where: {
            organizationId,
            status: "APPROVED",
            role: "ADMIN"
        },
        select: { userId: true }
    })

    const adminIds = admins.map((a) => a.userId)
    if (!adminIds.length) return []

    const videos = await prisma.video.findMany({
        where: {
            status: ACTIVE_VIDEO_STATUS,
            visibility: "ORGANIZATION",
            organizationId,
            channel: {
                userId: {
                    in: adminIds
                }
            }
        },
        include: {
            channel: {
                select: {
                    name: true,
                    username: true,
                    user: {
                        select: {
                            avatarKey: true,
                            name: true
                        }
                    }
                }
            },
            aiData: true,
            metadata: {
                select: {
                    orientation: true
                }
            }
        },
        orderBy: {
            createdAt: "desc"
        }
    })

    return videos.map((video) => ({
        publicId: video.publicId,
        title: video.title,
        aiTitle: video.aiData?.aiTitle ?? null,
        aiDescription: video.aiData?.aiDescription ?? null,
        channel: video.channel,
        uploaderAvatarKey: video.channel.user?.avatarKey ?? null,
        uploaderAvatarUrl: video.channel.user?.avatarKey
            ? signCloudFrontUrl(video.channel.user.avatarKey)
            : null,
        uploaderName: video.channel.user?.name ?? null,
        createdAt: video.createdAt,
        thumbnailKey: video.thumbnailKey,
        orientation: video.metadata?.orientation ?? null,
        signedUrl: signCloudFrontUrl(video.s3Key),
        size: video.size
    }))
}

export const searchVideos = async (query: string, userId?: string) => {
    const q = query.trim()
    if (!q) return []

    const terms = q
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)

    const visibilityWhere = await buildVisibilityWhere(userId)

    const videos = await prisma.video.findMany({
        where: {
            AND: [
                {
                    status: ACTIVE_VIDEO_STATUS,
                    ...visibilityWhere
                },
                {
                    OR: [
                        {
                            title: {
                                contains: q,
                                mode: "insensitive"
                            }
                        },
                        {
                            aiData: {
                                is: {
                                    aiTitle: {
                                        contains: q,
                                        mode: "insensitive"
                                    }
                                }
                            }
                        },
                        {
                            aiData: {
                                is: {
                                    aiDescription: {
                                        contains: q,
                                        mode: "insensitive"
                                    }
                                }
                            }
                        },
                        {
                            aiData: {
                                is: {
                                    keywords: {
                                        hasSome: terms
                                    }
                                }
                            }
                        },
                        {
                            aiData: {
                                is: {
                                    tags: {
                                        hasSome: terms
                                    }
                                }
                            }
                        }
                    ]
                }
            ]
        },
        include: {
            channel: {
                select: {
                    name: true,
                    username: true,
                    user: {
                        select: {
                            avatarKey: true,
                            name: true
                        }
                    }
                }
            },
            aiData: true,
            metadata: {
                select: {
                    orientation: true
                }
            }
        },
        orderBy: {
            createdAt: "desc"
        },
        take: 100
    })

    return videos
        .map((video) => {
            const title = video.title || ""
            const aiTitle = video.aiData?.aiTitle || ""
            const description = video.aiData?.aiDescription || ""
            const keywords = video.aiData?.keywords || []
            const tags = video.aiData?.tags || []

            const textScore =
                (title.toLowerCase().includes(q.toLowerCase()) ? 3 : 0) +
                (aiTitle.toLowerCase().includes(q.toLowerCase()) ? 3 : 0) +
                (description.toLowerCase().includes(q.toLowerCase()) ? 2 : 0)

            const keywordTagScore = terms.reduce((acc, term) => {
                const keywordHit = keywords.some((k) =>
                    (k || "").toLowerCase().includes(term)
                )
                const tagHit = tags.some((t) =>
                    (t || "").toLowerCase().includes(term)
                )
                return acc + (keywordHit ? 1 : 0) + (tagHit ? 1 : 0)
            }, 0)

            return {
                publicId: video.publicId,
                title: video.title,
                aiTitle: video.aiData?.aiTitle ?? null,
                aiDescription: video.aiData?.aiDescription ?? null,
                channel: video.channel,
                uploaderAvatarKey: video.channel.user?.avatarKey ?? null,
                uploaderAvatarUrl: video.channel.user?.avatarKey
                    ? signCloudFrontUrl(video.channel.user.avatarKey)
                    : null,
                uploaderName: video.channel.user?.name ?? null,
                createdAt: video.createdAt,
                thumbnailKey: video.thumbnailKey,
                orientation: video.metadata?.orientation ?? null,
                signedUrl: signCloudFrontUrl(video.s3Key),
                size: video.size,
                score: textScore + keywordTagScore
            }
        })
        .sort((a, b) => b.score - a.score)
        .map(({ score: _score, ...video }) => video)
}

export const getVideoById = async (publicId: string, userId?: string) => {
    const access = userId
        ? await getOrganizationAccessContext(userId)
        : {
            activeOrganizationId: null,
            membershipRole: null,
            canSeePublic: true,
            canSeePrivate: false,
            canSeeOrganization: false,
            canUpload: true,
            restrictToAdminUploads: false
        }

    const video = await prisma.video.findFirst({
        where: {
            publicId, // ✅ CHANGED
            status: ACTIVE_VIDEO_STATUS
        },
        include: {
            channel: {
                select: {
                    name: true,
                    username: true,
                    userId: true,
                    user: {
                        select: {
                            avatarKey: true,
                            name: true
                        }
                    }
                }
            },
            aiData: true,
            metadata: {
                select: {
                    orientation: true
                }
            }
        }
    })

    if (!video) {
        throw new Error("Video not found")
    }

    if (
        video.visibility === "PRIVATE" &&
        video.channel.userId !== userId &&
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

    if (
        video.visibility === "ORGANIZATION" &&
        access.restrictToAdminUploads &&
        access.activeOrganizationId
    ) {
        const admins = await prisma.organizationMembership.findMany({
            where: {
                organizationId: access.activeOrganizationId,
                status: "APPROVED",
                role: "ADMIN"
            },
            select: { userId: true }
        })
        const adminIds = new Set(admins.map((a) => a.userId))
        if (!adminIds.has(video.channel.userId)) {
            throw new Error("This video is restricted to admin uploads")
        }
    }

    return {
        id: video.id, // keep internal id if needed
        publicId: video.publicId, // ✅ ADD THIS
        title: video.title,
        aiTitle: video.aiData?.aiTitle ?? null,
        aiDescription: video.aiData?.aiDescription ?? null,
        channel: video.channel,
        uploaderAvatarKey: video.channel.user?.avatarKey ?? null,
        uploaderAvatarUrl: video.channel.user?.avatarKey
            ? signCloudFrontUrl(video.channel.user.avatarKey)
            : null,
        uploaderName: video.channel.user?.name ?? null,
        createdAt: video.createdAt,
        thumbnailKey: video.thumbnailKey,
        orientation: video.metadata?.orientation ?? null,
        signedUrl: signCloudFrontUrl(video.s3Key),
        size: video.size.toString(),
        visibility: video.visibility
    }
}

type SpriteMeta = {
    frameWidth: number
    frameHeight: number
    cols: number
    rows: number
    totalFrames: number
    intervalSec: number
}

const streamToString = async (stream: any): Promise<string> => {
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks).toString("utf-8")
}

const getOwnedVideo = async (userId: string, videoId: string) => {
    const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: {
            channel: {
                select: {
                    userId: true,
                    username: true
                }
            }
        }
    })

    if (!video) throw new Error("Video not found")
    if (video.channel.userId !== userId) throw new Error("Unauthorized")
    if (video.status !== ACTIVE_VIDEO_STATUS) throw new Error("Video not found")

    return video
}

export const getUploadSpritesheet = async (userId: string, videoId: string) => {
    const video = await getOwnedVideo(userId, videoId)

    const spritesheetKey = `${video.channel.username}/spritesheets/${video.id}/sheet.webp`
    const metaKey = `${video.channel.username}/spritesheets/${video.id}/meta.json`

    let metaObject

    try {
        metaObject = await s3.send(
            new GetObjectCommand({
                Bucket: AWS_BUCKET,
                Key: metaKey
            })
        )
    } catch (error: any) {
        if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
            throw new HttpError(404, "Spritesheet is not ready yet")
        }

        throw error
    }

    const metaRaw = await streamToString(metaObject.Body)
    const meta = JSON.parse(metaRaw) as SpriteMeta

    return {
        spritesheetKey,
        spritesheetUrl: signCloudFrontUrl(spritesheetKey),
        ...meta
    }
}

export const saveThumbnailFromSpritesheet = async (
    userId: string,
    videoId: string,
    frameIndex: number
) => {
    const video = await getOwnedVideo(userId, videoId)

    const spritesheetKey = `${video.channel.username}/spritesheets/${video.id}/sheet.webp`
    const metaKey = `${video.channel.username}/spritesheets/${video.id}/meta.json`

    const metaObject = await s3.send(
        new GetObjectCommand({
            Bucket: AWS_BUCKET,
            Key: metaKey
        })
    )

    const metaRaw = await streamToString(metaObject.Body)
    const meta = JSON.parse(metaRaw) as SpriteMeta

    if (frameIndex < 0 || frameIndex >= meta.totalFrames) {
        throw new Error("Invalid frame index")
    }

    const col = frameIndex % meta.cols
    const row = Math.floor(frameIndex / meta.cols)
    const x = col * meta.frameWidth
    const y = row * meta.frameHeight

    const tempSheetPath = path.join(os.tmpdir(), `sheet_${videoId}_${Date.now()}.webp`)
    const tempThumbPath = path.join(os.tmpdir(), `sprite_thumb_${videoId}_${Date.now()}.jpg`)

    try {
        const sheetObject = await s3.send(
            new GetObjectCommand({
                Bucket: AWS_BUCKET,
                Key: spritesheetKey
            })
        )

        await pipeline(sheetObject.Body as any, fs.createWriteStream(tempSheetPath))

        const cropCommand = `ffmpeg -i "${tempSheetPath}" -vf "crop=${meta.frameWidth}:${meta.frameHeight}:${x}:${y}" -q:v 2 -y "${tempThumbPath}"`
        await execAsync(cropCommand)

        const thumbnailKey = `${video.channel.username}/thumbnails/sprite_${video.id}_${frameIndex}_${Date.now()}.jpg`
        const buffer = fs.readFileSync(tempThumbPath)

        await s3.send(
            new PutObjectCommand({
                Bucket: AWS_BUCKET,
                Key: thumbnailKey,
                Body: buffer,
                ContentType: "image/jpeg"
            })
        )

        await prisma.video.update({
            where: { id: video.id },
            data: { thumbnailKey }
        })

        return {
            thumbnailKey,
            thumbnailUrl: signCloudFrontUrl(thumbnailKey)
        }
    } finally {
        if (fs.existsSync(tempSheetPath)) fs.unlinkSync(tempSheetPath)
        if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath)
    }
}

export const updateOwnedVideo = async (
    userId: string,
    publicId: string,
    payload: {
        title?: string
        description?: string
        thumbnailKey?: string
    }
) => {
    const video = await prisma.video.findFirst({
        where: { publicId },
        include: {
            channel: {
                select: {
                    userId: true
                }
            }
        }
    })

    if (!video) {
        throw new Error("Video not found")
    }

    if (video.channel.userId !== userId) {
        throw new Error("Unauthorized")
    }

    const title = payload.title?.trim()
    const description = payload.description?.trim()

    const updatedVideo = await prisma.video.update({
        where: { id: video.id },
        data: {
            ...(title !== undefined ? { title } : {}),
            ...(payload.thumbnailKey ? { thumbnailKey: payload.thumbnailKey } : {})
        }
    })

    if (description !== undefined) {
        await prisma.videoAI.upsert({
            where: { videoId: video.id },
            update: {
                aiDescription: description
            },
            create: {
                videoId: video.id,
                status: "completed",
                aiDescription: description,
                keywords: [],
                tags: []
            }
        })
    }

    return updatedVideo
}

export const deleteOwnedVideo = async (
    userId: string,
    publicId: string
) => {
    const video = await prisma.video.findFirst({
        where: { publicId },
        include: {
            channel: {
                select: {
                    userId: true
                }
            }
        }
    })

    if (!video) {
        throw new Error("Video not found")
    }

    if (video.channel.userId !== userId) {
        throw new Error("Unauthorized")
    }

    if (video.status !== ACTIVE_VIDEO_STATUS) {
        throw new Error("Video not found")
    }

    await prisma.video.update({
        where: { id: video.id },
        data: {
            status: "DELETED"
        }
    })

    return { success: true }
}
