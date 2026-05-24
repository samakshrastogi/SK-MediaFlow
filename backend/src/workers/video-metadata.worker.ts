// @ts-nocheck
import { Worker, Job } from "bullmq"
import { redisConnection } from "../config/redis"
import { prisma } from "../config/prisma"
import { extractVideoMetadata } from "../services/video-metadata.service"
import { Orientation } from "@prisma/client"
import { logger } from "../utils/logger"
import { formatDurationMs } from "../utils/time"

const worker = new Worker(
    "videoMetadataQueue",
    async (job: Job) => {
        const rawVideoId = job.data?.videoId
        const videoId = typeof rawVideoId === "string" ? rawVideoId : null
        if (!videoId) {
            throw new Error("Invalid videoId in metadata job")
        }
        const startedAt = Date.now()
        logger.info("VIDEO_METADATA_WORKER", "Metadata worker started")

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

        logger.info("VIDEO_METADATA_WORKER", `Metadata worker finished in ${formatDurationMs(Date.now() - startedAt)}`)

    },
    {
        connection: redisConnection as any,
        skipVersionCheck: true,
        concurrency: 5
    }
)

worker.on("failed", (job, error) => {
    logger.error("VIDEO_METADATA_WORKER", "Metadata worker failed", { error })
})
