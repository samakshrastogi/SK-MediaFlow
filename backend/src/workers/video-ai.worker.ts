import { Worker, Job } from "bullmq"
import { prisma } from "../config/prisma"
import fs from "fs"
import os from "os"
import path from "path"
import ffmpeg from "fluent-ffmpeg"
import { exec } from "child_process"
import axios from "axios"
import { redisConnection } from "../config/redis"
import { s3 } from "../config/s3"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { pipeline } from "stream/promises"
import { logger } from "../utils/logger"
import { formatDurationMs } from "../utils/time"

ffmpeg.setFfmpegPath("ffmpeg")

const SHOULD_WRITE_REDIS_PROGRESS = process.env.ENABLE_REDIS_PROGRESS === "true"
const MIN_REDIS_PROGRESS_STEP = 45
const MIN_REDIS_PROGRESS_INTERVAL_MS = 30000

const ensureExists = (filePath: string) => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not created: ${filePath}`)
    }
}

const safeDelete = (filePath: string) => {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch {
    }
}

const runWhisper = (audioPath: string, outputDir: string): Promise<string> => {
    return new Promise((resolve, reject) => {

        const cmd = `whisper "${audioPath}" \
--model tiny.en \
--fp16 False \
--threads 4 \
--language en \
--output_dir "${outputDir}"`

        exec(cmd, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout) => {
            if (err) {
                return reject(err)
            }

            const transcript = stdout
                .split("\n")
                .filter(l => l.includes("-->"))
                .map(l => l.replace(/\[.*?\]/, "").trim())
                .join(" ")

            if (!transcript) return reject(new Error("Transcript empty"))

            resolve(transcript)
        })
    })
}

const runOllama = async (prompt: string): Promise<string> => {
    const res = await axios.post(
        "http://localhost:11434/api/generate",
        {
            model: "phi3",
            prompt,
            stream: false,
            options: {
                num_predict: 120,
                temperature: 0.7
            }
        },
        {
            timeout: 300000 // ✅ 5 minutes
        }
    )

    return res.data.response
}

const extractJSON = (text: string) => {
    try {
        const match = text.match(/\{[\s\S]*\}/)
        return match ? JSON.parse(match[0]) : {}
    } catch {
        return {}
    }
}

const normalizeArray = (val: any) => {
    if (Array.isArray(val)) return val
    if (typeof val === "string") return val.split(",").map(v => v.trim()).filter(Boolean)
    return []
}

const shorten = (text: string) =>
    text.split(/\s+/).slice(0, 120).join(" ")

const generateTitle = (text: string) => {
    const first = text.split(".")[0]
    return first.length > 20 ? first.slice(0, 80) : "Interesting Video Content"
}

const generateDescription = (text: string) => {
    const sentences = text.split(".").slice(0, 2).join(".")
    return sentences.length > 30
        ? sentences
        : "This video explains useful insights from the uploaded content."
}

const processVideoAI = async (job: Job) => {

    const { videoId } = job.data
    const startedAt = Date.now()
    logger.info("VIDEO_AI_WORKER", "AI worker started")
    let lastRedisProgress = -1
    let lastRedisProgressAt = 0

    const updateProgress = async (progress: number, force = false) => {
        if (!SHOULD_WRITE_REDIS_PROGRESS) {
            return
        }

        const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)))
        const now = Date.now()
        const progressedEnough =
            lastRedisProgress < 0 ||
            normalizedProgress - lastRedisProgress >= MIN_REDIS_PROGRESS_STEP
        const waitedEnough =
            now - lastRedisProgressAt >= MIN_REDIS_PROGRESS_INTERVAL_MS

        if (!force && normalizedProgress !== 100 && !progressedEnough && !waitedEnough) {
            return
        }

        lastRedisProgress = normalizedProgress
        lastRedisProgressAt = now
        await job.updateProgress({ videoId, progress: normalizedProgress })
    }

    const uniqueId = `${videoId}-${Date.now()}`
    const tmpDir = os.tmpdir()

    const tempVideo = path.join(tmpDir, `${uniqueId}.mp4`)
    const tempAudio = path.join(tmpDir, `${uniqueId}.mp3`)

    const createdFiles: string[] = []

    try {
        await updateProgress(5)

        const video = await prisma.video.findUnique({ where: { id: videoId } })
        if (!video) throw new Error("Video not found")
        await updateProgress(12)

        await prisma.videoAI.update({
            where: { videoId },
            data: { status: "processing" }
        })
        await updateProgress(18)

        const obj = await s3.send(new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: video.s3Key
        }))

        await pipeline(obj.Body as any, fs.createWriteStream(tempVideo))
        ensureExists(tempVideo)
        createdFiles.push(tempVideo)
        await updateProgress(35)

        await new Promise((resolve, reject) => {
            ffmpeg(tempVideo)
                .noVideo()
                .audioCodec("libmp3lame")
                .audioFrequency(16000)
                .audioChannels(1)
                .duration(60) // ✅ FIXED 60 sec
                .save(tempAudio)
                .on("end", resolve)
                .on("error", reject)
        })
        ensureExists(tempAudio)
        createdFiles.push(tempAudio)
        await updateProgress(55)

        const transcript = await runWhisper(tempAudio, tmpDir)
        await updateProgress(72)

        const raw = await runOllama(`
You are a professional content writer.

RETURN ONLY JSON:
{
  "title": "engaging title",
  "description": "clear summary",
  "keywords": ["k1","k2","k3"],
  "tags": ["t1","t2","t3"]
}

Transcript:
${shorten(transcript)}
`)
        await updateProgress(88)

        const parsed = extractJSON(raw)

        const keywords = normalizeArray(parsed.keywords)
        const tags = normalizeArray(parsed.tags)

        await prisma.videoAI.update({
            where: { videoId },
            data: {
                transcript,
                keywords: keywords.length ? keywords : ["video"],
                tags: tags.length ? tags : ["general"],
                aiTitle: parsed.title || generateTitle(transcript),
                aiDescription: parsed.description || generateDescription(transcript),
                status: "completed"
            }
        })

        await updateProgress(100, true)
        logger.info("VIDEO_AI_WORKER", `AI worker finished in ${formatDurationMs(Date.now() - startedAt)}`)
        return { videoId }

    } catch (err) {
        await prisma.videoAI.update({
            where: { videoId },
            data: { status: "failed" }
        })

        logger.error("VIDEO_AI_WORKER", `AI worker failed after ${formatDurationMs(Date.now() - startedAt)}`, {
            error: err instanceof Error ? err : new Error(String(err))
        })

        throw err

    } finally {

        for (const file of createdFiles) safeDelete(file)
    }
}

const worker = new Worker(
    "videoAIQueue",
    processVideoAI,
    {
        connection: redisConnection as any,
        skipVersionCheck: true,
        concurrency: 1,
        drainDelay: 60,
        lockDuration: 10 * 60 * 1000,
        stalledInterval: 5 * 60 * 1000
    }
)

worker.on("failed", (job, error) => {
    logger.error("VIDEO_AI_WORKER", "AI worker failed", { error })
})

worker.on("error", (error) => {
    logger.error("VIDEO_AI_WORKER", "AI worker Redis error", { error })
})

export default worker
