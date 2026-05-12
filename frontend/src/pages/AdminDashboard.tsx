import { useEffect, useMemo, useState } from "react"
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
    dailyLogins: { day: string; count: number }[]
    topOrganizations: { id: string; name: string; shares: number; likes: number; views: number }[]
    subscriptionCounts: { plan: string; count: number }[]
}

const AdminDashboard = () => {
    const { user } = useAuth()
    const [metrics, setMetrics] = useState<Metrics | null>(null)
    const [message, setMessage] = useState("")
    const [grantEmail, setGrantEmail] = useState("")

    const canAccess = user?.email === SUPER_ADMIN_EMAIL || user?.platformAdmin

    const loadMetrics = async () => {
        const res = await api.get("/admin/metrics")
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

    const handleGrant = async () => {
        if (!grantEmail.trim()) return
        try {
            await api.post("/admin/grant", { email: grantEmail.trim().toLowerCase() })
            setGrantEmail("")
            setMessage("Access granted.")
        } catch {
            setMessage("Failed to grant access.")
        }
    }

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
                    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#6e37ab]/45 via-[#473795]/44 to-[#20214e]/62 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-1.5">
                                    <div>
                                        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                                            Platform Admin Dashboard
                                        </h1>
                                        <p className="mt-1.5 text-sm text-purple-100/65">
                                            Platform-wide analytics, access control, and health signals in one connected workspace.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 text-xs text-purple-100/70">
                                        <span>
                                            Last updated:{" "}
                                            {new Date().toLocaleTimeString([], {
                                                hour: "numeric",
                                                minute: "2-digit"
                                            })}
                                        </span>
                                    </div>
                                </div>

                                <span className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
                                    System Active
                                </span>
                            </div>

                            {message && (
                                <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
                                    {message}
                                </div>
                            )}
                        </div>

                        <div className="space-y-5 px-5 py-5 sm:px-6">
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                <MetricCard label="Users" value={metrics.cards.uniqueUsers} icon="👥" sub="Total users" />
                                <MetricCard label="Logins" value={metrics.cards.totalLogins} icon="🔐" sub="All time logins" />
                                <MetricCard label="Session" value={avgSessionText} icon="⏱️" sub="Avg session time" />
                                <DualMetricCard
                                    label="Reactions"
                                    leftIcon="👍"
                                    leftLabel="Likes"
                                    leftValue={metrics.cards.likes}
                                    rightIcon="👎"
                                    rightLabel="Dislikes"
                                    rightValue={metrics.cards.dislikes}
                                />
                                <MetricCard label="Shares" value={metrics.cards.shares} icon="📤" sub="Total shares" />
                            </div>

                            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                                <div className="rounded-3xl border border-white/8 bg-white/6 p-4 sm:p-5">
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-white">
                                            Daily Login Activity
                                        </h2>
                                        <span className="text-xs text-purple-100/55">
                                            Last {metrics.dailyLogins.length} days
                                        </span>
                                    </div>

                                    {metrics.dailyLogins.length > 0 ? (
                                        <div className="rounded-2xl border border-white/6 bg-black/14 p-4">
                                            <div className="flex min-h-[168px] items-end justify-start gap-3 overflow-x-auto pb-1">
                                            {metrics.dailyLogins.map((row) => {
                                                const height = chartMax
                                                    ? Math.max(18, Math.round((row.count / chartMax) * 110))
                                                    : 18

                                                return (
                                                    <div
                                                        key={row.day}
                                                        className="group relative flex w-12 shrink-0 flex-col items-center gap-2"
                                                    >
                                                        <div className="absolute -top-7 rounded-lg border border-white/10 bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                                                            {row.count}
                                                        </div>
                                                        <div
                                                            className="w-full rounded-xl bg-gradient-to-t from-blue-600 via-sky-500 to-cyan-300 transition-all duration-300 group-hover:from-blue-500 group-hover:to-cyan-200"
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
                                        <div className="flex min-h-[168px] flex-col items-center justify-center rounded-2xl border border-white/6 bg-black/14 text-center">
                                            <div className="text-4xl opacity-80">📊</div>
                                            <h3 className="mt-3 text-sm font-semibold text-white">
                                                No login activity yet
                                            </h3>
                                            <p className="mt-1 max-w-xs text-xs text-purple-100/50">
                                                Once users start logging in, activity will appear here.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-5">
                                    {user?.email === SUPER_ADMIN_EMAIL && (
                                        <div className="rounded-3xl border border-white/8 bg-white/6 p-4 sm:p-5">
                                            <div className="mb-3">
                                                <div className="mb-2 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200">
                                                    SUPER ADMIN
                                                </div>
                                                <h2 className="text-lg font-semibold text-white">
                                                    Grant Admin Access
                                                </h2>
                                                <p className="mt-1 text-xs text-purple-100/60">
                                                    Provide access to the platform analytics dashboard.
                                                </p>
                                            </div>

                                            <div className="rounded-2xl border border-white/6 bg-black/14 p-3">
                                                <div className="flex flex-col gap-2">
                                                    <input
                                                        value={grantEmail}
                                                        onChange={(e) => setGrantEmail(e.target.value)}
                                                        placeholder="Enter user email..."
                                                        className="flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white placeholder:text-purple-100/35 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                                    />

                                                    <button
                                                        onClick={handleGrant}
                                                        className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-500"
                                                    >
                                                        Grant Access
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="rounded-3xl border border-white/8 bg-white/6 p-4 sm:p-5">
                                        <h2 className="mb-3 text-lg font-semibold text-white">
                                            Subscriptions
                                        </h2>

                                        <div className="space-y-2.5">
                                            {(metrics.subscriptionCounts || []).map((row) => (
                                                <div
                                                    key={row.plan}
                                                    className="flex items-center justify-between rounded-2xl border border-white/6 bg-black/14 px-4 py-3 transition hover:bg-white/8"
                                                >
                                                    <span className="text-sm text-white">{row.plan}</span>
                                                    <span className="text-sm font-semibold text-purple-100/80">{row.count}</span>
                                                </div>
                                            ))}

                                            {!metrics.subscriptionCounts.length && (
                                                <p className="py-6 text-center text-sm text-purple-100/55">
                                                    No subscription data available
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-white/8 bg-white/6 p-4 sm:p-5">
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
                                                className="rounded-2xl border border-white/6 bg-black/14 p-3.5 transition hover:bg-white/8"
                                            >
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="flex items-center gap-2">
                                                        <span className="w-5 text-xs text-purple-100/45">#{idx + 1}</span>
                                                        <span className="font-medium text-white">{org.name}</span>
                                                    </span>
                                                    <span className="text-xs text-purple-100/65">{org.views} views</span>
                                                </div>
                                                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
                                                </div>
                                                <div className="mt-2 flex gap-3 text-[11px] text-purple-100/55">
                                                    <span>👍 {org.likes}</span>
                                                    <span>📤 {org.shares}</span>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {!metrics.topOrganizations.length && (
                                        <p className="py-6 text-center text-sm text-purple-100/55">
                                            No organization data available
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </AppLayout>
    )
}

const MetricCard = ({
    label,
    value,
    icon,
    sub
}: {
    label: string
    value: number | string
    icon?: string
    sub?: string
}) => (
    <div className="group rounded-3xl border border-white/8 bg-white/6 p-3 shadow-sm transition hover:border-white/16 hover:bg-white/8">
        <div className="flex items-center justify-between">
            <p className="text-xs text-purple-100/55">{label}</p>
            {icon ? <span className="text-sm opacity-80 transition group-hover:scale-110">{icon}</span> : null}
        </div>

        <p className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">
            {value}
        </p>

        {sub ? (
            <p className="mt-0.5 text-[11px] text-purple-100/45">
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
    rightValue
}: {
    label: string
    leftIcon: string
    leftLabel: string
    leftValue: number | string
    rightIcon: string
    rightLabel: string
    rightValue: number | string
}) => (
    <div className="rounded-3xl border border-white/8 bg-white/6 p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-purple-100/55">{label}</p>
            <div className="flex items-center gap-2 text-sm opacity-80">
                <span>{leftIcon}</span>
                <span>{rightIcon}</span>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-white/6 bg-black/14 px-3 py-2.5">
                <p className="text-[11px] text-purple-100/45">{leftLabel}</p>
                <p className="mt-0.5 text-lg font-bold text-white">{leftValue}</p>
            </div>

            <div className="rounded-2xl border border-white/6 bg-black/14 px-3 py-2.5">
                <p className="text-[11px] text-purple-100/45">{rightLabel}</p>
                <p className="mt-0.5 text-lg font-bold text-white">{rightValue}</p>
            </div>
        </div>
    </div>
)

export default AdminDashboard
