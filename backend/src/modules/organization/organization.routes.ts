// @ts-nocheck
import { Router } from "express"
import crypto from "crypto"
import { authenticate, AuthRequest } from "../../middlewares/auth.middleware"
import { prisma } from "../../config/prisma"
import {
    getOrganizationAccessContext,
    normalizeOrganizationSlug,
    requireOrganizationAdmin
} from "./organization.service"
import { sendOrganizationInviteEmail } from "../../services/mail.service"

const router = Router()
const CLIENT_URL = process.env.CLIENT_URL || ""

router.get("/ping", (_req, res) => {
    return res.json({ success: true, service: "organization", version: "v2" })
})

const addMonths = (date: Date, months: number) => {
    const copy = new Date(date)
    copy.setMonth(copy.getMonth() + months)
    return copy
}

const normalizeId = (value: unknown) => String(value || "").trim()
const isObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value)

const buildOrganizationShareLinks = (organization: {
    joinToken: string
    privateJoinToken: string
}) => ({
    publicLink: `${CLIENT_URL}/organization?orgToken=${organization.joinToken}`,
    privateLink: `${CLIENT_URL}/organization?orgToken=${organization.privateJoinToken}`
})

const extractOrganizationJoinToken = (value: string) => {
    const normalized = String(value || "").trim()
    if (!normalized) return null

    try {
        const parsed = new URL(normalized)
        const token =
            parsed.searchParams.get("orgToken") ||
            parsed.searchParams.get("org") ||
            parsed.pathname.split("/").filter(Boolean).at(-1)

        if (!token || token === "organization") return null
        return token.trim()
    } catch {
        return null
    }
}

const createOrgNotification = async (
    userId: string,
    title: string,
    message: string,
    link?: string,
    type: "ORG_INVITE" | "ORG_APPROVED" | "GENERAL" = "GENERAL"
) => {
    await prisma.notification.create({
        data: {
            userId,
            title,
            message,
            link,
            type
        }
    })
}

const notifyOrganizationAdminsForJoinRequest = async (
    organizationId: string,
    organizationName: string,
    requester: { name?: string | null; email?: string | null; channelName?: string | null; channelUsername?: string | null }
) => {
    const admins = await prisma.organizationMembership.findMany({
        where: {
            organizationId,
            status: "APPROVED",
            role: "ADMIN"
        },
        select: { userId: true }
    })

    await Promise.all(
        admins.map((admin) =>
            createOrgNotification(
                admin.userId,
                "Organization Join Request",
                `${requester.channelName || requester.name || requester.email || "A user"} (${requester.channelUsername ? `@${requester.channelUsername}` : requester.email || "no email"}) is waiting for approval to join ${organizationName}.`,
                "/organization/dashboard",
                "GENERAL"
            )
        )
    )
}

const resolveUserByEmailOrChannelName = async (value: string) => {
    const normalized = String(value || "").trim()
    if (!normalized) return null

    const lowered = normalized.toLowerCase()

    const byEmail = await prisma.user.findUnique({
        where: { email: lowered },
        include: { channel: true }
    })

    if (byEmail) return byEmail

    const byChannel = await prisma.channel.findFirst({
        where: {
            OR: [
                { name: { equals: normalized, mode: "insensitive" } },
                { username: { equals: lowered, mode: "insensitive" } }
            ]
        },
        include: {
            user: {
                include: { channel: true }
            }
        }
    })

    return byChannel?.user || null
}

const ensureOrganizationTokens = async (organizationId: string) => {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { joinToken: true, privateJoinToken: true }
    })

    if (!organization) return null

    if (organization.joinToken && organization.privateJoinToken) {
        return organization
    }

    const updated = await prisma.organization.update({
        where: { id: organizationId },
        data: {
            joinToken: organization.joinToken || crypto.randomBytes(24).toString("hex"),
            privateJoinToken: organization.privateJoinToken || crypto.randomBytes(24).toString("hex")
        },
        select: { joinToken: true, privateJoinToken: true }
    })

    return updated
}

router.post("/", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const name = String(req.body?.name || "").trim()
        const description = String(req.body?.description || "").trim() || null
        const rawSlug = String(req.body?.slug || name).trim()
        const requestedPlan = String(req.body?.plan || "TRIAL_FREE").toUpperCase()

        if (!name) {
            return res.status(400).json({ success: false, message: "Organization name is required" })
        }

        const allowedPlans = ["TRIAL_FREE", "SIX_MONTH", "YEARLY_INITIAL", "YEARLY_RENEWAL"]
        if (!allowedPlans.includes(requestedPlan)) {
            return res.status(400).json({ success: false, message: "Invalid subscription plan" })
        }

        let slugBase = normalizeOrganizationSlug(rawSlug || name)
        if (!slugBase) slugBase = `org-${Date.now()}`

        let slug = slugBase
        let idx = 1
        while (await prisma.organization.findUnique({ where: { slug } })) {
            slug = `${slugBase}-${idx++}`.slice(0, 45)
        }

        const now = new Date()
        const trialEndsAt = addMonths(now, 3)

        let billingStatus: "TRIAL_ACTIVE" | "ACTIVE" = "TRIAL_ACTIVE"
        let subscriptionPlan: "TRIAL_FREE" | "SIX_MONTH" | "YEARLY_INITIAL" | "YEARLY_RENEWAL" = "TRIAL_FREE"
        let subscriptionEndsAt: Date | null = null

        if (requestedPlan !== "TRIAL_FREE") {
            billingStatus = "ACTIVE"
            subscriptionPlan = requestedPlan as typeof subscriptionPlan
            if (requestedPlan === "SIX_MONTH") subscriptionEndsAt = addMonths(now, 6)
            else subscriptionEndsAt = addMonths(now, 12)
        }

        const organization = await prisma.organization.create({
            data: {
                name,
                slug,
                joinToken: crypto.randomBytes(24).toString("hex"),
                privateJoinToken: crypto.randomBytes(24).toString("hex"),
                description,
                ownerId: req.user.id,
                trialStartAt: now,
                trialEndsAt,
                billingStatus,
                subscriptionPlan,
                subscriptionEndsAt,
                members: {
                    create: {
                        userId: req.user.id,
                        role: "ADMIN",
                        status: "APPROVED",
                        approvedAt: now
                    }
                }
            }
        })

        await prisma.user.update({
            where: { id: req.user.id },
            data: { activeOrganizationId: organization.id }
        })

        return res.status(201).json({
            success: true,
            data: organization,
            links: buildOrganizationShareLinks(organization),
            pricingNote:
                requestedPlan === "TRIAL_FREE"
                    ? "3 month free trial selected"
                    : requestedPlan === "SIX_MONTH"
                      ? "6 month subscription selected (Rs 18000)"
                      : requestedPlan === "YEARLY_INITIAL"
                        ? "Yearly initial subscription selected (Rs 10000 one-time for initial users)"
                        : "Yearly renewal subscription selected (Rs 24000 annually)"
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to create organization" })
    }
})

router.get("/my", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const access = await getOrganizationAccessContext(req.user.id)

        const memberships = await prisma.organizationMembership.findMany({
            where: { userId: req.user.id },
            include: {
                organization: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        ownerId: true,
                        description: true,
                        allowPublicContent: true,
                        restrictContentForAdmins: true,
                        uploadPolicy: true,
                        allowedUploaders: {
                            select: {
                                userId: true
                            }
                        },
                        trialEndsAt: true,
                        subscriptionEndsAt: true,
                        billingStatus: true,
                        subscriptionPlan: true
                    }
                }
            },
            orderBy: { requestedAt: "desc" }
        })

        return res.json({
            success: true,
            data: {
                access,
                memberships
            }
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to fetch organization" })
    }
})

router.get("/link/:token", async (req, res) => {
    try {
        const token = String(req.params.token || "").trim()
        if (!token || token === "null" || token === "undefined") {
            return res.status(400).json({ success: false, message: "Token is required" })
        }

        const organization = await prisma.organization.findFirst({
            where: {
                OR: [{ joinToken: token }, { privateJoinToken: token }]
            },
            select: {
                id: true,
                name: true,
                slug: true,
                joinToken: true,
                privateJoinToken: true
            }
        })

        // Backward compatibility: treat slug-based links as private (approval required)
        const slugFallback =
            !organization && token
                ? await prisma.organization.findUnique({
                      where: { slug: normalizeOrganizationSlug(token) },
                      select: {
                          id: true,
                          name: true,
                          slug: true,
                          joinToken: true,
                          privateJoinToken: true
                      }
                  })
                : null

        const resolved = organization || slugFallback
        if (!resolved) {
            return res.status(404).json({ success: false, message: "Organization link is invalid" })
        }

        return res.json({
            success: true,
            data: {
                id: resolved.id,
                name: resolved.name,
                slug: resolved.slug,
                linkType:
                    resolved.joinToken === token
                        ? "PUBLIC"
                        : "PRIVATE"
            }
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to validate organization link" })
    }
})

const handleJoinRequest = async (req: AuthRequest, res: any) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationInput = String(req.body?.organization || req.body?.organizationLink || "").trim()
        if (!organizationInput) {
            return res.status(400).json({ success: false, message: "Organization is required" })
        }

        const joinToken = extractOrganizationJoinToken(organizationInput)
        const organization = joinToken
            ? await prisma.organization.findFirst({
                  where: {
                      OR: [{ joinToken }, { privateJoinToken: joinToken }]
                  }
              })
            : isObjectId(organizationInput)
              ? await prisma.organization.findUnique({ where: { id: organizationInput } })
              : await prisma.organization.findUnique({
                    where: { slug: normalizeOrganizationSlug(organizationInput) }
                })

        if (!organization) {
            return res.status(404).json({ success: false, message: "Organization not found" })
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                channel: {
                    select: {
                        name: true,
                        username: true
                    }
                }
            }
        })
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" })
        }

        const domain = user.email.split("@")[1]?.toLowerCase()
        const invite = await prisma.organizationInvite.findFirst({
            where: {
                organizationId: organization.id,
                email: user.email,
                status: "PENDING",
                expiresAt: { gt: new Date() }
            }
        })

        const domainApproved =
            Boolean(organization.allowedDomain) &&
            domain === organization.allowedDomain?.toLowerCase()

        const publicLinkApproved = Boolean(joinToken && organization.joinToken === joinToken)
        const autoApprove = Boolean(invite || domainApproved || publicLinkApproved)
        const status = autoApprove ? "APPROVED" : "PENDING"

        const membership = await prisma.organizationMembership.upsert({
            where: {
                organizationId_userId: {
                    organizationId: organization.id,
                    userId: req.user.id
                }
            },
            update: {
                status,
                approvedAt: autoApprove ? new Date() : null,
                leftAt: null
            },
            create: {
                organizationId: organization.id,
                userId: req.user.id,
                status,
                approvedAt: autoApprove ? new Date() : null
            }
        })

        if (invite && autoApprove) {
            await prisma.organizationInvite.update({
                where: { id: invite.id },
                data: {
                    status: "ACCEPTED",
                    acceptedByUserId: req.user.id,
                    acceptedAt: new Date(),
                    expiresAt: new Date()
                }
            })
        }

        if (status === "APPROVED") {
            await prisma.user.update({
                where: { id: req.user.id },
                data: { activeOrganizationId: organization.id }
            })
        } else {
            await notifyOrganizationAdminsForJoinRequest(organization.id, organization.name, {
                name: user.name,
                email: user.email,
                channelName: user.channel?.name,
                channelUsername: user.channel?.username
            })
        }

        return res.json({
            success: true,
            message:
                status === "APPROVED"
                    ? publicLinkApproved
                        ? "Joined organization via public link"
                        : "Joined organization"
                    : "Join request submitted",
            data: membership
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to join organization" })
    }
}

router.post("/join", authenticate, handleJoinRequest)
router.post("/join-request", authenticate, handleJoinRequest)

router.post("/join-by-token", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const token = String(req.body?.token || "").trim()
        if (!token) return res.status(400).json({ success: false, message: "Token is required" })

        const invite = await prisma.organizationInvite.findUnique({ where: { token } })
        if (!invite || invite.status !== "PENDING") {
            return res.status(404).json({ success: false, message: "Invite not found or already used" })
        }

        if (invite.expiresAt.getTime() < Date.now()) {
            return res.status(400).json({ success: false, message: "Invite link expired" })
        }

        const user = await prisma.user.findUnique({ where: { id: req.user.id } })
        if (!user) return res.status(404).json({ success: false, message: "User not found" })

        if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
            return res.status(403).json({ success: false, message: "This invite is for a different email" })
        }

        const membership = await prisma.organizationMembership.upsert({
            where: {
                organizationId_userId: {
                    organizationId: invite.organizationId,
                    userId: req.user.id
                }
            },
            update: {
                status: "APPROVED",
                approvedAt: new Date(),
                leftAt: null
            },
            create: {
                organizationId: invite.organizationId,
                userId: req.user.id,
                status: "APPROVED",
                approvedAt: new Date()
            }
        })

        await prisma.organizationInvite.update({
            where: { id: invite.id },
            data: {
                status: "ACCEPTED",
                acceptedByUserId: req.user.id,
                acceptedAt: new Date(),
                expiresAt: new Date()
            }
        })

        await prisma.user.update({
            where: { id: req.user.id },
            data: { activeOrganizationId: invite.organizationId }
        })

        await createOrgNotification(
            req.user.id,
            "Organization Joined",
            "You have been added to the organization via invite link.",
            "/organization",
            "ORG_APPROVED"
        )

        return res.json({ success: true, data: membership, message: "Joined organization via invite" })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to join organization via token" })
    }
})

router.post("/join-by-link", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const token = String(req.body?.token || req.query?.token || "").trim()
        if (!token || token === "null" || token === "undefined") {
            return res.status(400).json({ success: false, message: "Organization token is required" })
        }

        const organization = await prisma.organization.findFirst({
            where: {
                OR: [{ joinToken: token }, { privateJoinToken: token }]
            }
        })

        const slugFallback =
            !organization && token
                ? await prisma.organization.findUnique({
                      where: { slug: normalizeOrganizationSlug(token) }
                  })
                : null

        const resolved = organization || slugFallback
        if (!resolved) {
            return res.status(404).json({ success: false, message: "Organization not found" })
        }

        const isPublicLink = resolved.joinToken === token

        const existingMembership = await prisma.organizationMembership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId: resolved.id,
                    userId: req.user.id
                }
            }
        })

        const status: "APPROVED" | "PENDING" =
            existingMembership?.status === "APPROVED"
                ? "APPROVED"
                : isPublicLink
                  ? "APPROVED"
                  : "PENDING"

        const membership = await prisma.organizationMembership.upsert({
            where: {
                organizationId_userId: {
                    organizationId: resolved.id,
                    userId: req.user.id
                }
            },
            update: {
                status,
                approvedAt: status === "APPROVED" ? existingMembership?.approvedAt || new Date() : null,
                leftAt: null
            },
            create: {
                organizationId: resolved.id,
                userId: req.user.id,
                status,
                approvedAt: status === "APPROVED" ? new Date() : null
            }
        })

        if (status === "APPROVED") {
            await prisma.user.update({
                where: { id: req.user.id },
                data: { activeOrganizationId: resolved.id }
            })

            await createOrgNotification(
                req.user.id,
                "Organization Joined",
                `You joined ${resolved.name} using organization link.`,
                "/organization",
                "ORG_APPROVED"
            )
        } else {
            await createOrgNotification(
                req.user.id,
                "Organization Join Requested",
                `Your join request for ${resolved.name} has been submitted and is waiting for admin approval.`,
                "/organization",
                "GENERAL"
            )
            const user = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: { name: true, email: true }
            })
            await notifyOrganizationAdminsForJoinRequest(resolved.id, resolved.name, user || {})
        }

        return res.json({
            success: true,
            data: membership,
            message:
                status === "APPROVED"
                    ? "Joined organization successfully."
                    : "Request sent. Please wait for admin approval."
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to join organization via link" })
    }
})

router.post("/leave", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationId = normalizeId(req.body?.organizationId)
        if (!organizationId) {
            return res.status(400).json({ success: false, message: "organizationId is required" })
        }

        const membership = await prisma.organizationMembership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: req.user.id
                }
            }
        })

        if (!membership || membership.status !== "APPROVED") {
            return res.status(404).json({ success: false, message: "Membership not found" })
        }

        if (membership.role === "ADMIN") {
            const adminCount = await prisma.organizationMembership.count({
                where: {
                    organizationId,
                    status: "APPROVED",
                    role: "ADMIN"
                }
            })

            if (adminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot leave organization as the last admin. Promote another admin first."
                })
            }
        }

        await prisma.organizationMembership.updateMany({
            where: {
                organizationId,
                userId: req.user.id,
                status: "APPROVED"
            },
            data: {
                status: "LEFT",
                leftAt: new Date()
            }
        })

        await prisma.user.update({
            where: { id: req.user.id },
            data: { activeOrganizationId: null }
        })

        return res.json({
            success: true,
            message: "Left organization."
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to leave organization" })
    }
})

router.post("/mode", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationId = normalizeId(req.body?.organizationId)
        if (!organizationId) {
            await prisma.user.update({
                where: { id: req.user.id },
                data: { activeOrganizationId: null }
            })
            return res.json({ success: true, message: "Organization mode disabled" })
        }

        const membership = await prisma.organizationMembership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: req.user.id
                }
            }
        })

        if (!membership || membership.status !== "APPROVED") {
            return res.status(403).json({
                success: false,
                message: "You are not approved in this organization"
            })
        }

        await prisma.user.update({
            where: { id: req.user.id },
            data: { activeOrganizationId: organizationId }
        })

        return res.json({ success: true, message: "Organization mode enabled" })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to switch organization mode" })
    }
})

router.post("/invite", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationId = normalizeId(req.body?.organizationId)
        const identifier = String(req.body?.email || req.body?.identifier || "").trim()
        if (!organizationId || !identifier) {
            return res.status(400).json({ success: false, message: "organizationId and user email or channel name are required" })
        }

        await requireOrganizationAdmin(req.user.id, organizationId)

        const resolvedUser = await resolveUserByEmailOrChannelName(identifier)
        const email = resolvedUser?.email?.toLowerCase() || identifier.toLowerCase()

        const existingPendingInvite = await prisma.organizationInvite.findFirst({
            where: {
                organizationId,
                email,
                status: "PENDING",
                expiresAt: { gt: new Date() }
            },
            orderBy: { createdAt: "desc" }
        })

        const invite = existingPendingInvite
            ? existingPendingInvite
            : await prisma.organizationInvite.create({
                  data: {
                      organizationId,
                      email,
                      token: crypto.randomBytes(24).toString("hex"),
                      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                      createdByUserId: req.user.id
                  }
              })

        const organization = await prisma.organization.findUnique({ where: { id: organizationId } })
        const inviteLink = `${CLIENT_URL}/organization?token=${invite.token}`

        await sendOrganizationInviteEmail(
            email,
            organization?.name || "Organization",
            inviteLink
        ).catch(() => {})

        const invitedUser = resolvedUser || await prisma.user.findUnique({ where: { email } })
        if (invitedUser) {
            await createOrgNotification(
                invitedUser.id,
                "Organization Invitation",
                `You were invited to join ${organization?.name || "an organization"} by ${req.user.email}. The invite link expires in 24 hours.`,
                `/organization?token=${invite.token}`,
                "ORG_INVITE"
            )
        }

        return res.status(201).json({ success: true, data: { ...invite, inviteLink } })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to invite user" })
    }
})

router.post("/membership/:id/approve", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const id = normalizeId(req.params.id)
        if (!id) return res.status(400).json({ success: false, message: "Invalid membership id" })

        const membership = await prisma.organizationMembership.findUnique({
            where: { id },
            include: {
                organization: {
                    select: { name: true }
                }
            }
        })
        if (!membership) return res.status(404).json({ success: false, message: "Membership not found" })

        await requireOrganizationAdmin(req.user.id, membership.organizationId)

        const approved = await prisma.organizationMembership.update({
            where: { id },
            data: {
                status: "APPROVED",
                approvedAt: new Date(),
                leftAt: null
            }
        })

        await prisma.user.update({
            where: { id: approved.userId },
            data: { activeOrganizationId: membership.organizationId }
        })

        await createOrgNotification(
            approved.userId,
            "Organization Access Approved",
            `Your request to join ${membership.organization?.name || "the organization"} was approved. Organization mode is now enabled.`,
            "/organization",
            "ORG_APPROVED"
        )

        return res.json({ success: true, data: approved })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to approve membership" })
    }
})

router.post("/membership/approve-all", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationId = normalizeId(req.body?.organizationId)
        if (!organizationId) {
            return res.status(400).json({ success: false, message: "organizationId is required" })
        }

        await requireOrganizationAdmin(req.user.id, organizationId)

        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { name: true }
        })

        const pendingMemberships = await prisma.organizationMembership.findMany({
            where: {
                organizationId,
                status: "PENDING"
            }
        })

        if (!pendingMemberships.length) {
            return res.json({ success: true, updated: 0 })
        }

        await prisma.organizationMembership.updateMany({
            where: {
                organizationId,
                status: "PENDING"
            },
            data: {
                status: "APPROVED",
                approvedAt: new Date(),
                leftAt: null
            }
        })

        await Promise.all(
            pendingMemberships.map(async (membership) => {
                await prisma.user.update({
                    where: { id: membership.userId },
                    data: { activeOrganizationId: organizationId }
                })

                await createOrgNotification(
                    membership.userId,
                    "Organization Access Approved",
                    `Your request to join ${organization?.name || "the organization"} was approved. Organization mode is now enabled.`,
                    "/organization",
                    "ORG_APPROVED"
                )
            })
        )

        return res.json({ success: true, updated: pendingMemberships.length })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to approve all memberships" })
    }
})

router.post("/membership/:id/role", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const id = normalizeId(req.params.id)
        const role = String(req.body?.role || "MEMBER").toUpperCase()
        if (!id || !["ADMIN", "MEMBER"].includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role or membership id" })
        }

        const membership = await prisma.organizationMembership.findUnique({ where: { id } })
        if (!membership) return res.status(404).json({ success: false, message: "Membership not found" })

        await requireOrganizationAdmin(req.user.id, membership.organizationId)

        if (membership.role === "ADMIN" && role === "MEMBER") {
            const organization = await prisma.organization.findUnique({
                where: { id: membership.organizationId },
                select: { ownerId: true }
            })

            if (organization?.ownerId === membership.userId) {
                return res.status(400).json({
                    success: false,
                    message: "Organization creator cannot be removed from admin role."
                })
            }

            const adminCount = await prisma.organizationMembership.count({
                where: {
                    organizationId: membership.organizationId,
                    status: "APPROVED",
                    role: "ADMIN"
                }
            })

            if (adminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot remove the last admin. Add another admin first."
                })
            }
        }

        const updated = await prisma.organizationMembership.update({
            where: { id },
            data: { role: role as "ADMIN" | "MEMBER" }
        })

        return res.json({ success: true, data: updated })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to update role" })
    }
})

router.post("/membership/promote-by-email", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationId = normalizeId(req.body?.organizationId)
        const identifier = String(req.body?.email || req.body?.identifier || "").trim()
        if (!organizationId || !identifier) {
            return res.status(400).json({ success: false, message: "organizationId and user email or channel name are required" })
        }

        await requireOrganizationAdmin(req.user.id, organizationId)

        const user = await resolveUserByEmailOrChannelName(identifier)
        if (!user) return res.status(404).json({ success: false, message: "User not found" })

        const membership = await prisma.organizationMembership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId,
                    userId: user.id
                }
            },
            include: {
                organization: {
                    select: { name: true }
                }
            }
        })

        if (!membership || membership.status !== "APPROVED") {
            return res.status(400).json({ success: false, message: "User is not an approved member" })
        }

        const updated = await prisma.organizationMembership.update({
            where: { id: membership.id },
            data: { role: "ADMIN" }
        })

        await createOrgNotification(
            user.id,
            "Organization Role Updated",
            `You were promoted to admin in ${membership.organization?.name || "the organization"}.`,
            "/organization",
            "ORG_APPROVED"
        )

        return res.json({ success: true, data: updated })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to promote admin by email" })
    }
})

router.post("/membership/:id/remove", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const id = normalizeId(req.params.id)
        if (!id) return res.status(400).json({ success: false, message: "Invalid membership id" })

        const membership = await prisma.organizationMembership.findUnique({
            where: { id },
            include: {
                organization: {
                    select: { name: true }
                },
                user: {
                    select: { id: true }
                }
            }
        })

        if (!membership) return res.status(404).json({ success: false, message: "Membership not found" })

        await requireOrganizationAdmin(req.user.id, membership.organizationId)

        const organization = await prisma.organization.findUnique({
            where: { id: membership.organizationId },
            select: { ownerId: true }
        })

        if (organization?.ownerId === membership.userId) {
            return res.status(400).json({
                success: false,
                message: "Organization creator cannot be removed."
            })
        }

        if (membership.role === "ADMIN") {
            const adminCount = await prisma.organizationMembership.count({
                where: {
                    organizationId: membership.organizationId,
                    status: "APPROVED",
                    role: "ADMIN"
                }
            })

            if (adminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot remove the last admin. Add another admin first."
                })
            }
        }

        await prisma.organizationMembership.update({
            where: { id },
            data: {
                status: "LEFT",
                leftAt: new Date()
            }
        })

        const user = await prisma.user.findUnique({
            where: { id: membership.userId },
            select: { activeOrganizationId: true }
        })

        if (user?.activeOrganizationId === membership.organizationId) {
            await prisma.user.update({
                where: { id: membership.userId },
                data: { activeOrganizationId: null }
            })
        }

        await createOrgNotification(
            membership.user.id,
            "Organization Access Removed",
            `Your access to ${membership.organization?.name || "the organization"} was removed by an admin.`,
            "/organization",
            "GENERAL"
        )

        return res.json({ success: true })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to remove member" })
    }
})

router.post("/settings", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationId = normalizeId(req.body?.organizationId)
        if (!organizationId) {
            return res.status(400).json({ success: false, message: "organizationId is required" })
        }

        await requireOrganizationAdmin(req.user.id, organizationId)

        const updateData: Record<string, unknown> = {}
        if (typeof req.body?.allowPublicContent === "boolean") {
            updateData.allowPublicContent = req.body.allowPublicContent
        }
        if (typeof req.body?.allowPrivateContent === "boolean") {
            updateData.allowPrivateContent = req.body.allowPrivateContent
        }
        if (typeof req.body?.restrictContentForAdmins === "boolean") {
            updateData.restrictContentForAdmins = req.body.restrictContentForAdmins
        }
        if (typeof req.body?.allowedDomain === "string") {
            updateData.allowedDomain = req.body.allowedDomain.trim().toLowerCase() || null
        }
        if (typeof req.body?.uploadPolicy === "string") {
            const policy = req.body.uploadPolicy.toUpperCase()
            if (["ALL_MEMBERS", "SPECIFIC_USERS", "ADMINS_ONLY"].includes(policy)) {
                updateData.uploadPolicy = policy
            }
        }

        const organization = await prisma.organization.update({
            where: { id: organizationId },
            data: updateData
        })

        if (Array.isArray(req.body?.allowedUploaderUserIds)) {
            const userIds = req.body.allowedUploaderUserIds
                .map((id: unknown) => normalizeId(id))
                .filter(Boolean)

            await prisma.organizationAllowedUploader.deleteMany({
                where: { organizationId }
            })

            if (userIds.length) {
                await prisma.organizationAllowedUploader.createMany({
                    data: userIds.map((userId: string) => ({
                        organizationId,
                        userId
                    })),
                    skipDuplicates: true
                })
            }
        }

        return res.json({ success: true, data: organization })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to update organization settings" })
    }
})

router.post("/subscription", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationId = normalizeId(req.body?.organizationId)
        const plan = String(req.body?.plan || "").toUpperCase()
        if (!organizationId || !["SIX_MONTH", "YEARLY_INITIAL", "YEARLY_RENEWAL"].includes(plan)) {
            return res.status(400).json({ success: false, message: "organizationId and valid plan are required" })
        }

        await requireOrganizationAdmin(req.user.id, organizationId)

        const now = new Date()
        const nextEnd = addMonths(now, plan === "SIX_MONTH" ? 6 : 12)

        const updated = await prisma.organization.update({
            where: { id: organizationId },
            data: {
                subscriptionPlan: plan as "SIX_MONTH" | "YEARLY_INITIAL" | "YEARLY_RENEWAL",
                billingStatus: "ACTIVE",
                subscriptionEndsAt: nextEnd,
                blockedAt: null
            }
        })

        return res.json({
            success: true,
            message:
                plan === "SIX_MONTH"
                    ? "Upgraded to 6 month plan (Rs 18000)"
                    : plan === "YEARLY_INITIAL"
                      ? "Upgraded to yearly initial plan (Rs 10000 one-time for initial users)"
                      : "Upgraded to yearly renewal plan (Rs 24000 annually)",
            data: updated
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to update subscription" })
    }
})

router.get("/dashboard/:organizationId", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationId = normalizeId(req.params.organizationId)
        if (!organizationId) return res.status(400).json({ success: false, message: "Invalid organizationId" })

        await requireOrganizationAdmin(req.user.id, organizationId)

        const [videos, views, likes, dislikes, shares, watchHistory] = await Promise.all([
            prisma.video.findMany({
                where: { organizationId, status: "ACTIVE" },
                select: {
                    id: true,
                    publicId: true,
                    title: true,
                    createdAt: true
                }
            }),
            prisma.videoView.findMany({
                where: { video: { organizationId, status: "ACTIVE" } },
                include: { user: { select: { id: true, name: true, email: true } }, video: { select: { id: true, publicId: true, title: true } } },
                orderBy: { createdAt: "asc" }
            }),
            prisma.videoReaction.findMany({
                where: { video: { organizationId, status: "ACTIVE" }, type: "LIKE" },
                include: { user: { select: { id: true, name: true, email: true } }, video: { select: { id: true, publicId: true, title: true } } },
                orderBy: { createdAt: "asc" }
            }),
            prisma.videoReaction.findMany({
                where: { video: { organizationId, status: "ACTIVE" }, type: "DISLIKE" },
                include: { user: { select: { id: true, name: true, email: true } }, video: { select: { id: true, publicId: true, title: true } } },
                orderBy: { createdAt: "asc" }
            }),
            prisma.videoShare.findMany({
                where: { video: { organizationId, status: "ACTIVE" } },
                include: { user: { select: { id: true, name: true, email: true } }, video: { select: { id: true, publicId: true, title: true } } },
                orderBy: { createdAt: "asc" }
            }),
            prisma.watchHistory.findMany({
                where: { video: { organizationId, status: "ACTIVE" } },
                include: { user: { select: { id: true, name: true, email: true } }, video: { select: { id: true, publicId: true, title: true } } },
                orderBy: { updatedAt: "desc" }
            })
        ])

        const metricsByVideo = new Map<number, {
            publicId: string
            title: string
            shares: number
            likes: number
            views: number
        }>()

        videos.forEach((v) => {
            metricsByVideo.set(v.id, {
                publicId: v.publicId,
                title: v.title,
                shares: 0,
                likes: 0,
                views: 0
            })
        })
        shares.forEach((s) => {
            const row = metricsByVideo.get(s.videoId)
            if (row) row.shares += 1
        })
        likes.forEach((l) => {
            const row = metricsByVideo.get(l.videoId)
            if (row) row.likes += 1
        })
        views.forEach((v) => {
            const row = metricsByVideo.get(v.videoId)
            if (row) row.views += 1
        })

        const topVideos = Array.from(metricsByVideo.values())
            .sort((a, b) => {
                if (b.shares !== a.shares) return b.shares - a.shares
                if (b.likes !== a.likes) return b.likes - a.likes
                return b.views - a.views
            })
            .slice(0, 5)

        return res.json({
            success: true,
            data: {
                totals: {
                    videos: videos.length,
                    views: views.length,
                    likes: likes.length,
                    dislikes: dislikes.length,
                    shares: shares.length
                },
                topVideos,
                activity: {
                    views: views.slice(0, 200),
                    likes: likes.slice(0, 200),
                    dislikes: dislikes.slice(0, 200),
                    shares: shares.slice(0, 200),
                    watchHistory: watchHistory.slice(0, 200)
                }
            }
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to fetch organization dashboard" })
    }
})

router.get("/:organizationId/members", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationId = normalizeId(req.params.organizationId)
        if (!organizationId) return res.status(400).json({ success: false, message: "Invalid organizationId" })

        await requireOrganizationAdmin(req.user.id, organizationId)

        const [memberships, invites] = await Promise.all([
            prisma.organizationMembership.findMany({
                where: { organizationId },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            username: true,
                            avatarKey: true,
                            createdAt: true,
                            isVerified: true,
                            provider: true,
                            channel: {
                                select: {
                                    id: true,
                                    name: true,
                                    username: true,
                                    description: true,
                                    createdAt: true,
                                    _count: {
                                        select: {
                                            videos: true,
                                            subscribers: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: { requestedAt: "desc" }
            }),
            prisma.organizationInvite.findMany({
                where: { organizationId },
                orderBy: { createdAt: "desc" }
            })
        ])

        return res.json({
            success: true,
            data: {
                memberships,
                invites
            }
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to fetch members" })
    }
})

router.get("/:organizationId/share-link", authenticate, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" })

        const organizationId = normalizeId(req.params.organizationId)
        if (!organizationId) return res.status(400).json({ success: false, message: "Invalid organizationId" })

        await requireOrganizationAdmin(req.user.id, organizationId)

        const organization = await ensureOrganizationTokens(organizationId)

        if (!organization) return res.status(404).json({ success: false, message: "Organization not found" })

        const { publicLink, privateLink } = buildOrganizationShareLinks(organization)
        return res.json({
            success: true,
            data: {
                publicLink,
                privateLink,
                publicToken: organization.joinToken,
                privateToken: organization.privateJoinToken
            }
        })
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message || "Failed to get share link" })
    }
})

export default router
