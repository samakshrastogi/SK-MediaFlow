import { Worker } from "bullmq"
import { prisma } from "../config/prisma"
import { processThumbnailPipeline } from "../services/thumbnail.service"
import { redisConnection } from "../config/redis"
import { emitProcessingEvent } from "../services/realtime.service"
import { logger } from "../utils/logger"

const worker = new Worker(
    "thumbnailQueue",
    async (job) => {

        const { videoId } = job.data
        logger.info("THUMBNAIL_WORKER", "Thumbnail job started", {
            jobId: job.id,
            videoId
        })
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
        logger.info("THUMBNAIL_WORKER", "Thumbnail job completed", {
            jobId: job.id,
            videoId,
            thumbnailKey: result
        })

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

worker.on("completed", (job) => {
    logger.info("THUMBNAIL_WORKER", "Worker marked thumbnail job completed", {
        jobId: job.id,
        videoId: job.data?.videoId
    })
})

worker.on("failed", (job, error) => {
    logger.error("THUMBNAIL_WORKER", "Thumbnail job failed", {
        jobId: job?.id || null,
        videoId: job?.data?.videoId || null,
        error
    })
    emitProcessingEvent("thumbnail-failed", { videoId: job?.data?.videoId })
})

export default worker
