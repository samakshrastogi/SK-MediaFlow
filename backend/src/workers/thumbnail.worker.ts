import { Worker } from "bullmq"
import { prisma } from "../config/prisma"
import { processThumbnailPipeline } from "../services/thumbnail.service"
import { redisConnection } from "../config/redis"
import { emitProcessingEvent } from "../services/realtime.service"
import { logger } from "../utils/logger"
import { formatDurationMs } from "../utils/time"

const SHOULD_WRITE_REDIS_PROGRESS = process.env.ENABLE_REDIS_PROGRESS === "true"
const MIN_REDIS_PROGRESS_STEP = 45
const MIN_REDIS_PROGRESS_INTERVAL_MS = 30000

const worker = new Worker(
    "thumbnailQueue",
    async (job) => {
        const { videoId, requestedByUser } = job.data
        const startedAt = Date.now()

        if (requestedByUser !== true) {
            logger.warn("THUMBNAIL_WORKER", "Skipping thumbnail job because it was not user requested", {
                videoId
            })
            return { videoId, skipped: true }
        }

        let lastRedisProgress = -1
        let lastRedisProgressAt = 0

        const updateRedisProgress = async (progress: number, force = false) => {
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
            await job.updateProgress(normalizedProgress)
        }

        logger.info("THUMBNAIL_WORKER", "Thumbnail worker started")
        emitProcessingEvent("thumbnail-progress", { videoId, progress: 5 })
        await updateRedisProgress(5, true)

        const video = await prisma.video.findUnique({
            where: { id: videoId }
        })
        if (!video) {
            throw new Error("Video not found")
        }
        await prisma.video.update({
            where: { id: videoId },
            data: { aiThumbnailStatus: "processing" }
        })

        emitProcessingEvent("thumbnail-progress", { videoId, progress: 12 })
        await updateRedisProgress(12)
        const result = await processThumbnailPipeline(videoId, async (progress) => {
            emitProcessingEvent("thumbnail-progress", { videoId, progress })
            await updateRedisProgress(progress)
        })
        await prisma.video.update({
            where: { id: videoId },
            data: { aiThumbnailStatus: "completed" }
        })
        await updateRedisProgress(100, true)
        emitProcessingEvent("thumbnail-completed", { videoId, thumbnailKey: result, progress: 100 })
        logger.info("THUMBNAIL_WORKER", `Thumbnail worker finished in ${formatDurationMs(Date.now() - startedAt)}`)

        return { thumbnail: result }

    },
    {
        // ✅ FIX: correct Redis config
        connection: redisConnection as any,
        skipVersionCheck: true,
        concurrency: 1,
        drainDelay: 60,
        lockDuration: 10 * 60 * 1000,
        stalledInterval: 5 * 60 * 1000
    }
)

/* ---------------- EVENTS ---------------- */

worker.on("failed", (job, error) => {
    logger.error("THUMBNAIL_WORKER", "Thumbnail worker failed", { error })
    if (job?.data?.videoId) {
        void prisma.video.update({
            where: { id: job.data.videoId },
            data: { aiThumbnailStatus: "failed" }
        }).catch((updateError) => {
            logger.error("THUMBNAIL_WORKER", "Failed to persist thumbnail failure", {
                error: updateError instanceof Error ? updateError : new Error(String(updateError))
            })
        })
    }
    emitProcessingEvent("thumbnail-failed", { videoId: job?.data?.videoId })
})

worker.on("error", (error) => {
    logger.error("THUMBNAIL_WORKER", "Thumbnail worker Redis error", { error })
})

export default worker
