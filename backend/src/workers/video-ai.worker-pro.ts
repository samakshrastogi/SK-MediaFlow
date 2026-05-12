import { Worker, Job } from "bullmq"
import { prisma } from "../config/prisma"
import fs from "fs"
import os from "os"
import path from "path"
import ffmpeg from "fluent-ffmpeg"
import { exec } from "child_process"
import axios from "axios"
import { s3 } from "../config/s3"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { pipeline } from "stream/promises"
import { redisConnection } from "../config/redis"
import FormData from "form-data"
import { emitProcessingEvent } from "../services/realtime.service"

ffmpeg.setFfmpegPath("ffmpeg")

const extractAudio = (videoPath: string, audioPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .noVideo()
            .audioCodec("libmp3lame")
            .save(audioPath)
            .on("end", () => resolve())
            .on("error", reject)
    })
}


const extractJSON = (text: string) => {

    try {

        const first = text.indexOf("{")
        const last = text.lastIndexOf("}")

        if (first === -1 || last === -1) return {}

        return JSON.parse(text.substring(first, last + 1))

    } catch {
        return {}
    }

}

const normalizeArray = (value: any) => {

    if (Array.isArray(value)) return value

    if (typeof value === "string") {
        return value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
    }

    return []

}

const shortenTranscript = (text: string) => {
    const words = text.split(/\s+/)
    return words.slice(0, 300).join(" ")
}

const processVideoAI = async (job: Job) => {

    const { videoId } = job.data

    const updateProgress = async (progress: number) => {
        await job.updateProgress({ videoId, progress })
        emitProcessingEvent("ai-progress", { videoId, progress })
    }

    await updateProgress(5)

    const video = await prisma.video.findUnique({
        where: { id: videoId }
    })

    if (!video) throw new Error("Video not found")

    const tempVideoPath = path.join(os.tmpdir(), `${videoId}_video.mp4`)
    const tempAudioPath = path.join(os.tmpdir(), `${videoId}_audio.mp3`)

    try {

        await prisma.videoAI.update({
            where: { videoId },
            data: { status: "processing" }
        })

        const object = await s3.send(
            new GetObjectCommand({
                Bucket: process.env.AWS_BUCKET!,
                Key: video.s3Key
            })
        )

        await pipeline(object.Body as any, fs.createWriteStream(tempVideoPath))

        await updateProgress(25)

        await extractAudio(tempVideoPath, tempAudioPath)

        await updateProgress(45)

        const form = new FormData()
        form.append("file", fs.createReadStream(tempAudioPath))

        const whisperRes = await axios.post(
            `${process.env.AI_SERVER_URL}/transcribe`,
            form,
            {
                headers: form.getHeaders(),
                maxBodyLength: Infinity
            }
        )

        const transcript = whisperRes.data.transcript

        await updateProgress(65)

        const rawResponseRes = await axios.post(
            `${process.env.AI_SERVER_URL}/generate`,
            {
                prompt: `
You are a strict JSON generator.

Return ONLY valid JSON. No explanation. No text outside JSON.

Format:
{
  "title": "string",
  "description": "string",
  "keywords": ["string"],
  "tags": ["string"]
}

Rules:
- Title must be short and catchy
- Description must be 2-3 sentences
- Keywords = 5 relevant words
- Tags = 5 short tags

Transcript:
${shortenTranscript(transcript)}
`
            }
        )

        const rawResponse = rawResponseRes.data.response

        const parsed = extractJSON(rawResponse)

        const keywords = normalizeArray(parsed.keywords)
        const tags = normalizeArray(parsed.tags)

        const aiTitle =
            typeof parsed.title === "string"
                ? parsed.title
                : transcript.split(".")[0].slice(0, 80)

        const aiDescription =
            typeof parsed.description === "string"
                ? parsed.description
                : transcript.slice(0, 200)

        await updateProgress(90)

        await prisma.videoAI.update({
            where: { videoId },
            data: {
                transcript,
                keywords,
                tags,
                aiTitle,
                aiDescription,
                status: "completed"
            }
        })

        await updateProgress(100)
        emitProcessingEvent("ai-completed", { videoId })

        return { videoId }

    } catch (error) {

        const fallbackDescription = video.title?.trim() || "Uploaded video"

        await prisma.videoAI.update({
            where: { videoId },
            data: {
                status: "failed",
                aiDescription: fallbackDescription
            }
        })
        emitProcessingEvent("ai-failed", { videoId })

        throw error

    } finally {

        try {
            if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath)
            if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath)
        } catch { }

    }

}

const worker = new Worker(
    "videoAIQueue",
    processVideoAI,
    {
        connection: redisConnection as any,
        skipVersionCheck: true,
        concurrency: 1,
        limiter: {
            max: 10,
            duration: 1000
        }
    }
)

worker.on("completed", () => {})

worker.on("failed", () => {})

export default worker
