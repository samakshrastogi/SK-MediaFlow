// @ts-nocheck
import { Router } from "express"
import { authenticate, AuthRequest } from "../../middlewares/auth.middleware"
import { prisma } from "../../config/prisma"

const router = Router()
const SUPER_ADMIN_EMAIL = "samakshrastogi885@gmail.com"

const dayKey = (value: Date) => value.toISOString().slice(0, 10)
const MS_PER_DAY = 24 * 60 * 60 * 1000
const toStartOfDay = (value: Date) => {
    const date = new Date(value)
    date.setHours(0, 0, 0, 0)
    return date
}

const toEndOfDay = (value: Date) => {
    const date = new Date(value)
    date.setHours(23, 59, 59, 999)
    return date
}

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

const requireSuperAdmin = async (req: AuthRequest, res: any, next: any) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Unauthorized" })
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { email: true }
        })

        if (!user || user.email !== SUPER_ADMIN_EMAIL) {
            return res.status(403).json({ success: false, message: "Only super admin can manage access" })
        }

        return next()
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to authorize" })
    }
}

router.get("/metrics", authenticate, requirePlatformAdmin, async (_req: AuthRequest, res) => {
    try {
        const req = _req
        const now = new Date()
        const startDateRaw = typeof req.query?.startDate === "string" ? req.query.startDate : ""
        const endDateRaw = typeof req.query?.endDate === "string" ? req.query.endDate : ""
        const billingStatus = typeof req.query?.billingStatus === "string" ? req.query.billingStatus.trim() : ""
        const subscriptionPlan = typeof req.query?.subscriptionPlan === "string" ? req.query.subscriptionPlan.trim() : ""
        const organizationId = typeof req.query?.organizationId === "string" ? req.query.organizationId.trim() : ""
        const visibility = typeof req.query?.visibility === "string" ? req.query.visibility.trim() : ""
        const inviteStatus = typeof req.query?.inviteStatus === "string" ? req.query.inviteStatus.trim() : ""
        const adminAction = typeof req.query?.adminAction === "string" ? req.query.adminAction.trim() : ""
        const userActivityType = typeof req.query?.userActivityType === "string" ? req.query.userActivityType.trim() : ""
        const minViewsValue = typeof req.query?.minViews === "string" ? Number(req.query.minViews) : 0
        const minSharesValue = typeof req.query?.minShares === "string" ? Number(req.query.minShares) : 0
        const minViews = Number.isFinite(minViewsValue) && minViewsValue > 0 ? minViewsValue : 0
        const minShares = Number.isFinite(minSharesValue) && minSharesValue > 0 ? minSharesValue : 0

        const startDate = startDateRaw ? toStartOfDay(new Date(startDateRaw)) : null
        const endDate = endDateRaw ? toEndOfDay(new Date(endDateRaw)) : null
        const hasValidStartDate = startDate instanceof Date && !Number.isNaN(startDate.getTime())
        const hasValidEndDate = endDate instanceof Date && !Number.isNaN(endDate.getTime())
        const timeFilter = hasValidStartDate || hasValidEndDate
            ? {
                ...(hasValidStartDate ? { gte: startDate } : {}),
                ...(hasValidEndDate ? { lte: endDate } : {})
            }
            : undefined

        const dauSince = new Date(now.getTime() - MS_PER_DAY)
        const wauSince = new Date(now.getTime() - 7 * MS_PER_DAY)
        const mauSince = new Date(now.getTime() - 30 * MS_PER_DAY)
        const trialWindowEnd = new Date(now.getTime() + 14 * MS_PER_DAY)

        const organizationFilter = {
            ...(organizationId ? { id: organizationId } : {}),
            ...(billingStatus ? { billingStatus } : {}),
            ...(subscriptionPlan ? { subscriptionPlan } : {})
        }

        const videoScope = {
            ...(visibility ? { visibility } : {}),
            ...(organizationId ? { organizationId } : {}),
            ...(billingStatus || subscriptionPlan ? { organization: organizationFilter } : {})
        }

        let eligibleUserIds: string[] | null = null
        if (userActivityType === "NEW" || userActivityType === "RETURNING") {
            const loginCounts = await prisma.userLogin.groupBy({
                by: ["userId"],
                _count: { _all: true }
            })

            eligibleUserIds = loginCounts
                .filter((row) => userActivityType === "NEW" ? row._count._all <= 1 : row._count._all > 1)
                .map((row) => row.userId)
        }

        const userScope = eligibleUserIds
            ? { in: eligibleUserIds.length ? eligibleUserIds : ["__no_matching_users__"] }
            : undefined
        const loginWhere = {
            ...(timeFilter ? { createdAt: timeFilter } : {}),
            ...(userScope ? { userId: userScope } : {})
        }

        const activeWindowWhere = (fallbackStart: Date) => ({
            createdAt: timeFilter || { gte: fallbackStart },
            ...(userScope ? { userId: userScope } : {})
        })

        const inviteScopedWhere = {
            ...(timeFilter ? { createdAt: timeFilter } : {}),
            ...(organizationId ? { organizationId } : {}),
            ...(billingStatus || subscriptionPlan ? { organization: organizationFilter } : {}),
            ...(inviteStatus === "EXPIRED"
                ? { status: "PENDING", expiresAt: { lt: now } }
                : inviteStatus === "PENDING"
                    ? { status: "PENDING", expiresAt: { gte: now } }
                    : inviteStatus
                        ? { status: inviteStatus }
                        : {})
        }

        const adminAuditWhere = {
            ...(timeFilter ? { createdAt: timeFilter } : {}),
            ...(adminAction ? { action: adminAction } : {})
        }

        const [
            totalLogins,
            likesCount,
            dislikesCount,
            sharesCount,
            subscriptionCounts,
            uniqueUserRows,
            sessionAggregate,
            loginRows,
            organizations,
            dailyActiveRows,
            weeklyActiveRows,
            monthlyActiveRows,
            watchHistoryRows,
            activeVideos,
            inviteRows,
            recentAdminAuditRows
        ] = await Promise.all([
            prisma.userLogin.count({ where: loginWhere }),
            prisma.videoReaction.count({
                where: {
                    type: "LIKE",
                    ...(timeFilter ? { createdAt: timeFilter } : {}),
                    ...(userScope ? { userId: userScope } : {}),
                    ...(Object.keys(videoScope).length ? { video: videoScope } : {})
                }
            }),
            prisma.videoReaction.count({
                where: {
                    type: "DISLIKE",
                    ...(timeFilter ? { createdAt: timeFilter } : {}),
                    ...(userScope ? { userId: userScope } : {}),
                    ...(Object.keys(videoScope).length ? { video: videoScope } : {})
                }
            }),
            prisma.videoShare.count({
                where: {
                    ...(timeFilter ? { createdAt: timeFilter } : {}),
                    ...(userScope ? { userId: userScope } : {}),
                    ...(Object.keys(videoScope).length ? { video: videoScope } : {})
                }
            }),
            prisma.organization.groupBy({
                where: Object.keys(organizationFilter).length ? organizationFilter : undefined,
                by: ["subscriptionPlan"],
                _count: { _all: true }
            }),
            prisma.userLogin.groupBy({
                by: ["userId"],
                where: loginWhere
            }),
            prisma.userLogin.aggregate({
                _avg: { sessionLengthSec: true },
                where: loginWhere
            }),
            prisma.userLogin.findMany({
                where: loginWhere,
                select: { createdAt: true },
                orderBy: { createdAt: "asc" }
            }),
            prisma.organization.findMany({
                where: Object.keys(organizationFilter).length ? organizationFilter : undefined,
                select: {
                    id: true,
                    name: true,
                    billingStatus: true,
                    subscriptionPlan: true,
                    trialEndsAt: true
                }
            }),
            prisma.userLogin.findMany({
                where: activeWindowWhere(dauSince),
                select: { userId: true }
            }),
            prisma.userLogin.findMany({
                where: activeWindowWhere(wauSince),
                select: { userId: true }
            }),
            prisma.userLogin.findMany({
                where: activeWindowWhere(mauSince),
                select: { userId: true }
            }),
            prisma.watchHistory.findMany({
                where: {
                    ...(timeFilter ? { updatedAt: timeFilter } : {}),
                    ...(userScope ? { userId: userScope } : {}),
                    ...(Object.keys(videoScope).length ? { video: videoScope } : {})
                },
                select: {
                    watchedSeconds: true,
                    video: {
                        select: {
                            metadata: {
                                select: { duration: true }
                            }
                        }
                    }
                }
            }),
            prisma.video.findMany({
                where: {
                    status: "ACTIVE",
                    ...(timeFilter ? { createdAt: timeFilter } : {}),
                    ...videoScope
                },
                select: {
                    id: true,
                    title: true,
                    createdAt: true,
                    metadata: {
                        select: { duration: true }
                    }
                }
            }),
            prisma.organizationInvite.findMany({
                where: inviteScopedWhere,
                select: {
                    status: true,
                    expiresAt: true
                }
            }),
            prisma.adminAccessAudit.findMany({
                take: 10,
                where: adminAuditWhere,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    action: true,
                    createdAt: true,
                    actor: {
                        select: {
                            id: true,
                            email: true,
                            name: true
                        }
                    },
                    target: {
                        select: {
                            id: true,
                            email: true,
                            name: true
                        }
                    }
                }
            })
        ])

        const dailyLoginMap = new Map<string, number>()
        for (const row of loginRows) {
            const key = dayKey(row.createdAt)
            dailyLoginMap.set(key, (dailyLoginMap.get(key) || 0) + 1)
        }

        const dailyActiveUsers = new Set(dailyActiveRows.map((row) => row.userId)).size
        const weeklyActiveUsers = new Set(weeklyActiveRows.map((row) => row.userId)).size
        const monthlyActiveUsers = new Set(monthlyActiveRows.map((row) => row.userId)).size

        const totalWatchSeconds = watchHistoryRows.reduce((sum, row) => sum + (row.watchedSeconds || 0), 0)
        const completionSamples = watchHistoryRows
            .map((row) => {
                const duration = row.video?.metadata?.duration || 0
                if (!duration) return null
                return Math.min(100, Math.round(((row.watchedSeconds || 0) / duration) * 100))
            })
            .filter((value): value is number => value !== null)
        const averageCompletionRate = completionSamples.length
            ? Math.round(completionSamples.reduce((sum, value) => sum + value, 0) / completionSamples.length)
            : 0

        const topOrganizations = await Promise.all(
            organizations.map(async (organization) => {
                const orgVideoScope = {
                    status: "ACTIVE",
                    organizationId: organization.id,
                    ...(visibility ? { visibility } : {})
                }

                const [shares, likes, views] = await Promise.all([
                    prisma.videoShare.count({
                        where: {
                            ...(timeFilter ? { createdAt: timeFilter } : {}),
                            ...(userScope ? { userId: userScope } : {}),
                            video: orgVideoScope
                        }
                    }),
                    prisma.videoReaction.count({
                        where: {
                            type: "LIKE",
                            ...(timeFilter ? { createdAt: timeFilter } : {}),
                            ...(userScope ? { userId: userScope } : {}),
                            video: orgVideoScope
                        }
                    }),
                    prisma.videoView.count({
                        where: {
                            ...(timeFilter ? { createdAt: timeFilter } : {}),
                            ...(userScope ? { userId: userScope } : {}),
                            video: orgVideoScope
                        }
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

        const topVideos = await Promise.all(
            activeVideos.map(async (video) => {
                const [views, likes, shares, comments] = await Promise.all([
                    prisma.videoView.count({
                        where: {
                            videoId: video.id,
                            ...(timeFilter ? { createdAt: timeFilter } : {}),
                            ...(userScope ? { userId: userScope } : {})
                        }
                    }),
                    prisma.videoReaction.count({
                        where: {
                            videoId: video.id,
                            type: "LIKE",
                            ...(timeFilter ? { createdAt: timeFilter } : {}),
                            ...(userScope ? { userId: userScope } : {})
                        }
                    }),
                    prisma.videoShare.count({
                        where: {
                            videoId: video.id,
                            ...(timeFilter ? { createdAt: timeFilter } : {}),
                            ...(userScope ? { userId: userScope } : {})
                        }
                    }),
                    prisma.videoComment.count({
                        where: {
                            videoId: video.id,
                            ...(timeFilter ? { createdAt: timeFilter } : {}),
                            ...(userScope ? { userId: userScope } : {})
                        }
                    })
                ])

                return {
                    id: video.id,
                    title: video.title,
                    views,
                    likes,
                    shares,
                    comments,
                    duration: video.metadata?.duration || 0,
                    createdAt: video.createdAt
                }
            })
        )

        const filteredTopVideos = topVideos
            .filter((video) => video.views >= minViews && video.shares >= minShares)
            .sort((a, b) => (b.views - a.views) || (b.likes - a.likes) || (b.shares - a.shares))
            .slice(0, 5)

        const filteredTopOrganizations = topOrganizations
            .filter((organization) => organization.views >= minViews && organization.shares >= minShares)
            .sort((a, b) => (b.shares - a.shares) || (b.likes - a.likes) || (b.views - a.views))
            .slice(0, 5)

        const billingStatusCounts = organizations.reduce((acc, organization) => {
            acc[organization.billingStatus] = (acc[organization.billingStatus] || 0) + 1
            return acc
        }, {} as Record<string, number>)

        const expiringTrials = organizations
            .filter((organization) => organization.trialEndsAt >= now && organization.trialEndsAt <= trialWindowEnd)
            .sort((a, b) => a.trialEndsAt.getTime() - b.trialEndsAt.getTime())
            .slice(0, 5)
            .map((organization) => ({
                id: organization.id,
                name: organization.name,
                subscriptionPlan: organization.subscriptionPlan,
                billingStatus: organization.billingStatus,
                trialEndsAt: organization.trialEndsAt,
                daysLeft: Math.max(0, Math.ceil((organization.trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY))
            }))

        const inviteFunnel = inviteRows.reduce((acc, invite) => {
            acc.total += 1

            if (invite.status === "ACCEPTED") {
                acc.accepted += 1
                return acc
            }

            if (invite.status === "CANCELLED") {
                acc.cancelled += 1
                return acc
            }

            if (invite.status === "PENDING" && invite.expiresAt < now) {
                acc.expired += 1
                return acc
            }

            if (invite.status === "PENDING") {
                acc.pending += 1
            }

            return acc
        }, {
            total: 0,
            accepted: 0,
            pending: 0,
            cancelled: 0,
            expired: 0
        })

        const inviteAcceptanceRate = inviteFunnel.total
            ? Math.round((inviteFunnel.accepted / inviteFunnel.total) * 100)
            : 0

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
                userActivity: {
                    dau: dailyActiveUsers,
                    wau: weeklyActiveUsers,
                    mau: monthlyActiveUsers
                },
                watchMetrics: {
                    totalWatchSeconds,
                    averageCompletionRate
                },
                dailyLogins: Array.from(dailyLoginMap.entries()).map(([day, count]) => ({ day, count })),
                topVideos: filteredTopVideos,
                topOrganizations: filteredTopOrganizations,
                organizationHealth: {
                    billingStatusCounts,
                    expiringTrials
                },
                inviteFunnel: {
                    ...inviteFunnel,
                    acceptanceRate: inviteAcceptanceRate
                },
                adminAccessAudit: recentAdminAuditRows.map((entry) => ({
                    id: entry.id,
                    action: entry.action,
                    createdAt: entry.createdAt,
                    actor: entry.actor,
                    target: entry.target
                })),
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

router.get("/filter-options", authenticate, requirePlatformAdmin, async (_req: AuthRequest, res) => {
    try {
        const organizations = await prisma.organization.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" }
        })

        return res.json({
            success: true,
            data: {
                organizations
            }
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to load filter options" })
    }
})

router.get("/users", authenticate, requireSuperAdmin, async (_req: AuthRequest, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                username: true,
                platformAdmin: true
            },
            orderBy: [
                { platformAdmin: "desc" },
                { createdAt: "desc" }
            ]
        })

        return res.json({
            success: true,
            data: users.map((user) => ({
                id: user.id,
                email: user.email,
                name: user.name,
                username: user.username,
                platformAdmin: user.platformAdmin,
                locked: user.email === SUPER_ADMIN_EMAIL
            }))
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to load users" })
    }
})

router.post("/access", authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
    try {
        const userIds = Array.isArray(req.body?.userIds)
            ? req.body.userIds.map((value: unknown) => String(value).trim()).filter(Boolean)
            : []
        const access = req.body?.access === true

        if (!userIds.length) {
            return res.status(400).json({ success: false, message: "userIds are required" })
        }

        const targetUsers = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, platformAdmin: true }
        })

        const usersToUpdate = targetUsers
            .filter((user) => user.email !== SUPER_ADMIN_EMAIL && user.platformAdmin !== access)

        if (!usersToUpdate.length) {
            return res.status(400).json({ success: false, message: "No eligible users selected" })
        }

        const result = await prisma.user.updateMany({
            where: { id: { in: usersToUpdate.map((user) => user.id) } },
            data: { platformAdmin: access }
        })

        await prisma.adminAccessAudit.createMany({
            data: usersToUpdate.map((targetUser) => ({
                actorUserId: req.user!.id,
                targetUserId: targetUser.id,
                action: access ? "GRANT" : "REMOVE"
            }))
        })

        return res.json({
            success: true,
            data: {
                updatedCount: result.count,
                access
            }
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to update access" })
    }
})

export default router
