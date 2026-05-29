// @ts-nocheck
import { Queue } from "bullmq"
import { prisma } from "../config/prisma"
import { redisConnection } from "../config/redis"
import { thumbnailQueue } from "../queues/thumbnail.queue"
import { videoAIQueue } from "../queues/video-ai.queue"

/* ---------------- QUEUES ---------------- */

export { thumbnailQueue, videoAIQueue }

const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 5000
    },
    removeOnComplete: {
        age: 3600,
        count: 500
    },
    removeOnFail: {
        age: 24 * 3600,
        count: 1000
    }
}

export const videoMetadataQueue = new Queue(
    "videoMetadataQueue",
    {
        connection: redisConnection as any,
        skipVersionCheck: true,
        defaultJobOptions
    }
)

/* ---------------- START PROCESSING ---------------- */

export const startVideoProcessing = async (videoId: string) => {

    const video = await prisma.video.findUnique({
        where: { id: videoId }
    })

    if (!video) {
        throw new Error("Video not found")
    }

    await prisma.videoAI.upsert({
        where: { videoId },
        update: { status: "pending" },
        create: {
            videoId,
            status: "pending"
        }
    })

    await thumbnailQueue.add(
        "generateThumbnail",
        { videoId },
        {
            jobId: `thumbnail-${videoId}`
        }
    )

    await videoAIQueue.add(
        "processVideoAI",
        { videoId },
        {
            jobId: `video-ai-${videoId}`
        }
    )

    // ✅ NEW: Metadata extraction
    await videoMetadataQueue.add(
        "extractVideoMetadata",
        { videoId },
        {
            jobId: `video-metadata-${videoId}`
        }
    )
}
