import "./config/env"
import express from "express"
import cors from "cors"
import session from "express-session"
import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import jwt from "jsonwebtoken"
import axios from "axios"
import { PutObjectCommand } from "@aws-sdk/client-s3"

import authRoutes from "./modules/auth/auth.routes"
import userRoutes from "./modules/user/user.routes"
import videoRoutes from "./modules/video/video.routes"
import channelRoutes from "./modules/channel/channel.routes"
import aiRoutes from "./modules/ai/ai.routes"
import videoActionRoutes from "./modules/video/video-action.routes"
import organizationRoutes from "./modules/organization/organization.routes"
import notificationRoutes from "./modules/notification/notification.routes"
import adminRoutes from "./modules/admin/admin.routes"
import { requestLogger } from "./middlewares/request-logger.middleware"
import {
    buildLoginSessionMeta,
    createUniqueUsername,
    normalizeEmail,
} from "./modules/auth/auth.utils"

import { prisma } from "./config/prisma"
import { s3 } from "./config/s3"
import { logger } from "./utils/logger"

import "./workers"

const app = express()
app.set("trust proxy", 1)

const JWT_SECRET = process.env.JWT_SECRET!
const CLIENT_URL = process.env.CLIENT_URL!

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET not defined")
}

logger.info("APP", "Express application initialized", {
    clientUrl: CLIENT_URL,
    nodeEnv: process.env.NODE_ENV || "development"
})

app.use(
    cors({
        origin: CLIENT_URL,
        credentials: true
    })
)

app.use(express.json())
app.use(requestLogger)

app.use(
    session({
        secret: JWT_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === "production"
        }
    })
)

app.use(passport.initialize())
app.use(passport.session())

/* ---------------- GOOGLE OAUTH ---------------- */

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
            passReqToCallback: true,
        },
        async (req: express.Request, _accessToken: string, _refreshToken: string, profile: any, done: any) => {

            try {

                const email = normalizeEmail(profile.emails?.[0]?.value || "")
                const googleId = profile.id
                const name = profile.displayName
                const avatarUrl = profile.photos?.[0]?.value
                const sessionMeta = buildLoginSessionMeta(req)

                if (!email) {
                    return done(new Error("Google email not found"), false)
                }

                let avatarKey: string | null = null

                /* ---------------- DOWNLOAD GOOGLE AVATAR ---------------- */

                if (avatarUrl) {

                    try {

                        const response = await axios.get(avatarUrl, {
                            responseType: "arraybuffer"
                        })

                        avatarKey = `avatars/google_${googleId}.jpg`

                        await s3.send(
                            new PutObjectCommand({
                                Bucket: process.env.AWS_BUCKET!,
                                Key: avatarKey,
                                Body: response.data,
                                ContentType: "image/jpeg"
                            })
                        )

                    } catch {
                    }

                }

                /* ---------------- FIND USER ---------------- */

                let user = await prisma.user.findUnique({
                    where: { email },
                    include: { channel: true }
                })

                /* ---------------- CREATE USER ---------------- */

                if (!user) {

                    const username = await createUniqueUsername(email)

                    user = await prisma.user.create({
                        data: {
                            email,
                            username,
                            name,
                            googleId,
                            avatarKey,
                            provider: "GOOGLE",
                            isVerified: true
                        },
                        include: {
                            channel: true
                        }
                    })

                }

                /* ---------------- UPDATE USER ---------------- */

                else {

                    user = await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            googleId,
                            name,
                            avatarKey: avatarKey ?? user.avatarKey,
                            provider: "GOOGLE",
                            isVerified: true
                        },
                        include: {
                            channel: true
                        }
                    })

                }

                /* ---------------- LOGIN TRACKING ---------------- */

                const loginRecord = await prisma.userLogin.create({
                    data: {
                        userId: user.id,
                        method: "GOOGLE",
                        ipAddress: sessionMeta.ipAddress,
                        userAgent: sessionMeta.userAgent,
                        deviceLabel: sessionMeta.deviceLabel,
                    }
                })

                /* ---------------- JWT TOKEN ---------------- */

                const token = jwt.sign(
                    { sub: user.id, email: user.email, loginId: loginRecord.id },
                    JWT_SECRET,
                    { expiresIn: "30d" }
                )

                return done(null, { token, user, loginId: loginRecord.id })

            }

            catch (err) {

                return done(err as Error, false)

            }

        }
    )
)

/* ---------------- PASSPORT SESSION ---------------- */

passport.serializeUser((user: any, done) => {
    done(null, user)
})

passport.deserializeUser((user: any, done) => {
    done(null, user)
})

/* ---------------- ROUTES ---------------- */

app.use("/api/auth", authRoutes)
app.use("/api/user", userRoutes)
app.use("/api/video", videoRoutes)
app.use("/api/channel", channelRoutes)
app.use("/api/ai", aiRoutes)
app.use("/api/video-actions", videoActionRoutes)
app.use("/api/organization", organizationRoutes)
app.use("/api/notification", notificationRoutes)
app.use("/api/admin", adminRoutes)

/* ---------------- HEALTH CHECK ---------------- */

app.get("/", (_req, res) => {
    res.send("API is running...")
})

export default app
