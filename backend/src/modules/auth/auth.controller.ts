import { Request, Response } from "express"
import jwt from "jsonwebtoken"
import { prisma } from "../../config/prisma"
import {
    registerUser,
    resendOTP,
    verifyOTP,
    loginUser,
    generateResetToken,
    resetPassword,
} from "./auth.service"
import { buildLoginSessionMeta } from "./auth.utils"

const JWT_SECRET = process.env.JWT_SECRET as string
const MONGO_OBJECT_ID_RE = /^[a-f\d]{24}$/i

const handleError = (res: Response, error: any) => {
    const status = error.statusCode || 500
    const message = error.message || "Internal server error"

        return res.status(status).json({
            success: false,
            message,
            ...(error.details ? { data: error.details } : {}),
        })
}

/* ---------------- REGISTER ---------------- */

export const register = async (req: Request, res: Response) => {
    try {

        const { name, email, password, confirmPassword } = req.body

        const result = await registerUser(
            name,
            email,
            password,
            confirmPassword
        )

        return res.status(201).json({
            success: true,
            message: result.message,
            data: result,
        })

    } catch (error: any) {

        return handleError(res, error)

    }
}

/* ---------------- VERIFY OTP ---------------- */

export const verifyEmailOTP = async (
    req: Request,
    res: Response
) => {

    try {

        const { email, otp } = req.body

        const result = await verifyOTP(email, otp)

        return res.status(200).json({
            success: true,
            message: result.message,
        })

    } catch (error: any) {

        return handleError(res, error)

    }

}

/* ---------------- LOGIN ---------------- */

export const login = async (req: Request, res: Response) => {

    try {

        const { email, password, remember } = req.body

        const result = await loginUser(
            email,
            password,
            remember,
            buildLoginSessionMeta(req)
        )

        return res.status(200).json({
            success: true,
            data: result,
        })

    } catch (error: any) {

        return handleError(res, error)

    }

}

/* ---------------- FORGOT PASSWORD ---------------- */

export const forgotPassword = async (
    req: Request,
    res: Response
) => {

    try {

        const { email } = req.body

        const result = await generateResetToken(email)

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result,
        })

    } catch (error: any) {

        return handleError(res, error)

    }

}

/* ---------------- RESET PASSWORD ---------------- */

export const resetUserPassword = async (
    req: Request,
    res: Response
) => {

    try {

        const { token, newPassword } = req.body

        const result = await resetPassword(token, newPassword)

        return res.status(200).json({
            success: true,
            message: result.message,
        })

    } catch (error: any) {

        return handleError(res, error)

    }

}

export const resendEmailOTP = async (req: Request, res: Response) => {
    try {
        const { email } = req.body
        const result = await resendOTP(email)

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result,
        })
    } catch (error: any) {
        return handleError(res, error)
    }
}

export const endSession = async (req: Request, res: Response) => {
    try {
        const { token, loginId, durationSec } = req.body || {}

        if (!token || !loginId) {
            return res.status(400).json({
                success: false,
                message: "token and loginId are required"
            })
        }

        const decoded = jwt.verify(token, JWT_SECRET) as unknown as {
            sub: string
            email: string
            loginId?: string
        }

        const userId = String(decoded.sub || "")
        const sessionId = String(loginId || decoded.loginId || "")
        if (!MONGO_OBJECT_ID_RE.test(userId) || !MONGO_OBJECT_ID_RE.test(sessionId)) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token"
            })
        }

        const loginRow = await prisma.userLogin.findUnique({
            where: { id: sessionId }
        })

        if (!loginRow || loginRow.userId !== userId) {
            return res.status(404).json({
                success: false,
                message: "Login session not found"
            })
        }

        const durationValue = Number(durationSec)
        if (Number.isFinite(durationValue) && durationValue >= 0) {
            await prisma.userLogin.update({
                where: { id: loginRow.id },
                data: {
                    sessionLengthSec: Math.floor(durationValue),
                    endedAt: new Date(),
                }
            })
        }

        return res.json({ success: true })
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to end session"
        })
    }
}
