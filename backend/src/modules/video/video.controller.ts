// @ts-nocheck
import { Response } from "express"
import {
    generatePresignedUrl,
    generateThumbnailPresignedUrl,
    completeUpload,
    scanS3Videos,
    getVideoById,
    getAllVideos,
    getPortraitVideos,
    getOrganizationRowVideos,
    searchVideos,
    getUploadSpritesheet,
    saveThumbnailFromSpritesheet,
    updateOwnedVideo,
    deleteOwnedVideo
} from "./video.service"
import { nanoid } from "nanoid"
import { prisma } from "../../config/prisma"
import { AuthRequest } from "../../middlewares/auth.middleware"
import { startVideoPostUploadPipeline } from "./video-processing.service"
import { getSignedUrl as getCFSignedUrl } from "@aws-sdk/cloudfront-signer"

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

const normalizeId = (value: unknown) => String(value || "").trim()

export const getPresignedUrl = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { fileName, fileType } = req.body

        if (!fileName || !fileType) {
            return res.status(400).json({
                success: false,
                message: "fileName and fileType are required"
            })
        }

        const result = await generatePresignedUrl(
            req.user.id,
            fileName,
            fileType
        )

        return res.json({
            success: true,
            data: result
        })
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to generate upload URL"
        })
    }
}

export const finishUpload = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { key, title, description, size, visibility, thumbnailKey } = req.body

        if (!key || !size) {
            return res.status(400).json({
                success: false,
                message: "key and size are required"
            })
        }

        const video = await completeUpload(
            req.user.id,
            key,
            title,
            Number(size),
            visibility,
            description,
            thumbnailKey
        )

        return res.status(201).json({
            success: true,
            data: {
                ...video,
                size: video.size.toString()
            }
        })
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to complete upload"
        })
    }
}

export const handleScanS3 = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const summary = await scanS3Videos(req.user.id)

        return res.json({
            success: true,
            data: summary
        })
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to scan S3"
        })
    }
}

export const importSelectedVideos = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { keys } = req.body

        if (!Array.isArray(keys) || keys.length === 0) {
            return res.status(400).json({
                success: false,
                message: "keys array is required"
            })
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { channel: true }
        })

        if (!user?.channel) {
            return res.status(400).json({
                success: false,
                message: "Channel not found"
            })
        }

        const imported: string[] = []

        for (const key of keys) {
            const exists = await prisma.video.findUnique({
                where: { s3Key: key }
            })

            if (!exists) {
                const video = await prisma.video.create({
                    data: {
                        publicId: nanoid(10), // ✅ ADD THIS LINE

                        title: key.split("/").pop() || "Untitled",
                        s3Key: key,
                        size: "0",
                        uploadSource: "S3_IMPORT",
                        status: "ACTIVE",
                        channelId: user.channel.id,
                        visibility: "PUBLIC"
                    }
                })

                await startVideoPostUploadPipeline(
                    video.id,
                    key,
                    user.channel.username
                )

                imported.push(key)
            }
        }

        return res.json({
            success: true,
            importedCount: imported.length,
            imported
        })
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to import videos"
        })
    }
}

export const handleGetVideos = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const videos = await getAllVideos(req.user?.id)

        return res.json({
            success: true,
            data: videos.map((video) => ({
                ...video,
                size: video.size.toString()
            }))
        })
    } catch {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch videos"
        })
    }
}

export const handleGetVideoById = async (
    req: AuthRequest,
    res: Response
) => {

    const publicId = req.params.publicId

    if (!publicId) {
        return res.status(400).json({
            success: false,
            message: "Invalid video id"
        })
    }

    try {

        const video = await getVideoById(publicId, req.user?.id)

        return res.json({
            success: true,
            data: video
        })

    } catch (error: any) {

        return res.status(404).json({
            success: false,
            message: error.message || "Video not found"
        })

    }
}

export const handleGetAIInsights = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const aiVideos = await prisma.videoAI.findMany({
            select: {
                keywords: true,
                tags: true,
                aiTitle: true
            }
        })

        const keywordMap: Record<string, number> = {}
        const tagMap: Record<string, number> = {}
        const titleMap: Record<string, number> = {}

        aiVideos.forEach((video) => {
            video.keywords.forEach((k) => {
                keywordMap[k] = (keywordMap[k] || 0) + 1
            })

            video.tags.forEach((t) => {
                tagMap[t] = (tagMap[t] || 0) + 1
            })

            if (video.aiTitle) {
                titleMap[video.aiTitle] =
                    (titleMap[video.aiTitle] || 0) + 1
            }
        })

        const sortMap = (map: Record<string, number>) =>
            Object.entries(map)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map((x) => x[0])

        return res.json({
            success: true,
            data: {
                totalVideosProcessed: aiVideos.length,
                topKeywords: sortMap(keywordMap),
                topTags: sortMap(tagMap),
                topAITitles: sortMap(titleMap)
            }
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch AI insights"
        })
    }
}
export const handleGetChannelPublicVideos = async (req, res) => {
    try {
        const { channelId } = req.params

        const videos = await prisma.video.findMany({
            where: {
                channelId: normalizeId(channelId),
                status: "ACTIVE",
                visibility: "PUBLIC"
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
            orderBy: {
                createdAt: "desc"
            }
        })

        // ✅ FIX HERE
        const formatted = videos.map(v => ({
            id: v.id,
            publicId: v.publicId,
            title: v.title,
            aiTitle: v.aiData?.aiTitle ?? null,
            aiDescription: v.aiData?.aiDescription ?? null,
            thumbnailKey: v.thumbnailKey,
            channel: { name: v.channel?.name || "Unknown channel" },
            uploaderAvatarKey: v.channel?.user?.avatarKey ?? null,
            uploaderAvatarUrl: v.channel?.user?.avatarKey
                ? signCloudFrontUrl(v.channel.user.avatarKey)
                : null,
            uploaderName: v.channel?.user?.name ?? null,
            size: v.size.toString(), // 🔥 IMPORTANT
            createdAt: v.createdAt
        }))

        res.json({
            success: true,
            data: formatted
        })

    } catch (err) {
        res.status(500).json({ success: false })
    }
}
export const handleGetChannelPrivateVideos = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { channelId } = req.params

        // ✅ ensure user owns this channel
        const channel = await prisma.channel.findUnique({
            where: { id: normalizeId(channelId) }
        })

        if (!channel || channel.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            })
        }

        const videos = await prisma.video.findMany({
            where: {
                channelId: normalizeId(channelId),
                status: "ACTIVE",
                visibility: "PRIVATE"
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
            orderBy: {
                createdAt: "desc"
            }
        })

        const formatted = videos.map(v => ({
            id: v.id,
            publicId: v.publicId,
            title: v.title,
            aiTitle: v.aiData?.aiTitle ?? null,
            aiDescription: v.aiData?.aiDescription ?? null,
            thumbnailKey: v.thumbnailKey,
            channel: { name: v.channel?.name || "Unknown channel" },
            uploaderAvatarKey: v.channel?.user?.avatarKey ?? null,
            uploaderAvatarUrl: v.channel?.user?.avatarKey
                ? signCloudFrontUrl(v.channel.user.avatarKey)
                : null,
            uploaderName: v.channel?.user?.name ?? null,
            size: v.size.toString(), // ✅ fix
            createdAt: v.createdAt
        }))

        return res.json({
            success: true,
            data: formatted
        })

    } catch (err) {
        return res.status(500).json({ success: false })
    }
}

export const handleGetChannelOrganizationVideos = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { channelId } = req.params

        const channel = await prisma.channel.findUnique({
            where: { id: normalizeId(channelId) }
        })

        if (!channel || channel.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            })
        }

        const videos = await prisma.video.findMany({
            where: {
                channelId: normalizeId(channelId),
                status: "ACTIVE",
                visibility: "ORGANIZATION"
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
            orderBy: {
                createdAt: "desc"
            }
        })

        const formatted = videos.map(v => ({
            id: v.id,
            publicId: v.publicId,
            title: v.title,
            aiTitle: v.aiData?.aiTitle ?? null,
            aiDescription: v.aiData?.aiDescription ?? null,
            thumbnailKey: v.thumbnailKey,
            channel: { name: v.channel?.name || "Unknown channel" },
            uploaderAvatarKey: v.channel?.user?.avatarKey ?? null,
            uploaderAvatarUrl: v.channel?.user?.avatarKey
                ? signCloudFrontUrl(v.channel.user.avatarKey)
                : null,
            uploaderName: v.channel?.user?.name ?? null,
            size: v.size.toString(),
            createdAt: v.createdAt
        }))

        return res.json({
            success: true,
            data: formatted
        })
    } catch (err) {
        return res.status(500).json({ success: false })
    }
}

export const handleGetPortraitVideos = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const videos = await getPortraitVideos(req.user?.id)

        return res.json({
            success: true,
            data: videos.map((video) => ({
                ...video,
                size: video.size.toString()
            }))
        })
    } catch {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch portrait videos"
        })
    }
}

export const handleGetOrganizationRowVideos = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const organizationId = normalizeId(req.params.organizationId)
        if (!organizationId) {
            return res.status(400).json({
                success: false,
                message: "organizationId is required"
            })
        }

        const videos = await getOrganizationRowVideos(req.user.id, organizationId)

        return res.json({
            success: true,
            data: videos.map((video) => ({
                ...video,
                size: video.size.toString()
            }))
        })
    } catch (error: any) {
        const message = error?.message || "Failed to fetch organization videos"
        const status = message === "Organization access required" ? 403 : 500
        return res.status(status).json({
            success: false,
            message
        })
    }
}

export const handleUpdateOwnedVideo = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const publicId = String(req.params.publicId || "").trim()
        if (!publicId) {
            return res.status(400).json({
                success: false,
                message: "publicId is required"
            })
        }

        const { title, description, thumbnailKey } = req.body || {}

        const video = await updateOwnedVideo(req.user.id, publicId, {
            title,
            description,
            thumbnailKey
        })

        return res.json({
            success: true,
            data: {
                id: video.id,
                publicId: video.publicId,
                title: video.title,
                thumbnailKey: video.thumbnailKey
            }
        })
    } catch (error: any) {
        const message = error?.message || "Failed to update video"
        const status =
            message === "Unauthorized" ? 403 : message === "Video not found" ? 404 : 500

        return res.status(status).json({
            success: false,
            message
        })
    }
}

export const handleDeleteOwnedVideo = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const publicId = String(req.params.publicId || "").trim()
        if (!publicId) {
            return res.status(400).json({
                success: false,
                message: "publicId is required"
            })
        }

        await deleteOwnedVideo(req.user.id, publicId)

        return res.json({
            success: true
        })
    } catch (error: any) {
        const message = error?.message || "Failed to delete video"
        const status =
            message === "Unauthorized" ? 403 : message === "Video not found" ? 404 : 500

        return res.status(status).json({
            success: false,
            message
        })
    }
}

export const handleSearchVideos = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        const q = String(req.query.q || "").trim()

        if (!q) {
            return res.json({
                success: true,
                data: []
            })
        }

        const videos = await searchVideos(q, req.user?.id)

        return res.json({
            success: true,
            data: videos.map((video) => ({
                ...video,
                size: video.size.toString()
            }))
        })
    } catch {
        return res.status(500).json({
            success: false,
            message: "Failed to search videos"
        })
    }
}

export const getThumbnailPresignedUrl = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { fileName, fileType } = req.body

        if (!fileName || !fileType) {
            return res.status(400).json({
                success: false,
                message: "fileName and fileType are required"
            })
        }

        const result = await generateThumbnailPresignedUrl(
            req.user.id,
            fileName,
            fileType
        )

        return res.json({
            success: true,
            data: result
        })
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to generate thumbnail upload URL"
        })
    }
}

export const handleGetUploadSpritesheet = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const videoId = normalizeId(req.params.videoId)
        if (!videoId) {
            return res.status(400).json({
                success: false,
                message: "Invalid videoId"
            })
        }

        const data = await getUploadSpritesheet(req.user.id, videoId)

        return res.json({
            success: true,
            data
        })
    } catch (error: any) {
        if (error?.statusCode === 404 && error?.message === "Spritesheet is not ready yet") {
            return res.status(202).json({
                success: false,
                ready: false,
                message: error.message
            })
        }

        return res.status(error?.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to fetch spritesheet"
        })
    }
}

export const handleGetUploadProcessingStatus = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const videoId = normalizeId(req.params.videoId)
        if (!videoId) {
            return res.status(400).json({
                success: false,
                message: "Invalid videoId"
            })
        }

        const video = await prisma.video.findUnique({
            where: { id: videoId },
            select: {
                thumbnailKey: true,
                channel: {
                    select: {
                        userId: true
                    }
                },
                aiData: {
                    select: {
                        status: true
                    }
                }
            }
        })

        if (!video) {
            return res.status(404).json({
                success: false,
                message: "Video not found"
            })
        }

        if (video.channel.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "Access denied"
            })
        }

        const aiStatus = video.aiData?.status || "pending"
        const thumbnailStatus = video.thumbnailKey ? "completed" : "processing"

        return res.json({
            success: true,
            data: {
                aiStatus,
                thumbnailStatus,
                aiProgress:
                    aiStatus === "completed" || aiStatus === "failed"
                        ? 100
                        : aiStatus === "processing"
                            ? 50
                            : 10,
                thumbnailProgress: thumbnailStatus === "completed" ? 100 : 50,
                thumbnailKey: video.thumbnailKey
            }
        })
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch processing status"
        })
    }
}

export const handleSaveThumbnailFromSpritesheet = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const videoId = normalizeId(req.params.videoId)
        const frameIndex = Number(req.body?.frameIndex)

        if (!videoId || Number.isNaN(frameIndex)) {
            return res.status(400).json({
                success: false,
                message: "videoId and frameIndex are required"
            })
        }

        const data = await saveThumbnailFromSpritesheet(
            req.user.id,
            videoId,
            frameIndex
        )

        return res.json({
            success: true,
            data
        })
    } catch (error: any) {
        return res.status(error?.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to save spritesheet thumbnail"
        })
    }
}
