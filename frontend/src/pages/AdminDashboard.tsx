import { type ReactNode, useEffect, useMemo, useState } from "react"
import AppLayout from "@/layouts/AppLayout"
import { api } from "@/api/axios"
import { useAuth } from "@/context/AuthContext"

const SUPER_ADMIN_EMAIL = "samakshrastogi885@gmail.com"

interface Metrics {
    cards: {
        uniqueUsers: number
        totalLogins: number
        avgSessionLength: number
        likes: number
        dislikes: number
        shares: number
    }
    userActivity: {
        dau: number
        wau: number
        mau: number
    }
    watchMetrics: {
        totalWatchSeconds: number
        averageCompletionRate: number
    }
    dailyLogins: { day: string; count: number }[]
    topVideos: {
        id: string
        title: string
        views: number
        likes: number
        shares: number
        comments: number
        duration: number
        createdAt: string
    }[]
    topOrganizations: { id: string; name: string; shares: number; likes: number; views: number }[]
    organizationHealth: {
        billingStatusCounts: Record<string, number>
        expiringTrials: {
            id: string
            name: string
            subscriptionPlan: string
            billingStatus: string
            trialEndsAt: string
            daysLeft: number
        }[]
    }
    inviteFunnel: {
        total: number
        accepted: number
        pending: number
        cancelled: number
        expired: number
        acceptanceRate: number
    }
    adminAccessAudit: {
        id: string
        action: string
        createdAt: string
        actor: {
            id: string
            email: string
            name?: string
        }
        target: {
            id: string
            email: string
            name?: string
        }
    }[]
    subscriptionCounts: { plan: string; count: number }[]
}

interface AdminUserOption {
    id: string
    email: string
    name?: string
    username?: string
    platformAdmin: boolean
    locked?: boolean
}

interface DashboardFilters {
    startDate: string
    endDate: string
    billingStatus: string
    subscriptionPlan: string
    organizationId: string
    visibility: string
    inviteStatus: string
    adminAction: string
    minViews: string
    minShares: string
    userActivityType: string
}

interface FilterOrganizationOption {
    id: string
    name: string
}

type DatePreset = "LAST_7_DAYS" | "LAST_30_DAYS" | "LAST_90_DAYS" | "CUSTOM"

const DEFAULT_FILTERS: DashboardFilters = {
    startDate: "",
    endDate: "",
    billingStatus: "",
    subscriptionPlan: "",
    organizationId: "",
    visibility: "",
    inviteStatus: "",
    adminAction: "",
    minViews: "",
    minShares: "",
    userActivityType: ""
}

const BILLING_STATUS_OPTIONS = ["TRIAL_ACTIVE", "ACTIVE", "EXPIRED"]
const SUBSCRIPTION_PLAN_OPTIONS = ["NONE", "TRIAL_FREE", "SIX_MONTH", "YEARLY_INITIAL", "YEARLY_RENEWAL"]
const VISIBILITY_OPTIONS = ["PUBLIC", "PRIVATE", "ORGANIZATION"]
const INVITE_STATUS_OPTIONS = ["PENDING", "ACCEPTED", "CANCELLED", "EXPIRED"]
const ADMIN_ACTION_OPTIONS = ["GRANT", "REMOVE"]
const USER_ACTIVITY_OPTIONS = [
    { value: "NEW", label: "New Users" },
    { value: "RETURNING", label: "Returning Users" }
]

const AdminDashboard = () => {
    const { user } = useAuth()
    const [metrics, setMetrics] = useState<Metrics | null>(null)
    const [message, setMessage] = useState("")
    const [isGrantModalOpen, setIsGrantModalOpen] = useState(false)
    const [isGranting, setIsGranting] = useState(false)
    const [adminUsers, setAdminUsers] = useState<AdminUserOption[]>([])
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
    const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
    const [isLoadingAdminUsers, setIsLoadingAdminUsers] = useState(false)
    const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)
    const [draftFilters, setDraftFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
    const [datePreset, setDatePreset] = useState<DatePreset>("CUSTOM")
    const [filterOrganizations, setFilterOrganizations] = useState<FilterOrganizationOption[]>([])
    const [isLoadingFilterOptions, setIsLoadingFilterOptions] = useState(false)

    const canAccess = user?.email === SUPER_ADMIN_EMAIL || user?.platformAdmin

    const loadMetrics = async () => {
        const params: Record<string, string> = {}
        if (filters.startDate) params.startDate = filters.startDate
        if (filters.endDate) params.endDate = filters.endDate
        if (filters.billingStatus) params.billingStatus = filters.billingStatus
        if (filters.subscriptionPlan) params.subscriptionPlan = filters.subscriptionPlan
        if (filters.organizationId) params.organizationId = filters.organizationId
        if (filters.visibility) params.visibility = filters.visibility
        if (filters.inviteStatus) params.inviteStatus = filters.inviteStatus
        if (filters.adminAction) params.adminAction = filters.adminAction
        if (filters.minViews) params.minViews = filters.minViews
        if (filters.minShares) params.minShares = filters.minShares
        if (filters.userActivityType) params.userActivityType = filters.userActivityType

        const res = await api.get("/admin/metrics", { params })
        setMetrics(res.data?.data || null)
    }

    useEffect(() => {
        if (!canAccess) return
        const fetchMetrics = async () => {
            try {
                await loadMetrics()
            } catch {
                setMessage("Failed to load admin metrics.")
            }
        }
        fetchMetrics()
    }, [canAccess, filters])

    useEffect(() => {
        if (!isGrantModalOpen || user?.email !== SUPER_ADMIN_EMAIL) return

        const loadAdminUsers = async () => {
            try {
                setIsLoadingAdminUsers(true)
                const res = await api.get("/admin/users")
                setAdminUsers(res.data?.data || [])
            } catch {
                setMessage("Failed to load users.")
            } finally {
                setIsLoadingAdminUsers(false)
            }
        }

        loadAdminUsers()
    }, [isGrantModalOpen, user?.email])

    useEffect(() => {
        if (!canAccess) return

        const loadFilterOptions = async () => {
            try {
                setIsLoadingFilterOptions(true)
                const res = await api.get("/admin/filter-options")
                setFilterOrganizations(res.data?.data?.organizations || [])
            } catch {
                setMessage("Failed to load dashboard filter options.")
            } finally {
                setIsLoadingFilterOptions(false)
            }
        }

        loadFilterOptions()
    }, [canAccess])

    const chartMax = useMemo(() => {
        if (!metrics?.dailyLogins?.length) return 0
        return Math.max(...metrics.dailyLogins.map((d) => d.count))
    }, [metrics])

    const formatDuration = (totalSeconds: number) => {
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60

        const parts = []

        if (hours > 0) parts.push(`${hours}h`)
        if (minutes > 0) parts.push(`${minutes}m`)
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)

        return parts.join(" ")
    }

    const avgSessionText = useMemo(() => {
        if (!metrics) return "0s"

        const seconds = Math.round(metrics.cards.avgSessionLength)
        return formatDuration(seconds)
    }, [metrics])

    const resetGrantModal = () => {
        setIsGrantModalOpen(false)
        setIsUserDropdownOpen(false)
        setSelectedUserIds([])
    }

    const toggleSelectedUser = (userId: string) => {
        setSelectedUserIds((current) =>
            current.includes(userId)
                ? current.filter((id) => id !== userId)
                : [...current, userId]
        )
    }

    const handleAccessUpdate = async (access: boolean) => {
        if (!selectedUserIds.length) return
        try {
            setIsGranting(true)
            const res = await api.post("/admin/access", { userIds: selectedUserIds, access })
            const updatedCount = res.data?.data?.updatedCount || 0
            setMessage(access ? `Access granted to ${updatedCount} user(s).` : `Access removed for ${updatedCount} user(s).`)
            const usersRes = await api.get("/admin/users")
            setAdminUsers(usersRes.data?.data || [])
            setSelectedUserIds([])
            setIsUserDropdownOpen(false)
            setIsGrantModalOpen(false)
        } catch {
            setMessage(access ? "Failed to grant access." : "Failed to remove access.")
        } finally {
            setIsGranting(false)
        }
    }

    const selectedUsersLabel = selectedUserIds.length
        ? `${selectedUserIds.length} user${selectedUserIds.length > 1 ? "s" : ""} selected`
        : "Select users"

    const totalWatchTimeText = useMemo(() => {
        return formatDuration(Math.round(metrics?.watchMetrics.totalWatchSeconds || 0))
    }, [metrics])

    const activeFilterCount = Object.values(filters).filter(Boolean).length

    const getRelativeDateRange = (days: number) => {
        const end = new Date()
        const start = new Date()
        start.setDate(end.getDate() - (days - 1))

        const toInputDate = (value: Date) => {
            const year = value.getFullYear()
            const month = `${value.getMonth() + 1}`.padStart(2, "0")
            const day = `${value.getDate()}`.padStart(2, "0")
            return `${year}-${month}-${day}`
        }

        return {
            startDate: toInputDate(start),
            endDate: toInputDate(end)
        }
    }

    const applyDatePreset = (preset: DatePreset) => {
        setDatePreset(preset)
        if (preset === "CUSTOM") return

        const nextRange =
            preset === "LAST_7_DAYS"
                ? getRelativeDateRange(7)
                : preset === "LAST_30_DAYS"
                    ? getRelativeDateRange(30)
                    : getRelativeDateRange(90)

        setDraftFilters((current) => ({
            ...current,
            ...nextRange
        }))
    }

    const applyFilters = () => {
        setFilters(draftFilters)
        setIsFilterModalOpen(false)
    }

    const resetFilters = () => {
        setDraftFilters(DEFAULT_FILTERS)
        setFilters(DEFAULT_FILTERS)
        setDatePreset("CUSTOM")
        setIsFilterModalOpen(false)
    }

    const formatEnumLabel = (value: string) => value.split("_").join(" ")
    const selectedOrganizationLabel = filterOrganizations.find((organization) => organization.id === filters.organizationId)?.name

    return (
        <AppLayout>
            <div className="w-full space-y-6 px-2 sm:px-4">
                {!canAccess && (
                    <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-transparent p-6 text-center space-y-4">
                        <div className="text-4xl">🚫</div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">
                                Access Restricted
                            </h2>
                            <p className="mt-1 text-sm text-gray-400">
                                You do not have permission to view this dashboard.
                            </p>
                        </div>
                        <div className="text-xs text-gray-500">
                            Contact a super admin to request access.
                        </div>
                    </div>
                )}

                {metrics && (
                    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(16,24,44,0.94),rgba(10,15,30,0.98))] shadow-[0_28px_80px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
                        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-1.5">
                                    <div>
                                        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                                            Platform Admin Dashboard
                                        </h1>
                                        <p className="mt-1.5 text-sm text-slate-300/72">
                                            Platform-wide analytics, access control, and health signals in one connected workspace.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col items-start gap-2 lg:items-end">
                                    <span className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
                                        System Active
                                    </span>

                                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDraftFilters(filters)
                                                setDatePreset("CUSTOM")
                                                setIsFilterModalOpen(true)
                                            }}
                                            className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/14"
                                        >
                                            {activeFilterCount ? `Filter (${activeFilterCount})` : "Filter"}
                                        </button>

                                        {user?.email === SUPER_ADMIN_EMAIL && (
                                            <button
                                                type="button"
                                                onClick={() => setIsGrantModalOpen(true)}
                                                className="rounded-full border border-cyan-300/20 bg-cyan-400/12 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
                                            >
                                                Admin Access
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {message && (
                                <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
                                    {message}
                                </div>
                            )}

                            {activeFilterCount > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {filters.startDate && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            From {filters.startDate}
                                        </span>
                                    )}
                                    {filters.endDate && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            To {filters.endDate}
                                        </span>
                                    )}
                                    {filters.billingStatus && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            Billing: {formatEnumLabel(filters.billingStatus)}
                                        </span>
                                    )}
                                    {filters.subscriptionPlan && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            Plan: {formatEnumLabel(filters.subscriptionPlan)}
                                        </span>
                                    )}
                                    {selectedOrganizationLabel && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            Org: {selectedOrganizationLabel}
                                        </span>
                                    )}
                                    {filters.visibility && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            Visibility: {formatEnumLabel(filters.visibility)}
                                        </span>
                                    )}
                                    {filters.inviteStatus && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            Invites: {formatEnumLabel(filters.inviteStatus)}
                                        </span>
                                    )}
                                    {filters.adminAction && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            Admin Action: {formatEnumLabel(filters.adminAction)}
                                        </span>
                                    )}
                                    {filters.userActivityType && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            Users: {formatEnumLabel(filters.userActivityType)}
                                        </span>
                                    )}
                                    {filters.minViews && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            Min Views: {filters.minViews}
                                        </span>
                                    )}
                                    {filters.minShares && (
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-purple-100/75">
                                            Min Shares: {filters.minShares}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-5 px-5 py-5 sm:px-6">
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                <MetricCard label="Users" value={metrics.cards.uniqueUsers} icon="👥" sub="Platform-Wide Total Users" accent="cyan" />
                                <MetricCard label="Logins" value={metrics.cards.totalLogins} icon="🔐" sub="Total Historical Logins" accent="violet" />
                                <MetricCard label="Session" value={avgSessionText} icon="⏱️" sub="Average Session Duration" accent="slate" />
                                <DualMetricCard
                                    label="Reactions"
                                    leftIcon="👍"
                                    leftLabel="Like"
                                    leftValue={metrics.cards.likes}
                                    rightIcon="👎"
                                    rightLabel="Unlike"
                                    rightValue={metrics.cards.dislikes}
                                    accent="pink"
                                />
                                <MetricCard label="Shares" value={metrics.cards.shares} icon="📤" sub="Total Content Shares" accent="blue" />
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                <MetricCard label="Daily Active Users" value={metrics.userActivity.dau} icon="📅" sub="Yesterday's Active Users (24h)" accent="violet" />
                                <MetricCard label="Weekly Active Users" value={metrics.userActivity.wau} icon="🗓️" sub="Weekly Active User Trend (7d)" accent="indigo" />
                                <MetricCard label="Monthly Active Users" value={metrics.userActivity.mau} icon="🧭" sub="Monthly Active User Volume (30d)" accent="fuchsia" />
                                <MetricCard label="Watch Time" value={totalWatchTimeText} icon="▶️" sub="Total Content Watch Time" accent="amber" />
                                <MetricCard
                                    label="Completion"
                                    value={`${metrics.watchMetrics.averageCompletionRate}%`}
                                    icon="✅"
                                    sub="Average Video Completion Rate"
                                    accent="emerald"
                                />
                            </div>

                            <div>
                                <SectionCard>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-white">
                                            Daily Login Trends (Last {metrics.dailyLogins.length || 7} Days)
                                        </h2>
                                        <span className="text-xs text-purple-100/55">
                                            {metrics.dailyLogins.length
                                                ? `${metrics.dailyLogins[0]?.day.slice(5)} - ${metrics.dailyLogins[metrics.dailyLogins.length - 1]?.day.slice(5)}`
                                                : "No range"}
                                        </span>
                                    </div>

                                    {metrics.dailyLogins.length > 0 ? (
                                        <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.12))] p-4">
                                            <div className="mb-3 grid grid-cols-6 gap-3 text-[10px] text-purple-100/22">
                                                {[...Array(6)].map((_, idx) => (
                                                    <div key={idx} className="h-px bg-white/10" />
                                                ))}
                                            </div>
                                            <div className="flex min-h-[168px] items-end justify-start gap-5 overflow-x-auto pb-1">
                                            {metrics.dailyLogins.map((row) => {
                                                const height = chartMax
                                                    ? Math.max(18, Math.round((row.count / chartMax) * 118))
                                                    : 18

                                                return (
                                                    <div
                                                        key={row.day}
                                                        className="group relative flex w-16 shrink-0 flex-col items-center gap-2"
                                                    >
                                                        <div className="absolute -top-8 rounded-lg border border-cyan-300/20 bg-[#1b1942]/90 px-2 py-1 text-[10px] text-white opacity-0 shadow-[0_12px_24px_rgba(34,211,238,0.12)] transition group-hover:opacity-100">
                                                            {row.count}
                                                        </div>
                                                        <div
                                                            className="w-full rounded-2xl bg-gradient-to-t from-[#1d63ff] via-[#28b5e8] to-[#58e1d2] shadow-[0_14px_30px_rgba(36,166,255,0.24)] transition-all duration-300 group-hover:translate-y-[-2px] group-hover:from-[#2b73ff] group-hover:to-[#6fe7dc]"
                                                            style={{ height }}
                                                        />
                                                        <span className="text-[10px] font-medium text-purple-100/55">
                                                            {row.day.slice(5)}
                                                        </span>
                                                    </div>
                                                )
                                            })}
                                            </div>
                                        </div>
                                    ) : (
                                        <EmptyState
                                            icon="📊"
                                            title="No login activity yet"
                                            text="Once users start logging in, activity will appear here."
                                            minHeight="min-h-[168px]"
                                        />
                                    )}
                                </SectionCard>
                            </div>

                            <div className="grid gap-5 xl:grid-cols-2">
                                <SectionCard>
                                    <h2 className="mb-3 text-lg font-semibold text-white">
                                        Subscriptions
                                    </h2>

                                    <div className="space-y-2.5">
                                        {(metrics.subscriptionCounts || []).map((row) => (
                                            <div
                                                key={row.plan}
                                                className="flex items-center justify-between rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.12))] px-4 py-3 transition hover:border-white/14 hover:bg-white/10"
                                            >
                                                <span className="text-sm font-medium text-white">{row.plan}</span>
                                                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">{row.count}</span>
                                            </div>
                                        ))}

                                        {!metrics.subscriptionCounts.length && (
                                            <EmptyState title="No subscription data available" text="Subscription distribution will appear here once plans start getting used." compact />
                                        )}
                                    </div>
                                </SectionCard>

                                <SectionCard>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-white">
                                            Top Organizations
                                        </h2>
                                        <span className="text-xs text-purple-100/55">
                                            Ranked by performance
                                        </span>
                                    </div>

                                    <div className="space-y-2.5">
                                        {(metrics.topOrganizations || []).map((org, idx) => {
                                            const maxViews = Math.max(...metrics.topOrganizations.map((o) => o.views || 0), 1)
                                            const progress = Math.round((org.views / maxViews) * 100)

                                            return (
                                                <div
                                                    key={org.id}
                                                    className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.14))] p-3.5 transition hover:border-white/14 hover:bg-white/10"
                                                >
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="flex items-center gap-2">
                                                            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-purple-100/70">#{idx + 1}</span>
                                                            <span className="font-medium text-white">{org.name}</span>
                                                        </span>
                                                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-purple-100/70">{org.views} views</span>
                                                    </div>
                                                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                                                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${progress}%` }} />
                                                    </div>
                                                    <div className="mt-2 flex gap-3 text-[11px] text-purple-100/55">
                                                        <span>👍 {org.likes}</span>
                                                        <span>📤 {org.shares}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}

                                        {!metrics.topOrganizations.length && (
                                            <EmptyState title="No organization data available" text="Organization performance rankings will show up here once activity is recorded." compact />
                                        )}
                                    </div>
                                </SectionCard>
                            </div>

                            <div className="grid gap-5 xl:grid-cols-2">
                                <SectionCard>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-white">
                                            Top Videos
                                        </h2>
                                        <span className="text-xs text-purple-100/55">
                                            Ranked by views
                                        </span>
                                    </div>

                                    <div className="space-y-2.5">
                                        {(metrics.topVideos || []).map((video, idx) => (
                                            <div
                                                key={video.id}
                                                className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.14))] p-3.5 transition hover:border-white/14 hover:bg-white/10"
                                            >
                                                <div className="flex items-center justify-between gap-3 text-sm">
                                                    <span className="flex min-w-0 items-center gap-2">
                                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-purple-100/70">#{idx + 1}</span>
                                                        <span className="truncate font-medium text-white">{video.title}</span>
                                                    </span>
                                                    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-purple-100/70">{video.views} views</span>
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-purple-100/55">
                                                    <span>👍 {video.likes}</span>
                                                    <span>📤 {video.shares}</span>
                                                    <span>💬 {video.comments}</span>
                                                    <span>⏱️ {formatDuration(video.duration || 0)}</span>
                                                </div>
                                            </div>
                                        ))}

                                        {!metrics.topVideos.length && (
                                            <EmptyState title="No video performance data available" text="Top video rankings will appear here once views and engagement are recorded." compact />
                                        )}
                                    </div>
                                </SectionCard>

                                <SectionCard>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-white">
                                            Org Trial & Billing
                                        </h2>
                                        <span className="text-xs text-purple-100/55">
                                            Next 14 days
                                        </span>
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {Object.entries(metrics.organizationHealth.billingStatusCounts || {}).map(([status, count]) => (
                                            <div
                                                key={status}
                                                className="rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.12))] px-4 py-3"
                                            >
                                                <p className="text-[11px] uppercase tracking-wide text-purple-100/45">{status.split("_").join(" ")}</p>
                                                <p className="mt-1 text-lg font-bold text-white">{count}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-4 space-y-2.5">
                                        <h3 className="text-sm font-medium text-white">Expiring Trials</h3>

                                        {(metrics.organizationHealth.expiringTrials || []).map((org) => (
                                            <div
                                                key={org.id}
                                                className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.14))] px-4 py-3"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-white">{org.name}</p>
                                                        <p className="mt-1 text-[11px] text-purple-100/55">
                                                            {org.subscriptionPlan.split("_").join(" ")} · {org.billingStatus.split("_").join(" ")}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-semibold text-amber-200">{org.daysLeft}d left</p>
                                                        <p className="text-[11px] text-purple-100/55">
                                                            {new Date(org.trialEndsAt).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {!metrics.organizationHealth.expiringTrials.length && (
                                            <EmptyState title="No trials expiring soon" text="There are no organization trials ending in the next 14 days." compact />
                                        )}
                                    </div>
                                </SectionCard>
                            </div>

                            <div className="grid gap-5 xl:grid-cols-2">
                                <SectionCard>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-white">
                                            Invite Acceptance Funnel
                                        </h2>
                                        <span className="text-xs text-purple-100/55">
                                            {metrics.inviteFunnel.acceptanceRate}% accepted
                                        </span>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                        <MetricCard label="Total" value={metrics.inviteFunnel.total} sub="All invites" compact accent="slate" />
                                        <MetricCard label="Accepted" value={metrics.inviteFunnel.accepted} sub="Joined successfully" compact accent="emerald" />
                                        <MetricCard label="Pending" value={metrics.inviteFunnel.pending} sub="Awaiting response" compact accent="violet" />
                                        <MetricCard label="Expired" value={metrics.inviteFunnel.expired} sub="Past expiry date" compact accent="amber" />
                                        <MetricCard label="Cancelled" value={metrics.inviteFunnel.cancelled} sub="Cancelled invites" compact accent="rose" />
                                    </div>
                                </SectionCard>

                                <SectionCard>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-white">
                                            Admin Access Audit
                                        </h2>
                                        <span className="text-xs text-purple-100/55">
                                            Latest changes
                                        </span>
                                    </div>

                                    <div className="space-y-2.5">
                                        {(metrics.adminAccessAudit || []).map((entry) => (
                                            <div
                                                key={entry.id}
                                                className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.14))] px-4 py-3"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-white">
                                                            {entry.actor.name || entry.actor.email} {entry.action === "GRANT" ? "granted" : "removed"} access
                                                        </p>
                                                        <p className="mt-1 truncate text-[11px] text-purple-100/55">
                                                            Target: {entry.target.name || entry.target.email} ({entry.target.email})
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <p className={`text-xs font-semibold ${entry.action === "GRANT" ? "text-emerald-200" : "text-rose-200"}`}>
                                                            {entry.action}
                                                        </p>
                                                        <p className="mt-1 text-[11px] text-purple-100/55">
                                                            {new Date(entry.createdAt).toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {!metrics.adminAccessAudit.length && (
                                            <EmptyState title="No admin access changes recorded yet" text="Grant and removal activity will appear here once admin permissions are updated." compact />
                                        )}
                                    </div>
                                </SectionCard>
                            </div>
                        </div>
                    </section>
                )}

                {isGrantModalOpen && user?.email === SUPER_ADMIN_EMAIL && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
                        <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-gradient-to-br from-[#372265] via-[#29235d] to-[#171a3f] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="mb-2 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200">
                                        SUPER ADMIN
                                    </div>
                                    <h2 className="text-xl font-semibold text-white">
                                        Admin Access
                                    </h2>
                                    <p className="mt-1 text-sm text-purple-100/60">
                                        Provide access to the platform analytics dashboard.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={resetGrantModal}
                                    className="rounded-full border border-white/10 px-2.5 py-1 text-sm text-purple-100/70 transition hover:bg-white/10 hover:text-white"
                                >
                                    x
                                </button>
                            </div>

                            <div className="mt-5 space-y-3">
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsUserDropdownOpen((current) => !current)}
                                        className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm text-white transition hover:bg-black/35"
                                    >
                                        <span>{selectedUsersLabel}</span>
                                        <span className="text-xs text-purple-100/60">
                                            {isUserDropdownOpen ? "Hide" : "Show"}
                                        </span>
                                    </button>

                                    {isUserDropdownOpen && (
                                        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-2">
                                            {isLoadingAdminUsers && (
                                                <div className="px-3 py-6 text-center text-sm text-purple-100/60">
                                                    Loading users...
                                                </div>
                                            )}

                                            {!isLoadingAdminUsers && !adminUsers.length && (
                                                <div className="px-3 py-6 text-center text-sm text-purple-100/60">
                                                    No users found.
                                                </div>
                                            )}

                                            {!isLoadingAdminUsers && adminUsers.map((adminUser) => (
                                                <label
                                                    key={adminUser.id}
                                                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition ${
                                                        adminUser.locked
                                                            ? "border-white/5 bg-white/[0.03] opacity-60"
                                                            : "border-white/8 bg-white/[0.04] hover:bg-white/[0.07]"
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedUserIds.includes(adminUser.id)}
                                                        disabled={adminUser.locked}
                                                        onChange={() => toggleSelectedUser(adminUser.id)}
                                                        className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-emerald-500 focus:ring-emerald-500"
                                                    />

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="truncate text-sm font-medium text-white">
                                                                {adminUser.name || adminUser.username || adminUser.email}
                                                            </span>
                                                            {adminUser.platformAdmin && (
                                                                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                                                                    Admin
                                                                </span>
                                                            )}
                                                            {adminUser.locked && (
                                                                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-100">
                                                                    Super Admin
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 truncate text-xs text-purple-100/55">
                                                            {adminUser.email}
                                                        </p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={resetGrantModal}
                                        className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleAccessUpdate(false)}
                                        disabled={isGranting || !selectedUserIds.length}
                                        className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-700/60 disabled:text-white/60"
                                    >
                                        {isGranting ? "Updating..." : "Remove Access"}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleAccessUpdate(true)}
                                        disabled={isGranting || !selectedUserIds.length}
                                        className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-700/60 disabled:text-white/60"
                                    >
                                        {isGranting ? "Updating..." : "Grant Access"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {isFilterModalOpen && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-3 sm:p-4 backdrop-blur-md">
                        <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.13),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(34,211,238,0.08),_transparent_18%),linear-gradient(135deg,#34215f_0%,#241f56_48%,#171a3f_100%)] p-4 sm:max-h-[90vh] sm:rounded-[34px] sm:p-5 lg:max-w-3xl lg:p-6 shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="mb-2 inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] sm:text-[11px] text-amber-200">
                                        DASHBOARD FILTERS
                                    </div>
                                    <h2 className="text-xl font-semibold text-white sm:text-2xl">
                                        Filter Admin Dashboard
                                    </h2>
                                    <p className="mt-1 max-w-2xl text-sm text-purple-100/60">
                                        Apply filters across metrics, activity, organizations, videos, invites, and audit history.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsFilterModalOpen(false)}
                                    className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-purple-100/70 transition hover:bg-white/10 hover:text-white"
                                >
                                    x
                                </button>
                            </div>

                            <div className="mt-4 space-y-4 overflow-y-auto pr-1 pb-3 sm:mt-5 sm:space-y-5 sm:pb-4">
                                <div className="rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[30px] sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                    <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <h3 className="text-base font-semibold text-white">Date Range</h3>
                                            <p className="mt-1 text-sm text-purple-100/55">
                                                Use quick presets or choose a custom range for the entire dashboard.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                { value: "LAST_7_DAYS", label: "Last 7 Days" },
                                                { value: "LAST_30_DAYS", label: "Last 30 Days" },
                                                { value: "LAST_90_DAYS", label: "Last 90 Days" },
                                                { value: "CUSTOM", label: "Custom" }
                                            ].map((preset) => (
                                                <button
                                                    key={preset.value}
                                                    type="button"
                                                    onClick={() => applyDatePreset(preset.value as DatePreset)}
                                                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                                        datePreset === preset.value
                                                            ? "bg-amber-400 text-slate-950 shadow-[0_10px_24px_rgba(251,191,36,0.25)]"
                                                            : "border border-white/10 bg-white/5 text-purple-100/80 hover:bg-white/10"
                                                    }`}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                                        <label className="space-y-2">
                                            <span className="text-sm font-medium text-white">Start date</span>
                                            <input
                                                type="date"
                                                value={draftFilters.startDate}
                                                onChange={(e) => {
                                                    setDatePreset("CUSTOM")
                                                    setDraftFilters((current) => ({ ...current, startDate: e.target.value }))
                                                }}
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            />
                                        </label>

                                        <label className="space-y-2">
                                            <span className="text-sm font-medium text-white">End date</span>
                                            <input
                                                type="date"
                                                value={draftFilters.endDate}
                                                onChange={(e) => {
                                                    setDatePreset("CUSTOM")
                                                    setDraftFilters((current) => ({ ...current, endDate: e.target.value }))
                                                }}
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-white">Organization Filters</h3>
                                        <p className="mt-1 text-sm text-purple-100/55">
                                            Narrow the dashboard to the organizations and plans you want to review.
                                        </p>
                                    </div>

                                    <div className="grid gap-3 lg:grid-cols-2 sm:gap-4">
                                        <label className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <div className="space-y-1">
                                                <span className="block text-sm sm:text-base font-semibold text-white">Organization billing status</span>
                                                <span className="block text-sm leading-6 text-purple-100/55">
                                                    Focus on trial, active, or expired organizations.
                                                </span>
                                            </div>
                                            <select
                                                value={draftFilters.billingStatus}
                                                onChange={(e) => setDraftFilters((current) => ({ ...current, billingStatus: e.target.value }))}
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            >
                                                <option value="">All billing statuses</option>
                                                {BILLING_STATUS_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>
                                                        {formatEnumLabel(option)}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <div className="space-y-1">
                                                <span className="block text-sm sm:text-base font-semibold text-white">Organization subscription plan</span>
                                                <span className="block text-sm leading-6 text-purple-100/55">
                                                    Narrow down metrics by plan mix and conversion stage.
                                                </span>
                                            </div>
                                            <select
                                                value={draftFilters.subscriptionPlan}
                                                onChange={(e) => setDraftFilters((current) => ({ ...current, subscriptionPlan: e.target.value }))}
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            >
                                                <option value="">All subscription plans</option>
                                                {SUBSCRIPTION_PLAN_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>
                                                        {formatEnumLabel(option)}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-white">Content Scope</h3>
                                        <p className="mt-1 text-sm text-purple-100/55">
                                            Focus the analytics on a specific organization, visibility mode, or user segment.
                                        </p>
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 sm:gap-4">
                                        <label className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <div className="space-y-1">
                                                <span className="block text-sm sm:text-base font-semibold text-white">Organization selector</span>
                                                <span className="block text-sm leading-6 text-purple-100/55">
                                                    Filter the dashboard to a single organization.
                                                </span>
                                            </div>
                                            <select
                                                value={draftFilters.organizationId}
                                                onChange={(e) => setDraftFilters((current) => ({ ...current, organizationId: e.target.value }))}
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            >
                                                <option value="">{isLoadingFilterOptions ? "Loading organizations..." : "All organizations"}</option>
                                                {filterOrganizations.map((organization) => (
                                                    <option key={organization.id} value={organization.id}>
                                                        {organization.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <div className="space-y-1">
                                                <span className="block text-sm sm:text-base font-semibold text-white">Video visibility</span>
                                                <span className="block text-sm leading-6 text-purple-100/55">
                                                    Limit content metrics to public, private, or organization videos.
                                                </span>
                                            </div>
                                            <select
                                                value={draftFilters.visibility}
                                                onChange={(e) => setDraftFilters((current) => ({ ...current, visibility: e.target.value }))}
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            >
                                                <option value="">All visibility types</option>
                                                {VISIBILITY_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>
                                                        {formatEnumLabel(option)}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <div className="space-y-1">
                                                <span className="block text-sm sm:text-base font-semibold text-white">User activity segment</span>
                                                <span className="block text-sm leading-6 text-purple-100/55">
                                                    Focus user-driven metrics on new or returning users.
                                                </span>
                                            </div>
                                            <select
                                                value={draftFilters.userActivityType}
                                                onChange={(e) => setDraftFilters((current) => ({ ...current, userActivityType: e.target.value }))}
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            >
                                                <option value="">All user segments</option>
                                                {USER_ACTIVITY_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-white">Events & Thresholds</h3>
                                        <p className="mt-1 text-sm text-purple-100/55">
                                            Filter invites, admin actions, and performance thresholds for the data shown below.
                                        </p>
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 sm:gap-4">
                                        <label className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <div className="space-y-1">
                                                <span className="block text-sm sm:text-base font-semibold text-white">Invite status</span>
                                                <span className="block text-sm leading-6 text-purple-100/55">
                                                    Narrow invite analytics to active, accepted, cancelled, or expired.
                                                </span>
                                            </div>
                                            <select
                                                value={draftFilters.inviteStatus}
                                                onChange={(e) => setDraftFilters((current) => ({ ...current, inviteStatus: e.target.value }))}
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            >
                                                <option value="">All invite statuses</option>
                                                {INVITE_STATUS_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>
                                                        {formatEnumLabel(option)}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <div className="space-y-1">
                                                <span className="block text-sm sm:text-base font-semibold text-white">Admin action</span>
                                                <span className="block text-sm leading-6 text-purple-100/55">
                                                    Filter the audit log to grants or removals.
                                                </span>
                                            </div>
                                            <select
                                                value={draftFilters.adminAction}
                                                onChange={(e) => setDraftFilters((current) => ({ ...current, adminAction: e.target.value }))}
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            >
                                                <option value="">All admin actions</option>
                                                {ADMIN_ACTION_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>
                                                        {formatEnumLabel(option)}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <div className="space-y-1">
                                                <span className="block text-sm sm:text-base font-semibold text-white">Minimum views</span>
                                                <span className="block text-sm leading-6 text-purple-100/55">
                                                    Filter top videos and organizations by view threshold.
                                                </span>
                                            </div>
                                            <input
                                                type="number"
                                                min="0"
                                                value={draftFilters.minViews}
                                                onChange={(e) => setDraftFilters((current) => ({ ...current, minViews: e.target.value }))}
                                                placeholder="0"
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white placeholder:text-purple-100/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            />
                                        </label>

                                        <label className="space-y-3 rounded-[24px] border border-white/10 bg-black/18 p-4 sm:rounded-[28px] sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                            <div className="space-y-1">
                                                <span className="block text-sm sm:text-base font-semibold text-white">Minimum shares</span>
                                                <span className="block text-sm leading-6 text-purple-100/55">
                                                    Filter top videos and organizations by share threshold.
                                                </span>
                                            </div>
                                            <input
                                                type="number"
                                                min="0"
                                                value={draftFilters.minShares}
                                                onChange={(e) => setDraftFilters((current) => ({ ...current, minShares: e.target.value }))}
                                                placeholder="0"
                                                className="w-full rounded-2xl border border-white/10 bg-[#191438] px-4 py-2.5 text-sm text-white placeholder:text-purple-100/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="sticky bottom-0 mt-4 grid grid-cols-2 gap-3 border-t border-white/8 bg-[linear-gradient(180deg,rgba(41,35,93,0.78),rgba(28,25,69,0.96))] pt-4 backdrop-blur-md sm:mt-5 sm:pt-5">
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                                >
                                    Reset Filters
                                </button>

                                <button
                                    type="button"
                                    onClick={applyFilters}
                                    className="min-w-0 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_14px_28px_rgba(251,191,36,0.22)] transition hover:bg-amber-400"
                                >
                                    Apply Filters
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    )
}

const accentMap = {
    cyan: "border-cyan-300/25 shadow-[0_0_0_1px_rgba(103,232,249,0.08),0_18px_34px_rgba(34,211,238,0.12)]",
    violet: "border-violet-300/20 shadow-[0_0_0_1px_rgba(196,181,253,0.07),0_18px_34px_rgba(139,92,246,0.12)]",
    slate: "border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_18px_30px_rgba(10,10,30,0.16)]",
    pink: "border-pink-300/20 shadow-[0_0_0_1px_rgba(244,114,182,0.08),0_18px_34px_rgba(236,72,153,0.14)]",
    blue: "border-blue-300/20 shadow-[0_0_0_1px_rgba(96,165,250,0.08),0_18px_34px_rgba(59,130,246,0.14)]",
    indigo: "border-indigo-300/20 shadow-[0_0_0_1px_rgba(129,140,248,0.08),0_18px_34px_rgba(99,102,241,0.14)]",
    fuchsia: "border-fuchsia-300/20 shadow-[0_0_0_1px_rgba(232,121,249,0.08),0_18px_34px_rgba(217,70,239,0.14)]",
    amber: "border-amber-300/20 shadow-[0_0_0_1px_rgba(252,211,77,0.08),0_18px_34px_rgba(245,158,11,0.14)]",
    emerald: "border-emerald-300/20 shadow-[0_0_0_1px_rgba(110,231,183,0.08),0_18px_34px_rgba(16,185,129,0.14)]",
    rose: "border-rose-300/20 shadow-[0_0_0_1px_rgba(253,164,175,0.08),0_18px_34px_rgba(244,63,94,0.14)]"
} as const

const SectionCard = ({ children }: { children: ReactNode }) => (
    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_44px_rgba(8,10,32,0.18)] backdrop-blur-xl sm:p-5">
        {children}
    </div>
)

const EmptyState = ({
    icon,
    title,
    text,
    compact = false,
    minHeight = "min-h-[128px]"
}: {
    icon?: string
    title: string
    text: string
    compact?: boolean
    minHeight?: string
}) => (
    <div className={`flex ${minHeight} flex-col items-center justify-center rounded-[22px] border border-white/8 bg-black/14 px-5 text-center`}>
        {icon ? <div className={`${compact ? "text-3xl" : "text-4xl"} opacity-80`}>{icon}</div> : null}
        <h3 className={`${icon ? "mt-3" : ""} text-sm font-semibold text-white`}>{title}</h3>
        <p className="mt-1 max-w-sm text-xs text-purple-100/50">
            {text}
        </p>
    </div>
)

const MetricCard = ({
    label,
    value,
    icon,
    sub,
    accent = "slate",
    compact = false
}: {
    label: string
    value: number | string
    icon?: string
    sub?: string
    accent?: keyof typeof accentMap
    compact?: boolean
}) => (
    <div className={`group rounded-[24px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.12))] ${compact ? "p-3" : "p-3.5"} transition hover:border-white/20 hover:bg-white/10 ${accentMap[accent]}`}>
        <div className="flex items-center justify-between">
            <p className="text-xs text-purple-100/60">{label}</p>
            {icon ? <span className="text-sm opacity-80 transition group-hover:scale-110">{icon}</span> : null}
        </div>

        <p className={`mt-1 font-bold tracking-tight text-white ${compact ? "text-base sm:text-lg" : "text-lg sm:text-[1.75rem]"}`}>
            {value}
        </p>

        {sub ? (
            <p className="mt-0.5 text-[11px] leading-5 text-purple-100/46">
                {sub}
            </p>
        ) : null}
    </div>
)

const DualMetricCard = ({
    label,
    leftIcon,
    leftLabel,
    leftValue,
    rightIcon,
    rightLabel,
    rightValue,
    accent = "pink"
}: {
    label: string
    leftIcon: string
    leftLabel: string
    leftValue: number | string
    rightIcon: string
    rightLabel: string
    rightValue: number | string
    accent?: keyof typeof accentMap
}) => (
    <div className={`rounded-[24px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.12))] p-3.5 ${accentMap[accent]}`}>
        <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-purple-100/60">{label}</p>
            <div className="flex items-center gap-2 text-sm opacity-80">
                <span>{leftIcon}</span>
                <span>{rightIcon}</span>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[18px] border border-white/8 bg-black/16 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-purple-100/45">{leftLabel}</p>
                    <p className="text-lg font-bold text-white">{leftValue}</p>
                </div>
            </div>

            <div className="rounded-[18px] border border-white/8 bg-black/16 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-purple-100/45">{rightLabel}</p>
                    <p className="text-lg font-bold text-white">{rightValue}</p>
                </div>
            </div>
        </div>
    </div>
)

export default AdminDashboard
