import { Worker } from "bullmq"
import { prisma } from "../config/prisma"
import { processThumbnailPipeline } from "../services/thumbnail.service"
import { redisConnection } from "../config/redis"
import { emitProcessingEvent } from "../services/realtime.service"

const worker = new Worker(
    "thumbnailQueue",
    async (job) => {

        const { videoId } = job.data
        emitProcessingEvent("thumbnail-progress", { videoId, progress: 5 })
        await job.updateProgress(5)

        const video = await prisma.video.findUnique({
            where: { id: videoId }
        })
        if (!video) {
            throw new Error("Video not found")
        }

        emitProcessingEvent("thumbnail-progress", { videoId, progress: 12 })
        await job.updateProgress(12)
        const result = await processThumbnailPipeline(videoId, async (progress) => {
            emitProcessingEvent("thumbnail-progress", { videoId, progress })
            await job.updateProgress(progress)
        })
        await job.updateProgress(100)
        emitProcessingEvent("thumbnail-completed", { videoId, thumbnailKey: result, progress: 100 })

        return { thumbnail: result }

    },
    {
        // ✅ FIX: correct Redis config
        connection: redisConnection as any,
        skipVersionCheck: true,
        concurrency: 5
    }
)

/* ---------------- EVENTS ---------------- */

worker.on("completed", () => {})

worker.on("failed", (job) => {
    emitProcessingEvent("thumbnail-failed", { videoId: job?.data?.videoId })
})

export default worker
