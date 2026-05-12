import http from "http";
import { Server } from "socket.io";
import { QueueEvents, Queue } from "bullmq";

import "./config/env";
import app from "./app";
import { redisConnection } from "./config/redis";
import { setSocketServer } from "./services/realtime.service";

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
  socket.on("disconnect", () => {
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

  io.emit("ai-completed", { videoId });

});

queueEvents.on("failed", async ({ jobId }) => {
  if (!jobId) return;

  try {
    const job = await videoAIQueue.getJob(jobId);
    const videoId =
      typeof job?.data?.videoId === "string" ? job.data.videoId : null;

    if (!videoId) return;

    io.emit("ai-failed", { videoId });
  } catch {
  }
});

/* ---------------- START SERVER ---------------- */

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
