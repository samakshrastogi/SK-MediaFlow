
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import AppLayout from "@/layouts/AppLayout"
import { api } from "@/api/axios"

interface Organization {
    id: string
    name: string
}

type MembershipStatus = "APPROVED" | "PENDING"
type MembershipRole = "ADMIN" | "MEMBER"

interface Membership {
    id: string
    organization: Organization
    role: MembershipRole
    status: MembershipStatus
}

interface ApiError {
    response?: {
        data?: {
            message?: string
        }
        status?: number
    }
    message?: string
}

const OrganizationPage = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [memberships, setMemberships] = useState<Membership[]>([])
    const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null)
    const [name, setName] = useState("")
    const [slug, setSlug] = useState("")
    const [description, setDescription] = useState("")
    const [joinInput, setJoinInput] = useState("")
    const [message, setMessage] = useState("")
    const [linkInfo, setLinkInfo] = useState<{ name: string; linkType: "PUBLIC" | "PRIVATE" } | null>(null)
    const [linkJoining, setLinkJoining] = useState(false)
    const [plan, setPlan] = useState("TRIAL_FREE")
    const handledInviteToken = useRef<string | null>(null)

    const rawOrgToken = searchParams.get("orgToken") || searchParams.get("org")
    const orgToken =
        rawOrgToken && rawOrgToken !== "null" && rawOrgToken !== "undefined"
            ? rawOrgToken
            : null
    const inviteToken = searchParams.get("token")

    const approvedMemberships = useMemo(
        () => memberships.filter((m) => m.status === "APPROVED"),
        [memberships]
    )
    const pendingMemberships = useMemo(
        () => memberships.filter((m) => m.status === "PENDING"),
        [memberships]
    )

    const load = async () => {
        const res = await api.get("/organization/my")
        setMemberships(res.data?.data?.memberships || [])
        setActiveOrganizationId(res.data?.data?.access?.activeOrganizationId ?? null)
    }

    useEffect(() => {
        load().catch(() => {
            setMessage("Failed to load organization data.")
        })
    }, [])

    useEffect(() => {
        if (!orgToken) {
            setLinkInfo(null)
            return
        }

        api.get(`/organization/link/${encodeURIComponent(orgToken)}`)
            .then((res) => {
                setLinkInfo({
                    name: res.data?.data?.name || "Organization",
                    linkType: res.data?.data?.linkType === "PRIVATE" ? "PRIVATE" : "PUBLIC"
                })
            })
            .catch((err: ApiError) => {
                setLinkInfo(null)
                setMessage(err?.response?.data?.message || "Invalid organization link.")
            })
    }, [orgToken])

    useEffect(() => {
        if (!inviteToken) return
        if (handledInviteToken.current === inviteToken) return
        handledInviteToken.current = inviteToken

        api.post("/organization/join-by-token", { token: inviteToken })
            .then((res) => {
                setMessage(res.data?.message || "Joined organization via invite.")
                load().catch(() => undefined)
            })
            .catch((err: ApiError) => {
                setMessage(err?.response?.data?.message || "Failed to join via invite link.")
            })
    }, [inviteToken])

    const handleJoinByLink = async () => {
        if (!orgToken) return
        try {
            setLinkJoining(true)
            const res = await api.post("/organization/join-by-link", { token: orgToken })
            setMessage(res.data?.message || "Request sent. Please wait for admin approval.")
            await load()
        } catch (err) {
            const apiErr = err as ApiError
            setMessage(apiErr?.response?.data?.message || "Failed to join organization via shared link.")
        } finally {
            setLinkJoining(false)
        }
    }

    const createOrganization = async () => {
        if (!name.trim()) return
        await api.post("/organization", {
            name: name.trim(),
            slug: slug.trim() || undefined,
            description: description.trim() || undefined,
            plan
        })
        setName("")
        setSlug("")
        setDescription("")
        await load()
        setMessage("Organization created.")
    }

    const requestJoin = async () => {
        if (!joinInput.trim()) return
        try {
            let res
            try {
                res = await api.post("/organization/join-request", {
                    organization: joinInput.trim()
                })
            } catch (inner) {
                const innerErr = inner as ApiError
                if (innerErr?.response?.status === 404) {
                    try {
                        await api.get("/organization/ping")
                    } catch (pingErr) {
                        const pingError = pingErr as ApiError
                        if (pingError?.response?.status === 404) {
                            throw new Error("Organization routes not loaded. Restart backend server.")
                        }
                    }
                    res = await api.post("/organization/join", {
                        organization: joinInput.trim()
                    })
                } else {
                    throw inner
                }
            }
            setJoinInput("")
            setMessage(res.data?.message || "Request sent. Please wait for admin approval.")
            await load()
        } catch (err) {
            const apiErr = err as ApiError
            const fallback =
                apiErr?.response?.status === 404
                    ? "Organization join endpoint not found. Please restart the backend server."
                    : "Failed to send join request."
            setMessage(apiErr?.message || apiErr?.response?.data?.message || fallback)
        }
    }

    const switchMode = async (organizationId: string | null) => {
        await api.post("/organization/mode", { organizationId })
        await load()
        setMessage(organizationId ? "Organization mode enabled." : "Organization mode disabled.")
    }

    return (
        <AppLayout>
            <div className="w-full px-2 sm:px-4">
                <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(16,24,44,0.94),rgba(10,15,30,0.98))] shadow-[0_28px_80px_rgba(0,0,0,0.3)] backdrop-blur-2xl">
                    <div className="border-b border-white/10 px-6 py-6 sm:px-8">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                                Organization
                            </h1>
                            <p className="mt-2 text-sm text-slate-300/72 sm:text-base">
                                Create, join, and manage your organization access from one connected workspace.
                            </p>
                        </div>

                        {message && (
                            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                                {message}
                            </div>
                        )}
                    </div>

                    <div className="grid gap-0 xl:grid-cols-[320px_minmax(0,1fr)]">
                        <aside className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-5 py-6 xl:border-b-0 xl:border-r xl:border-white/10 sm:px-6">
                            <div className="space-y-5 xl:sticky xl:top-24">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-semibold text-white">My Organizations</h2>
                                        <p className="mt-1 text-xs text-slate-400">
                                            Switch org mode and open your workspaces.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {approvedMemberships.map((m) => {
                                        const isActive = activeOrganizationId === m.organization?.id

                                        return (
                                            <div
                                                key={m.id}
                                                className={`rounded-2xl border p-4 transition ${
                                                    isActive
                                                        ? "border-cyan-300/20 bg-cyan-400/10"
                                                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                                                }`}
                                            >
                                                <div className="space-y-3">
                                                    <div>
                                                        <p className="text-sm font-medium text-white">
                                                            {m.organization?.name}
                                                        </p>
                                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                                                            <span className={`rounded-full px-2 py-0.5 font-medium ${
                                                                m.role === "ADMIN"
                                                                    ? "bg-cyan-400/12 text-cyan-100"
                                                                    : "bg-white/10 text-slate-300/78"
                                                            }`}>
                                                                {m.role}
                                                            </span>
                                                            {isActive && (
                                                                <span className="rounded-full bg-cyan-400/16 px-2 py-0.5 font-medium text-cyan-100">
                                                                    ACTIVE
                                                                </span>
                                                            )}
                                                            <span className={`rounded-full px-2 py-0.5 font-medium ${
                                                                isActive
                                                                    ? "bg-cyan-400/12 text-cyan-100"
                                                                    : "bg-white/10 text-slate-300/78"
                                                            }`}>
                                                                Status: {isActive ? "Active" : "Disabled"}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            onClick={() =>
                                                                switchMode(isActive ? null : m.organization.id)
                                                            }
                                                            className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                                                                isActive
                                                                    ? "border border-white/10 bg-white/8 text-white hover:bg-white/14"
                                                                    : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                                                            }`}
                                                        >
                                                            {isActive ? "Disable" : "Enable"}
                                                        </button>

                                                        <button
                                                            onClick={async () => {
                                                                await switchMode(m.organization.id)
                                                                navigate("/home")
                                                            }}
                                                            className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/16"
                                                        >
                                                            Open
                                                        </button>

                                                        {m.role === "ADMIN" && (
                                                            <button
                                                                onClick={async () => {
                                                                    await switchMode(m.organization.id)
                                                                    navigate("/organization/dashboard")
                                                                }}
                                                                className="rounded-xl bg-amber-500/18 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-500/24"
                                                            >
                                                                Dashboard
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {pendingMemberships.map((m) => (
                                        <div
                                            key={m.id}
                                            className="rounded-2xl border border-amber-500/18 bg-amber-500/8 p-4"
                                        >
                                            <p className="text-sm font-medium text-white">{m.organization?.name}</p>
                                            <p className="mt-2 inline-flex rounded-full bg-amber-500/14 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                                                Waiting for Approval
                                            </p>
                                        </div>
                                    ))}

                                    {memberships.length === 0 && (
                                        <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-6 text-center text-sm text-purple-100/55">
                                            No organization memberships yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </aside>

                        <main className="space-y-8 px-6 py-6 sm:px-8">
                            {orgToken && linkInfo && (
                                        <div className="rounded-3xl border border-cyan-400/18 bg-cyan-400/8 p-5 sm:p-6">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                        <div>
                                            <h2 className="text-lg font-semibold text-white">
                                                Join Organization
                                            </h2>
                                            <p className="mt-1 text-sm text-slate-300/72">
                                                You’ve been invited to <span className="font-semibold text-white">{linkInfo.name}</span>.
                                            </p>
                                            <p className="mt-2 text-xs">
                                                {linkInfo.linkType === "PUBLIC" ? (
                                                    <span className="text-cyan-200">Public Access • Instant Join</span>
                                                ) : (
                                                    <span className="text-amber-300">Private Access • Requires Approval</span>
                                                )}
                                            </p>
                                        </div>

                                        <button
                                            onClick={handleJoinByLink}
                                            disabled={linkJoining}
                                            className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {linkJoining ? "Sending Request..." : "Join Organization"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
                                <div className="border-b border-white/10 px-5 py-5 sm:px-6">
                                    <h2 className="text-xl font-semibold text-white">Workspace Setup</h2>
                                    <p className="mt-1 text-sm text-slate-400">
                                        Create a new organization or request access to an existing one.
                                    </p>
                                </div>

                                <div className="grid gap-0 lg:grid-cols-2">
                                    <section className="space-y-5 border-b border-white/10 px-5 py-5 sm:px-6 lg:border-b-0 lg:border-r">
                                        <div>
                                            <h3 className="text-lg font-semibold text-white">Create Organization</h3>
                                            <p className="mt-1 text-xs text-slate-400">
                                                Set up a new organization to manage users and content.
                                            </p>
                                        </div>

                                        <div className="space-y-3">
                                            <input
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="Organization name"
                                                className="w-full rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                            />

                                            <input
                                                value={slug}
                                                onChange={(e) => setSlug(e.target.value)}
                                                placeholder="Slug (optional)"
                                                className="w-full rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                            />

                                            <textarea
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="Description (optional)"
                                                rows={4}
                                                className="w-full rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                            />

                                            <select
                                                value={plan}
                                                aria-label="select subscription plan"
                                                onChange={(e) => setPlan(e.target.value)}
                                                className="w-full rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                            >
                                                <option value="TRIAL_FREE">3 month free trial</option>
                                                <option value="SIX_MONTH">6 month subscription (Rs 18000)</option>
                                                <option value="YEARLY_INITIAL">Yearly initial (Rs 10000 one-time)</option>
                                                <option value="YEARLY_RENEWAL">Yearly renewal (Rs 24000 annually)</option>
                                            </select>
                                        </div>

                                        <button
                                            onClick={createOrganization}
                                            className="w-full rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
                                        >
                                            Create Organization
                                        </button>
                                    </section>

                                    <section className="space-y-5 px-5 py-5 sm:px-6">
                                        <div>
                                            <h3 className="text-lg font-semibold text-white">Join Organization</h3>
                                            <p className="mt-1 text-xs text-slate-400">
                                                Enter an organization slug, ID, or public/private join link.
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-cyan-400/14 bg-cyan-400/8 p-4">
                                            <div className="space-y-3">
                                                <input
                                                    value={joinInput}
                                                    onChange={(e) => setJoinInput(e.target.value)}
                                                    placeholder="Organization slug, ID, or join link"
                                                    className="w-full rounded-xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                                                />

                                                <button
                                                    onClick={requestJoin}
                                                    className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/16"
                                                >
                                                    Request Join
                                                </button>
                                            </div>

                                            <p className="mt-3 text-xs text-slate-400">
                                                Public links join instantly. Private links stay pending until an admin approves them.
                                            </p>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </main>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

export default OrganizationPage
