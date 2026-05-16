import http from "http";
import { Server } from "socket.io";
import { QueueEvents, Queue } from "bullmq";

import "./config/env";
import app from "./app";
import { redisConnection } from "./config/redis";
import { setSocketServer } from "./services/realtime.service";
import { logger } from "./utils/logger";

const PORT = process.env.PORT;

const server = http.createServer(app);

export const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: process.env.CLIENT_URL!,
    methods: ["GET", "POST"],
    credentials: true
  }
});

/* ---------------- SOCKET ---------------- */

io.on("connection", (socket) => {
  logger.info("SOCKET", "Client connected", { socketId: socket.id });
  socket.on("disconnect", () => {
    logger.info("SOCKET", "Client disconnected", { socketId: socket.id });
  });
});

/* ---------------- QUEUE EVENTS ---------------- */

const queueEvents = new QueueEvents("videoAIQueue", {
  connection: redisConnection as any
});
setSocketServer(io);
const videoAIQueue = new Queue("videoAIQueue", {
  connection: redisConnection as any
});

/* ---------------- PROGRESS EVENT ---------------- */

queueEvents.on("progress", ({ data }) => {

  const progress =
    typeof data === "object" && data !== null && "progress" in data
      ? (data as any).progress
      : typeof data === "number"
        ? data
        : 0;

  const videoId =
    typeof data === "object" && data !== null && "videoId" in data
      ? (data as any).videoId
      : null;

  if (!videoId) return;

  logger.info("QUEUE", "AI job progress", { videoId, progress });
  io.emit("ai-progress", { videoId, progress });

});

/* ---------------- COMPLETED EVENT ---------------- */

queueEvents.on("completed", ({ returnvalue }) => {

  let videoId: string | null = null;

  if (returnvalue && typeof returnvalue === "object") {
    const data = returnvalue as { videoId?: string };

    if (typeof data.videoId === "string") {
      videoId = data.videoId;
    }
  }

  if (!videoId) return;

  logger.info("QUEUE", "AI job completed", { videoId });
  io.emit("ai-completed", { videoId });

});

queueEvents.on("failed", async ({ jobId }) => {
  if (!jobId) return;

  try {
    const job = await videoAIQueue.getJob(jobId);
    const videoId =
      typeof job?.data?.videoId === "string" ? job.data.videoId : null;

    if (!videoId) return;

    logger.error("QUEUE", "AI job failed", { jobId, videoId, failedReason: job?.failedReason || null });
    io.emit("ai-failed", { videoId });
  } catch {
    logger.error("QUEUE", "Failed to inspect AI queue failure", { jobId });
  }
});

/* ---------------- START SERVER ---------------- */

server.listen(PORT, () => {
  logger.info("SERVER", "Server started", { port: PORT });
});

server.on("error", (error) => {
  logger.error("SERVER", "Server error", { error });
});
