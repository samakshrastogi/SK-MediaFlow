// @ts-nocheck
import fs from "fs"
import os from "os"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { pipeline } from "stream/promises"
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"

import { prisma } from "../config/prisma"
import { s3 } from "../config/s3"

const execAsync = promisify(exec)
const STREAMABLE_EXTENSIONS = new Set([".mp4", ".m4v", ".mov"])

const optimizeVideo = async (videoId: string, s3Key: string) => {
    const ext = path.extname(s3Key).toLowerCase()
    if (!STREAMABLE_EXTENSIONS.has(ext)) return "skipped"

    const sourcePath = path.join(os.tmpdir(), `${videoId}_${Date.now()}${ext || ".mp4"}`)
    const optimizedPath = path.join(os.tmpdir(), `${videoId}_${Date.now()}_faststart.mp4`)

    try {
        const object = await s3.send(
            new GetObjectCommand({
                Bucket: process.env.AWS_BUCKET!,
                Key: s3Key
            })
        )

        await pipeline(object.Body as any, fs.createWriteStream(sourcePath))
        await execAsync(`ffmpeg -i "${sourcePath}" -map 0 -c copy -movflags +faststart -y "${optimizedPath}"`)

        await s3.send(
            new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET!,
                Key: s3Key,
                Body: fs.createReadStream(optimizedPath),
                ContentType: "video/mp4",
                CacheControl: "public, max-age=31536000"
            })
        )

        return "optimized"
    } finally {
        if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath)
        if (fs.existsSync(optimizedPath)) fs.unlinkSync(optimizedPath)
    }
}

const run = async () => {
    const videos = await prisma.video.findMany({
        where: {
            status: "ACTIVE"
        },
        select: {
            id: true,
            s3Key: true
        }
    })

    let optimized = 0
    let skipped = 0
    let failed = 0

    for (const video of videos) {
        try {
            const result = await optimizeVideo(video.id, video.s3Key)
            if (result === "optimized") optimized += 1
            else skipped += 1
        } catch (error) {
            failed += 1
        }
    }

    await prisma.$disconnect()
}

run().catch(async (error) => {
    await prisma.$disconnect()
    process.exit(1)
})
