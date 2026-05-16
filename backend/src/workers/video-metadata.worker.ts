// @ts-nocheck
import { Worker, Job } from "bullmq"
import { redisConnection } from "../config/redis"
import { prisma } from "../config/prisma"
import { extractVideoMetadata } from "../services/video-metadata.service"
import { Orientation } from "@prisma/client"
import { logger } from "../utils/logger"

const worker = new Worker(
    "videoMetadataQueue",
    async (job: Job) => {

        const rawVideoId = job.data?.videoId
        const videoId = typeof rawVideoId === "string" ? rawVideoId : null
        if (!videoId) {
            throw new Error("Invalid videoId in metadata job")
        }

        logger.info("VIDEO_METADATA_WORKER", "Metadata job started", {
            jobId: job.id,
            videoId
        })

        const metadata = await extractVideoMetadata(videoId)
        const orientation = (metadata.orientation || "LANDSCAPE") as Orientation

        await prisma.videoMetadata.upsert({
            where: { videoId },
            update: {
                ...metadata,
                orientation
            },
            create: {
                video: { connect: { id: videoId } },
                ...metadata,
                orientation
            }
        })

        logger.info("VIDEO_METADATA_WORKER", "Metadata job completed", {
            jobId: job.id,
            videoId,
            orientation
        })

    },
    {
        connection: redisConnection as any,
        skipVersionCheck: true,
        concurrency: 5
    }
)

worker.on("failed", (job, error) => {
    logger.error("VIDEO_METADATA_WORKER", "Metadata job failed", {
        jobId: job?.id || null,
        videoId: job?.data?.videoId || null,
        error
    })
})
