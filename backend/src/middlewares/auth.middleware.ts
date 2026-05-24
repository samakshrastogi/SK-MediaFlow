import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { prisma } from "../config/prisma"

const JWT_SECRET = process.env.JWT_SECRET!
const MONGO_OBJECT_ID_RE = /^[a-f\d]{24}$/i

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET not defined")
}

export interface AuthRequest extends Request {
    user?: {
        id: string
        email: string
        loginId?: string
    }
}

export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers.authorization

    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized"
        })
    }

    const [scheme, token] = authHeader.split(" ")

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({
            success: false,
            message: "Invalid authorization format"
        })
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as unknown as {
            sub: string
            email: string
            loginId?: string
        }

        const userId = String(decoded.sub || "")
        if (!MONGO_OBJECT_ID_RE.test(userId)) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token"
            })
        }

        req.user = {
            id: userId,
            email: decoded.email,
            loginId: decoded.loginId,
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                isVerified: true,
                deactivatedAt: true,
                deletedAt: true,
            }
        })

        if (!user?.isVerified) {
            return res.status(403).json({
                success: false,
                message: "Account is not verified"
            })
        }

        if (user.deletedAt || user.deactivatedAt) {
            return res.status(403).json({
                success: false,
                message: "This account is no longer available."
            })
        }

        if (decoded.loginId) {
            const loginRecord = await prisma.userLogin.findUnique({
                where: { id: decoded.loginId },
                select: { userId: true, revokedAt: true },
            })

            if (
                !loginRecord ||
                loginRecord.userId !== userId ||
                loginRecord.revokedAt
            ) {
                return res.status(401).json({
                    success: false,
                    message: "This session has expired. Please sign in again.",
                })
            }
        }

        next()
    } catch {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        })
    }
}
