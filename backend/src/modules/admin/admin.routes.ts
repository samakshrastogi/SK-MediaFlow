// @ts-nocheck
import { Router } from "express"
import { authenticate, AuthRequest } from "../../middlewares/auth.middleware"
import { prisma } from "../../config/prisma"

const router = Router()
const SUPER_ADMIN_EMAIL = "samakshrastogi885@gmail.com"

const dayKey = (value: Date) => value.toISOString().slice(0, 10)

const requirePlatformAdmin = async (req: AuthRequest, res: any, next: any) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" })
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { email: true, platformAdmin: true }
        })

        if (!user) {
            return res.status(401).json({ success: false, message: "Unauthorized" })
        }

        if (user.email === SUPER_ADMIN_EMAIL || user.platformAdmin) {
            return next()
        }

        return res.status(403).json({ success: false, message: "Admin access required" })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to authorize" })
    }
}

router.get("/metrics", authenticate, requirePlatformAdmin, async (_req: AuthRequest, res) => {
    try {
        const [
            totalLogins,
            likesCount,
            dislikesCount,
            sharesCount,
            subscriptionCounts,
            uniqueUserRows,
            sessionAggregate,
            loginRows,
            organizations
        ] = await Promise.all([
            prisma.userLogin.count(),
            prisma.videoReaction.count({ where: { type: "LIKE" } }),
            prisma.videoReaction.count({ where: { type: "DISLIKE" } }),
            prisma.videoShare.count(),
            prisma.organization.groupBy({
                by: ["subscriptionPlan"],
                _count: { _all: true }
            }),
            prisma.userLogin.groupBy({ by: ["userId"] }),
            prisma.userLogin.aggregate({ _avg: { sessionLengthSec: true } }),
            prisma.userLogin.findMany({
                select: { createdAt: true },
                orderBy: { createdAt: "asc" }
            }),
            prisma.organization.findMany({
                select: { id: true, name: true }
            })
        ])

        const dailyLoginMap = new Map<string, number>()
        for (const row of loginRows) {
            const key = dayKey(row.createdAt)
            dailyLoginMap.set(key, (dailyLoginMap.get(key) || 0) + 1)
        }

        const topOrganizations = await Promise.all(
            organizations.map(async (organization) => {
                const [shares, likes, views] = await Promise.all([
                    prisma.videoShare.count({
                        where: { video: { organizationId: organization.id, status: "ACTIVE" } }
                    }),
                    prisma.videoReaction.count({
                        where: {
                            type: "LIKE",
                            video: { organizationId: organization.id, status: "ACTIVE" }
                        }
                    }),
                    prisma.videoView.count({
                        where: { video: { organizationId: organization.id, status: "ACTIVE" } }
                    })
                ])

                return {
                    id: organization.id,
                    name: organization.name,
                    shares,
                    likes,
                    views
                }
            })
        )

        return res.json({
            success: true,
            data: {
                cards: {
                    uniqueUsers: uniqueUserRows.length,
                    totalLogins,
                    avgSessionLength: sessionAggregate._avg.sessionLengthSec ?? 0,
                    likes: likesCount,
                    dislikes: dislikesCount,
                    shares: sharesCount
                },
                dailyLogins: Array.from(dailyLoginMap.entries()).map(([day, count]) => ({ day, count })),
                topOrganizations: topOrganizations
                    .sort((a, b) => (b.shares - a.shares) || (b.likes - a.likes) || (b.views - a.views))
                    .slice(0, 5),
                subscriptionCounts: subscriptionCounts.map((row) => ({
                    plan: row.subscriptionPlan,
                    count: row._count._all
                }))
            }
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to load metrics" })
    }
})

router.post("/grant", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const me = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { email: true }
        })

        if (!me || me.email !== SUPER_ADMIN_EMAIL) {
            return res.status(403).json({ success: false, message: "Only super admin can grant access" })
        }

        const email = String(req.body?.email || "").trim().toLowerCase()
        if (!email) return res.status(400).json({ success: false, message: "email is required" })

        const updated = await prisma.user.update({
            where: { email },
            data: { platformAdmin: true }
        })

        return res.json({ success: true, data: { id: updated.id, email: updated.email } })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to grant access" })
    }
})

export default router
