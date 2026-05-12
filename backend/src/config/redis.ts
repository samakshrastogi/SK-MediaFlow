import Redis from "ioredis";

if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL not defined ❌");
}

const url = new URL(process.env.REDIS_URL);

/* ---------------- DETECT TLS ---------------- */
const isTLS = url.protocol === "rediss:";

/* ---------------- REDIS CONNECTION ---------------- */

export const redisConnection = new Redis({
    host: url.hostname,
    port: Number(url.port) || 6379,
    username: url.username || undefined,
    password: url.password || undefined,

    ...(isTLS && {
        tls: {
            rejectUnauthorized: false,
        },
    }),

    maxRetriesPerRequest: null,
});

redisConnection.on("connect", () => {
    console.log("✅ Redis connected");
});

redisConnection.on("ready", () => {
    console.log("🚀 Redis ready");
});

