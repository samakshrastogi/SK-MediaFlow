import { Router } from "express"
import passport from "passport"
import {
    register,
    verifyEmailOTP,
    resendEmailOTP,
    login,
    endSession,
    forgotPassword,
    resetUserPassword
} from "./auth.controller"
import { authenticate, AuthRequest } from "../../middlewares/auth.middleware"

const router = Router()

const CLIENT_URL = process.env.CLIENT_URL

router.post("/register", register)
router.post("/verify-otp", verifyEmailOTP)
router.post("/resend-otp", resendEmailOTP)
router.post("/login", login)
router.post("/session-end", endSession)
router.post("/forgot-password", forgotPassword)
router.post("/reset-password", resetUserPassword)
router.get("/session", authenticate, (req: AuthRequest, res) => {
    res.json({
        success: true,
        data: {
            user: req.user
        }
    })
})

router.get(
    "/google",
    passport.authenticate("google", {
        scope: ["profile", "email"]
    })
)

router.get(
    "/google/callback",
    passport.authenticate("google", {
        session: false,
        failureRedirect: `${CLIENT_URL}/login`
    }),
    (req: any, res) => {
        const { token, loginId } = req.user
        res.redirect(`${CLIENT_URL}/oauth-success?token=${token}&loginId=${loginId}`)
    }
)

export default router
