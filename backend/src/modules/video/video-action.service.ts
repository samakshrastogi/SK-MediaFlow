// @ts-nocheck
import { prisma } from "../../config/prisma";
import { VideoActionType } from "@prisma/client";

export const reactToVideo = async (
    userId: string,
    videoId: string,
    actionType: VideoActionType
) => {

    const existing = await prisma.videoAction.findFirst({
        where: {
            userId,
            videoId,
            actionType: {
                in: ["LIKE", "DISLIKE"],
            },
        },
    });

    if (existing) {
        await prisma.videoAction.delete({
            where: { id: existing.id },
        });
    }

    const action = await prisma.videoAction.create({
        data: {
            userId,
            videoId,
            actionType,
        },
    });

    return action;
};

export const addComment = async (
    userId: string,
    videoId: string,
    text: string
) => {
    return prisma.videoAction.create({
        data: {
            userId,
            videoId,
            actionType: "COMMENT",
            commentText: text,
        },
    });
};

export const addToPlaylist = async (
    userId: string,
    videoId: string,
    playlistId: string
) => {
    return prisma.videoAction.create({
        data: {
            userId,
            videoId,
            playlistId,
            actionType: "ADD_TO_PLAYLIST",
        },
    });
};

export const getVideoActions = async (videoId: string) => {

    const likes = await prisma.videoAction.count({
        where: {
            videoId,
            actionType: "LIKE",
        },
    });

    const dislikes = await prisma.videoAction.count({
        where: {
            videoId,
            actionType: "DISLIKE",
        },
    });

    const comments = await prisma.videoAction.findMany({
        where: {
            videoId,
            actionType: "COMMENT",
        },
        include: {
            user: {
                select: {
                    id: true,
                    username: true,
                },
            },
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return {
        likes,
        dislikes,
        comments,
    };
};
