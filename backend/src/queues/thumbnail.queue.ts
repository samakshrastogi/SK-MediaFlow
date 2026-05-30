import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

export const thumbnailQueue = new Queue("thumbnailQueue", {
    connection: redisConnection as any,
    skipVersionCheck: true,
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: {
            age: 3600,
            count: 500
        },
        removeOnFail: {
            age: 24 * 3600,
            count: 1000
        }
    }
});
