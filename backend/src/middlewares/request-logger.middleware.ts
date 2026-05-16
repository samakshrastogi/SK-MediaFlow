import { NextFunction, Request, Response } from "express"
import { logger } from "../utils/logger"

type AuthenticatedRequest = Request & {
    user?: {
        id?: string
        email?: string
    }
}

export const requestLogger = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    const getArea = (path: string) => {
        if (path.startsWith("/api/auth")) return "account"
        if (path.startsWith("/api/user")) return "profile"
        if (path.startsWith("/api/video-actions")) return "video activity"
        if (path.startsWith("/api/video")) return "video"
        if (path.startsWith("/api/channel")) return "channel"
        if (path.startsWith("/api/organization")) return "organization"
        if (path.startsWith("/api/notification")) return "notification"
        if (path.startsWith("/api/admin")) return "admin"
        if (path.startsWith("/api/ai")) return "AI"
        return "app"
    }

    const getSuccessMessage = (method: string, area: string) => {
        if (method === "GET") return `${area} data loaded`
        if (method === "POST") return `${area} data saved`
        if (method === "PATCH" || method === "PUT") return `${area} data updated`
        if (method === "DELETE") return `${area} data removed`
        return `${area} task finished`
    }

    const area = getArea(req.originalUrl)

    res.on("finish", () => {
        if (res.statusCode >= 500) {
            logger.error("HTTP", `${area} task failed`)
            return
        }

        if (res.statusCode >= 400) {
            logger.warn("HTTP", `${area} task could not be completed`)
            return
        }

        logger.info("HTTP", getSuccessMessage(req.method, area))
    })

    next()
}
