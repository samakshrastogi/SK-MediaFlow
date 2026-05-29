// @ts-nocheck
import { prisma } from "../../config/prisma";

export const generateMetadataService = async (videoId: string) => {
    const videoAI = await prisma.videoAI.findUnique({
        where: { videoId },
    });

    if (!videoAI) {
        throw new Error("AI metadata not found");
    }

    return {
        title: videoAI.aiTitle,
        description: videoAI.aiDescription,
        keywords: videoAI.keywords,
        tags: videoAI.tags,
        status: videoAI.status,
    };
};

export const applyAISuggestionService = async (videoId: string) => {
    const videoAI = await prisma.videoAI.findUnique({
        where: { videoId },
    });

    if (!videoAI) {
        throw new Error("AI metadata not found");
    }

    // ✅ Only update fields that EXIST in Video model
    const video = await prisma.video.update({
        where: { id: videoId },
        data: {
            title: videoAI.aiTitle ?? undefined,
        },
    });

    return video;
};
