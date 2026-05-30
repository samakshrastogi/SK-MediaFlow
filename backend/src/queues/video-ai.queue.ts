import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";
import { logger } from "../utils/logger";

/* ---------------- QUEUE ---------------- */

export const videoAIQueue = new Queue("videoAIQueue", {
    connection: redisConnection as any,
    skipVersionCheck: true,

    defaultJobOptions: {
        attempts: 1,

        removeOnComplete: {
            age: 3600 // 1 hour
        },

        removeOnFail: {
            age: 24 * 3600, // 24 hours
            count: 1000
        }
    }
});

/* ---------------- ADD AI JOB ---------------- */

export const addVideoAIJob = async (videoId: string) => {

    const jobId = `video-ai-${videoId}`;

    const existingJob = await videoAIQueue.getJob(jobId);

    if (existingJob) {
        logger.info("VIDEO_AI_QUEUE", "Reusing existing AI job", {
            videoId,
            jobId
        })
        return existingJob;
    }

    const job = await videoAIQueue.add(
        "processVideoAI",
        { videoId },
        {
            jobId,
            priority: 1
        }
    );

    logger.info("VIDEO_AI_QUEUE", "AI job added", {
        videoId,
        jobId: job.id
    })

    return job;
};
