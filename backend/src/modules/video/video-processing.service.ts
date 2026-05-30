// @ts-nocheck
import fs from "fs"
import os from "os"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { prisma } from "../../config/prisma"
import { s3 } from "../../config/s3"
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { videoAIQueue } from "../../queues/video-ai.queue"
import { thumbnailQueue, videoMetadataQueue } from "../../services/video-processing.service"
import { pipeline } from "stream/promises"
import { logger } from "../../utils/logger"
import { formatDurationMs } from "../../utils/time"
import { ffmpegCommand } from "../../config/ffmpeg"

const execAsync = promisify(exec)
const MAX_SPRITE_FRAMES = 120
const STREAMABLE_EXTENSIONS = new Set([".mp4", ".m4v", ".mov"])
const RETAIN_COMPLETED_JOBS = {
    age: 3600,
    count: 500
}
const RETAIN_FAILED_JOBS = {
    age: 24 * 3600,
    count: 1000
}

const optimizeVideoForStreaming = async (
    inputPath: string,
    s3Key: string
) => {
    const ext = path.extname(s3Key).toLowerCase()
    if (!STREAMABLE_EXTENSIONS.has(ext)) return inputPath

    const optimizedPath = path.join(os.tmpdir(), `${path.basename(inputPath, path.extname(inputPath))}_faststart.mp4`)

    await execAsync(
        `${ffmpegCommand} -i "${inputPath}" -map 0 -c copy -movflags +faststart -y "${optimizedPath}"`
    )

    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: s3Key,
            Body: fs.createReadStream(optimizedPath),
            ContentType: "video/mp4",
            CacheControl: "public, max-age=31536000"
        })
    )

    return optimizedPath
}

export const processVideoAfterUpload = async (
    videoId: string,
    s3Key: string,
    channelUsername: string
) => {
    const startedAt = Date.now()
    logger.info("VIDEO_PROCESSING", "Upload processing started")
    let sourceVideoPath = ""
    let tempVideoPath = ""
    let optimizedVideoPath = ""
    let tempSpritePath = ""

    const generateSpritesheet = async () => {
        tempSpritePath = path.join(os.tmpdir(), `${videoId}_spritesheet.webp`)

        const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempVideoPath}"`
        )

        const duration = Math.max(1, Number.parseFloat(stdout) || 1)
        const totalFrames = Math.max(1, Math.min(MAX_SPRITE_FRAMES, duration))
        const intervalSec =
            totalFrames <= 1
                ? Math.max(1, Math.round(duration))
                : Math.max(1, Math.round(duration / (totalFrames - 1)))

        const cols = Math.min(10, totalFrames)
        const rows = Math.ceil(totalFrames / cols)
        const frameWidth = 480
        const frameHeight = 270
        const fpsValue = totalFrames <= 1 ? 1 : totalFrames / Math.max(duration, 1)

        const sheetCommand =
            `${ffmpegCommand} -i "${tempVideoPath}" ` +
            `-vf "fps=${fpsValue},scale=${frameWidth}:${frameHeight}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${frameWidth}:${frameHeight}:(ow-iw)/2:(oh-ih)/2:color=black,tile=${cols}x${rows}" ` +
            `-frames:v 1 -c:v libwebp -quality 96 -compression_level 4 -y "${tempSpritePath}"`

        await execAsync(sheetCommand)

        const spritesheetKey = `${channelUsername}/spritesheets/${videoId}/sheet.webp`
        const metaKey = `${channelUsername}/spritesheets/${videoId}/meta.json`

        await s3.send(
            new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET!,
                Key: spritesheetKey,
                Body: fs.createReadStream(tempSpritePath),
                ContentType: "image/webp"
            })
        )

        const meta = {
            frameWidth,
            frameHeight,
            cols,
            rows,
            totalFrames,
            intervalSec
        }

        await s3.send(
            new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET!,
                Key: metaKey,
                Body: JSON.stringify(meta),
                ContentType: "application/json"
            })
        )
    }

    try {
        sourceVideoPath = path.join(os.tmpdir(), `${videoId}_video.mp4`)
        tempVideoPath = sourceVideoPath

        const object = await s3.send(
            new GetObjectCommand({
                Bucket: process.env.AWS_BUCKET!,
                Key: s3Key
            })
        )

        await pipeline(object.Body as any, fs.createWriteStream(sourceVideoPath))
        logger.info("VIDEO_PROCESSING", "Upload file was prepared for processing")

        try {
            optimizedVideoPath = await optimizeVideoForStreaming(tempVideoPath, s3Key)
            tempVideoPath = optimizedVideoPath
            logger.info("VIDEO_PROCESSING", "Upload video was optimized")
        } catch (streamingError) {
            logger.warn("VIDEO_PROCESSING", "Upload video optimization was skipped", {
                error: streamingError instanceof Error ? streamingError : new Error(String(streamingError))
            })
        }

        try {
            await generateSpritesheet()
            logger.info("VIDEO_PROCESSING", "Preview images were created")
        } catch (spriteError) {
            logger.warn("VIDEO_PROCESSING", "Preview images could not be created", {
                error: spriteError instanceof Error ? spriteError : new Error(String(spriteError))
            })
        }
    } catch (error) {
        logger.error("VIDEO_PROCESSING", `Upload processing failed after ${formatDurationMs(Date.now() - startedAt)}`, {
            error: error instanceof Error ? error : new Error(String(error))
        })

        throw error

    } finally {

        if (sourceVideoPath && fs.existsSync(sourceVideoPath)) fs.unlinkSync(sourceVideoPath)
        if (optimizedVideoPath && fs.existsSync(optimizedVideoPath)) fs.unlinkSync(optimizedVideoPath)
        if (tempSpritePath && fs.existsSync(tempSpritePath)) fs.unlinkSync(tempSpritePath)
        logger.info("VIDEO_PROCESSING", `Upload processing finished in ${formatDurationMs(Date.now() - startedAt)}`)

    }

}

export const startVideoPostUploadPipeline = async (
    videoId: string,
    s3Key: string,
    channelUsername: string,
    initialDescription?: string
) => {
    if (initialDescription?.trim()) {
        await prisma.videoAI.upsert({
            where: { videoId },
            update: {
                aiDescription: initialDescription.trim()
            },
            create: {
                videoId,
                status: "idle",
                aiDescription: initialDescription.trim(),
                keywords: [],
                tags: []
            }
        })
    }

    const metadataJob = await videoMetadataQueue.add(
        "extractVideoMetadata",
        { videoId },
        {
            jobId: `video-metadata-${videoId}`,
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: RETAIN_COMPLETED_JOBS,
            removeOnFail: RETAIN_FAILED_JOBS
        }
    )
    if (metadataJob.id) {
        logger.info("VIDEO_PROCESSING", "Metadata worker was queued")
    }

    logger.info("VIDEO_PROCESSING", "AI and spritesheet generation will wait for user request", {
        videoId
    })
}

export const startRequestedAIAssets = async (
    userId: string,
    publicId: string,
    options?: {
        ai?: boolean
        thumbnail?: boolean
        spritesheet?: boolean
    }
) => {
    const shouldQueueAI = options?.ai !== false
    const shouldQueueThumbnail = options?.thumbnail !== false
    const shouldGenerateSpritesheet = options?.spritesheet !== false

    const video = await prisma.video.findFirst({
        where: {
            publicId,
            status: "ACTIVE"
        },
        include: {
            aiData: true,
            channel: {
                select: {
                    userId: true,
                    username: true
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

    let aiQueued = false
    let thumbnailQueued = false
    let spritesheetQueued = false
    const thumbnailRequestStatus = video.aiThumbnailStatus || "idle"

    if (shouldQueueAI) {
        if (video.aiData && video.aiData.status !== "idle") {
            logger.info("VIDEO_PROCESSING", "AI worker was not queued because it already ran or is queued", {
                videoId: video.id,
                status: video.aiData.status
            })
        } else {
            await prisma.videoAI.upsert({
                where: { videoId: video.id },
                update: { status: "pending" },
                create: {
                    videoId: video.id,
                    status: "pending",
                    keywords: [],
                    tags: []
                }
            })

            const videoAIJob = await videoAIQueue.add(
                "processVideoAI",
                { videoId: video.id, requestedByUser: true },
                {
                    jobId: `video-ai-${video.id}`,
                    attempts: 1,
                    removeOnComplete: RETAIN_COMPLETED_JOBS,
                    removeOnFail: RETAIN_FAILED_JOBS
                }
            )
            if (videoAIJob.id) {
                aiQueued = true
                logger.info("VIDEO_PROCESSING", "AI worker was queued by user request")
            }

            if (shouldGenerateSpritesheet) {
                spritesheetQueued = true
                setImmediate(() => {
                    void processVideoAfterUpload(video.id, video.s3Key, video.channel.username).catch((error) => {
                        logger.error("VIDEO_PROCESSING", "Requested spritesheet generation failed", {
                            error: error instanceof Error ? error : new Error(String(error))
                        })
                    })
                })
                logger.info("VIDEO_PROCESSING", "Spritesheet generation was queued by user request")
            }
        }
    }

    if (shouldQueueThumbnail) {
        if (video.thumbnailKey || thumbnailRequestStatus !== "idle") {
            logger.info("VIDEO_PROCESSING", "Thumbnail worker was not queued because it already ran or is queued", {
                videoId: video.id,
                status: video.thumbnailKey ? "completed" : thumbnailRequestStatus
            })
        } else {
            await prisma.video.update({
                where: { id: video.id },
                data: { aiThumbnailStatus: "pending" }
            })

            const thumbnailJob = await thumbnailQueue.add(
                "generateThumbnail",
                { videoId: video.id, requestedByUser: true },
                {
                    jobId: `thumbnail-${video.id}`,
                    attempts: 1,
                    removeOnComplete: RETAIN_COMPLETED_JOBS,
                    removeOnFail: RETAIN_FAILED_JOBS
                }
            )
            if (thumbnailJob.id) {
                thumbnailQueued = true
                logger.info("VIDEO_PROCESSING", "Thumbnail worker was queued by user request")
            }
        }
    }

    return {
        videoId: video.id,
        publicId: video.publicId,
        aiQueued,
        thumbnailQueued,
        spritesheetQueued
    }
}
