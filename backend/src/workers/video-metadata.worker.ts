// @ts-nocheck
import { Worker, Job } from "bullmq"
import { redisConnection } from "../config/redis"
import { prisma } from "../config/prisma"
import { extractVideoMetadata } from "../services/video-metadata.service"
import { Orientation } from "@prisma/client"

new Worker(
    "videoMetadataQueue",
    async (job: Job) => {

        const rawVideoId = job.data?.videoId
        const videoId = typeof rawVideoId === "string" ? rawVideoId : null
        if (!videoId) {
            throw new Error("Invalid videoId in metadata job")
        }

        console.log("[metadata] started", videoId)

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

        console.log("[metadata] completed", videoId)
    },
    {
        connection: redisConnection as any,
        skipVersionCheck: true,
        concurrency: 5
    }
)
