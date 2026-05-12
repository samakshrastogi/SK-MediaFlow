import { Response } from "express"
import { AuthRequest } from "../../middlewares/auth.middleware"
import {
    createChannel,
    getMyChannel
} from "./channel.service"

export const handleCreateChannel = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const { name, username, description } = req.body

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Channel name is required"
            })
        }

        const channel = await createChannel(
            req.user.id,
            name,
            username,
            description
        )

        return res.status(201).json({
            success: true,
            data: channel
        })
    } catch (error: any) {
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to create channel",
            suggestions: (error as any).suggestions || []
        })
    }
}

export const handleGetMyChannel = async (
    req: AuthRequest,
    res: Response
) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const channel = await getMyChannel(req.user.id)

        if (!channel) {
            return res.status(200).json({
                success: true,
                data: null
            })
        }

        return res.json({
            success: true,
            data: channel
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch channel"
        })
    }
}
