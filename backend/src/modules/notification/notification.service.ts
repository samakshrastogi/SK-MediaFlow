// @ts-nocheck
import { prisma } from "../../config/prisma"
import { logger } from "../../utils/logger"

type NotificationType = "GENERAL" | "ORG_INVITE" | "ORG_APPROVED" | "VIDEO"
type VideoInteraction = "liked" | "commented on" | "shared"

const videoLink = (publicId: string) => `/video/${publicId}`

const actorLabel = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            name: true,
            username: true,
            email: true,
            channel: {
                select: { name: true }
            }
        }
    })

    return user?.channel?.name || user?.name || user?.username || user?.email || "Someone"
}

export const createNotification = async (
    userId: string,
    title: string,
    message: string,
    link?: string,
    type: NotificationType = "GENERAL"
) => {
    try {
        return await prisma.notification.create({
            data: {
                userId,
                title,
                message,
                link,
                type
            }
        })
    } catch (error) {
        logger.warn("NOTIFICATION", "Failed to create notification", { error })
        return null
    }
}

export const notifySubscribersForNewVideo = async (params: {
    channelId: string
    ownerUserId: string
    publicId: string
    title: string
    uploaderName?: string | null
}) => {
    try {
        const subscribers = await prisma.subscription.findMany({
            where: {
                channelId: params.channelId,
                subscriberId: { not: params.ownerUserId }
            },
            select: { subscriberId: true }
        })

        if (!subscribers.length) return

        const uploader = params.uploaderName || "A channel you follow"
        await prisma.notification.createMany({
            data: subscribers.map((subscriber) => ({
                userId: subscriber.subscriberId,
                title: "New Video Uploaded",
                message: `${uploader} uploaded "${params.title}".`,
                link: videoLink(params.publicId),
                type: "VIDEO"
            }))
        })
    } catch (error) {
        logger.warn("NOTIFICATION", "Failed to notify subscribers", { error })
    }
}

export const notifySubscribersForVideoUpdate = async (params: {
    channelId: string
    ownerUserId: string
    publicId: string
    title: string
    uploaderName?: string | null
}) => {
    try {
        const subscribers = await prisma.subscription.findMany({
            where: {
                channelId: params.channelId,
                subscriberId: { not: params.ownerUserId }
            },
            select: { subscriberId: true }
        })

        if (!subscribers.length) return

        const uploader = params.uploaderName || "A channel you follow"
        await prisma.notification.createMany({
            data: subscribers.map((subscriber) => ({
                userId: subscriber.subscriberId,
                title: "Video Updated",
                message: `${uploader} updated "${params.title}".`,
                link: videoLink(params.publicId),
                type: "VIDEO"
            }))
        })
    } catch (error) {
        logger.warn("NOTIFICATION", "Failed to notify subscribers about video update", { error })
    }
}

export const notifyVideoOwnerOfInteraction = async (params: {
    actorUserId: string
    ownerUserId: string
    publicId: string
    videoTitle: string
    action: VideoInteraction
}) => {
    if (!params.ownerUserId || params.ownerUserId === params.actorUserId) return

    try {
        const actor = await actorLabel(params.actorUserId)
        await createNotification(
            params.ownerUserId,
            "Video Activity",
            `${actor} ${params.action} your video "${params.videoTitle}".`,
            videoLink(params.publicId),
            "VIDEO"
        )
    } catch (error) {
        logger.warn("NOTIFICATION", "Failed to notify video owner", { error })
    }
}

export const notifyChannelOwnerOfSubscription = async (params: {
    actorUserId: string
    ownerUserId: string
}) => {
    if (!params.ownerUserId || params.ownerUserId === params.actorUserId) return

    try {
        const actor = await actorLabel(params.actorUserId)
        await createNotification(
            params.ownerUserId,
            "New Subscriber",
            `${actor} subscribed to your channel.`,
            "/profile",
            "GENERAL"
        )
    } catch (error) {
        logger.warn("NOTIFICATION", "Failed to notify channel owner", { error })
    }
}
