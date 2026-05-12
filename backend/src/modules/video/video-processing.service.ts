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

const execAsync = promisify(exec)
const MAX_SPRITE_FRAMES = 120
const STREAMABLE_EXTENSIONS = new Set([".mp4", ".m4v", ".mov"])

const optimizeVideoForStreaming = async (
    inputPath: string,
    s3Key: string
) => {
    const ext = path.extname(s3Key).toLowerCase()
    if (!STREAMABLE_EXTENSIONS.has(ext)) return inputPath

    const optimizedPath = path.join(os.tmpdir(), `${path.basename(inputPath, path.extname(inputPath))}_faststart.mp4`)

    await execAsync(
        `ffmpeg -i "${inputPath}" -map 0 -c copy -movflags +faststart -y "${optimizedPath}"`
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
    channelUsername: string,
    initialDescription?: string
) => {
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
            `ffmpeg -i "${tempVideoPath}" ` +
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

        try {
            optimizedVideoPath = await optimizeVideoForStreaming(tempVideoPath, s3Key)
            tempVideoPath = optimizedVideoPath
        } catch (streamingError) {
        }

        const currentVideo = await prisma.video.findUnique({
            where: { id: videoId },
            select: { thumbnailKey: true }
        })

        try {
            await generateSpritesheet()
        } catch (spriteError) {
        }

        await prisma.videoAI.upsert({
            where: { videoId },
            update: {
                status: "pending",
                ...(initialDescription?.trim()
                    ? { aiDescription: initialDescription.trim() }
                    : {})
            },
            create: {
                videoId,
                status: "pending",
                aiDescription: initialDescription?.trim() || null,
                keywords: [],
                tags: []
            }
        })

        if (!currentVideo?.thumbnailKey) {
            await thumbnailQueue.add(
                "generateThumbnail",
                { videoId },
                {
                    attempts: 3,
                    backoff: {
                        type: "exponential",
                        delay: 5000
                    },
                    removeOnComplete: true,
                    removeOnFail: false
                }
            )
        }

        await videoAIQueue.add(
            "processVideoAI",
            { videoId },
            {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                },
                removeOnComplete: true,
                removeOnFail: false
            }
        )

        await videoMetadataQueue.add(
            "extractVideoMetadata",
            { videoId },
            {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                },
                removeOnComplete: true,
                removeOnFail: false
            }
        )

    } catch (error) {

        await prisma.videoAI.upsert({
            where: { videoId },
            update: {
                status: "failed"
            },
            create: {
                videoId,
                status: "failed",
                keywords: [],
                tags: []
            }
        })

        throw error

    } finally {

        if (sourceVideoPath && fs.existsSync(sourceVideoPath)) fs.unlinkSync(sourceVideoPath)
        if (optimizedVideoPath && fs.existsSync(optimizedVideoPath)) fs.unlinkSync(optimizedVideoPath)
        if (tempSpritePath && fs.existsSync(tempSpritePath)) fs.unlinkSync(tempSpritePath)

    }

}
