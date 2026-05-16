import { useEffect, useMemo, useState } from "react"
import { Info, X } from "lucide-react"
import AppLayout from "@/layouts/AppLayout"
import { api } from "@/api/axios"

interface Membership {
    id: string
    role: "ADMIN" | "MEMBER"
    status: "PENDING" | "APPROVED" | "REJECTED" | "LEFT"
    requestedAt?: string
    approvedAt?: string
    user: {
        id: string
        name?: string
        email: string
        username?: string
        avatarKey?: string
        createdAt?: string
        isVerified?: boolean
        provider?: string
        channel?: {
            id: string
            name: string
            username: string
            description?: string
            createdAt?: string
            _count?: {
                videos: number
                subscribers: number
            }
        }
    }
}

interface Video {
    publicId: string
    title: string
    shares: number
    likes: number
    views: number
}

interface Activity {
    views?: Array<{
        id: string
        createdAt?: string
        user?: { name?: string; email: string }
        video?: { title: string }
    }>
    likes?: Array<{
        id: string
        createdAt?: string
        user?: { name?: string; email: string }
        video?: { title: string }
    }>
    dislikes?: Array<{
        id: string
        createdAt?: string
        user?: { name?: string; email: string }
        video?: { title: string }
    }>
    shares?: Array<{
        id: string
        createdAt?: string
        user?: { name?: string; email: string }
        video?: { title: string }
    }>
    watchHistory?: Array<{
        id: string
        user?: { name?: string; email: string }
        video?: { title: string }
        watchedSeconds: number
        lastPositionSeconds: number
    }>
}

interface ChartSeries {
    label: string
    values: number[]
}

interface Totals {
    [key: string]: string | number
}

interface AllowedUploaderRow {
    userId: string
}

const OrganizationDashboard = () => {
    const [search, setSearch] = useState("")
    const [orgId, setOrgId] = useState<string | null>(null)
    const [ownerId, setOwnerId] = useState<string | null>(null)
    const [orgName, setOrgName] = useState("")
    const [restrictToOrgContent, setRestrictToOrgContent] = useState(false)
    const [restrictContentForAdmins, setRestrictContentForAdmins] = useState(true)
    const [allowedDomain, setAllowedDomain] = useState("")
    const [uploadPolicy, setUploadPolicy] = useState("ADMINS_ONLY")
    const [allowedUploaderQuery, setAllowedUploaderQuery] = useState("")
    const [allowedUploaderUserIds, setAllowedUploaderUserIds] = useState<string[]>([])
    const [inviteEmail, setInviteEmail] = useState("")
    const [memberships, setMemberships] = useState<Membership[]>([])
    const [topVideos, setTopVideos] = useState<Video[]>([])
    const [activity, setActivity] = useState<Activity | null>(null)
    const [totals, setTotals] = useState<Totals | null>(null)
    const [message, setMessage] = useState("")
    const [promoteEmail, setPromoteEmail] = useState("")
    const [latestInviteLink, setLatestInviteLink] = useState("")
    const [organizationPublicLink, setOrganizationPublicLink] = useState("")
    const [organizationPrivateLink, setOrganizationPrivateLink] = useState("")
    const [copiedType, setCopiedType] = useState<string | null>(null)
    const [savedSettings, setSavedSettings] = useState(false)
    const [selectedMember, setSelectedMember] = useState<Membership | null>(null)
    const [showAccessModal, setShowAccessModal] = useState(false)

    const approvedMembers = useMemo(() =>
        memberships.filter(
            (m) =>
                m.status === "APPROVED" &&
                `${m.user.name || ""} ${m.user.email || ""} ${m.user.channel?.name || ""} ${m.user.channel?.username || ""}`
                    .toLowerCase()
                    .includes(search.toLowerCase())
        ),
        [memberships, search])
    const pendingMembers = useMemo(
        () => memberships.filter((m) => m.status === "PENDING"),
        [memberships]
    )
    const allowedUploaderOptions = useMemo(
        () =>
            memberships.filter((m) => m.status === "APPROVED").filter((m) =>
                `${m.user.name || ""} ${m.user.email || ""} ${m.user.channel?.name || ""} ${m.user.channel?.username || ""}`
                    .toLowerCase()
                    .includes(allowedUploaderQuery.toLowerCase())
            ),
        [memberships, allowedUploaderQuery]
    )
    const graphSeries = useMemo(() => {
        const normalizeDate = (value?: string) => {
            if (!value) return "Unknown"
            const date = new Date(value)
            if (Number.isNaN(date.getTime())) return "Unknown"
            return date.toISOString().slice(0, 10)
        }

        const buildSeries = (
            items: Array<{ createdAt?: string; video?: { title?: string } }>,
            labelPrefix?: string
        ) => {
            const dateSet = new Set<string>()
            const seriesMap = new Map<string, Map<string, number>>()

            items.forEach((item) => {
                const date = normalizeDate(item.createdAt)
                const label = labelPrefix || item.video?.title || "Unknown"
                dateSet.add(date)
                if (!seriesMap.has(label)) {
                    seriesMap.set(label, new Map())
                }
                const dateCounts = seriesMap.get(label)!
                dateCounts.set(date, (dateCounts.get(date) || 0) + 1)
            })

            const dates = Array.from(dateSet).sort().slice(-7)
            const series = Array.from(seriesMap.entries())
                .map(([label, values]) => ({
                    label,
                    values: dates.map((date) => values.get(date) || 0)
                }))
                .sort((a, b) =>
                    b.values.reduce((sum, value) => sum + value, 0) -
                    a.values.reduce((sum, value) => sum + value, 0)
                )
                .slice(0, 4)

            return { dates, series }
        }

        const source = activity || {}
        const views = buildSeries(source.views || [])
        const shares = buildSeries(source.shares || [])
        const engagement = buildSeries(
            [
                ...(source.likes || []).map((item) => ({ ...item, video: { title: "Likes" } })),
                ...(source.dislikes || []).map((item) => ({ ...item, video: { title: "Dislikes" } })),
                ...(source.shares || []).map((item) => ({ ...item, video: { title: "Shares" } })),
                ...(source.views || []).map((item) => ({ ...item, video: { title: "Views" } }))
            ]
        )

        return { views, shares, engagement }
    }, [activity])


    const loadAll = async () => {
        const my = await api.get("/organization/my")
        interface OrgInfo {
            id: string
            ownerId?: string
            name: string
            allowPublicContent?: boolean
            restrictContentForAdmins?: boolean
            allowedDomain?: string
            uploadPolicy?: string
            allowedUploaders?: Array<{ userId: string }>
        }
        const myMemberships: Array<{ status: string; role: string; organization?: OrgInfo }> = my.data?.data?.memberships || []
        const activeOrgId = my.data?.data?.access?.activeOrganizationId ?? null
        const adminMembership =
            myMemberships.find(
                (m) =>
                    m.status === "APPROVED" &&
                    m.role === "ADMIN" &&
                    m.organization?.id === activeOrgId
            ) ||
            myMemberships.find(
                (m) => m.status === "APPROVED" && m.role === "ADMIN"
            )

        if (!adminMembership?.organization?.id) {
            setMessage("You are not an organization admin.")
            return
        }

        const id = adminMembership.organization.id
        setOrgId(id)
        setOwnerId(adminMembership.organization.ownerId || null)
        setOrgName(adminMembership.organization.name)
        setRestrictToOrgContent(!adminMembership.organization.allowPublicContent)
        setRestrictContentForAdmins(adminMembership.organization.restrictContentForAdmins !== false)
        setAllowedDomain(adminMembership.organization.allowedDomain || "")
        setUploadPolicy(adminMembership.organization.uploadPolicy || "ADMINS_ONLY")

        const [memberRes, dashRes, linkRes] = await Promise.all([
            api.get(`/organization/${id}/members`),
            api.get(`/organization/dashboard/${id}`),
            api.get(`/organization/${id}/share-link`)
        ])

        setMemberships(memberRes.data?.data?.memberships || [])
        setTopVideos(dashRes.data?.data?.topVideos || [])
        setActivity(dashRes.data?.data?.activity || null)
        setTotals(dashRes.data?.data?.totals || null)
        setOrganizationPublicLink(linkRes.data?.data?.publicLink || "")
        setOrganizationPrivateLink(linkRes.data?.data?.privateLink || "")
        setAllowedUploaderUserIds(
            ((myMemberships.find((m) => m.organization?.id === id)?.organization?.allowedUploaders || []) as AllowedUploaderRow[]).map((row) => row.userId)
        )
    }

    useEffect(() => {
        // Avoid calling setState directly in effect body, use async function
        const fetchData = async () => {
            try {
                await loadAll()
            } catch (err) {
                setMessage("Failed to load organization dashboard.")
            }
        }
        fetchData()
    }, [])

    const saveSettings = async () => {
        if (!orgId) return

        await api.post("/organization/settings", {
            organizationId: orgId,
            allowPublicContent: !restrictToOrgContent,
            restrictContentForAdmins,
            allowedDomain,
            uploadPolicy,
            allowedUploaderUserIds
        })
        setMessage("Organization settings updated.")
        setSavedSettings(true)
        setTimeout(() => setSavedSettings(false), 2000)
    }

    const approve = async (id: string) => {
        await api.post(`/organization/membership/${id}/approve`)
        setMessage("Request approved.")
        await loadAll()
    }

    const approveAll = async () => {
        if (!orgId) return
        const res = await api.post("/organization/membership/approve-all", {
            organizationId: orgId
        })
        setMessage(`${res.data?.updated || 0} requests approved.`)
        await loadAll()
    }

    const makeAdmin = async (id: string) => {
        await api.post(`/organization/membership/${id}/role`, { role: "ADMIN" })
        setMessage("Member promoted to admin.")
        await loadAll()
    }

    const removeAdmin = async (id: string) => {
        await api.post(`/organization/membership/${id}/role`, { role: "MEMBER" })
        setMessage("Admin removed.")
        await loadAll()
    }

    const removeMember = async (id: string) => {
        await api.post(`/organization/membership/${id}/remove`)
        setMessage("Member removed.")
        await loadAll()
    }

    const makeAdminByEmail = async () => {
        if (!orgId || !promoteEmail.trim()) return
        await api.post("/organization/membership/promote-by-email", {
            organizationId: orgId,
            identifier: promoteEmail.trim()
        })
        setPromoteEmail("")
        await loadAll()
        setMessage("User promoted to admin.")
    }

    const invite = async () => {
        if (!orgId || !inviteEmail.trim()) return
        const res = await api.post("/organization/invite", {
            organizationId: orgId,
            identifier: inviteEmail.trim()
        })
        setLatestInviteLink(res.data?.data?.inviteLink || "")
        setInviteEmail("")
        setMessage("Invite created and sent. Link expires in 24 hours.")
    }

    const copyLink = async (link: string, type: string) => {
        if (!link) return

        try {
            await navigator.clipboard.writeText(link)
            setCopiedType(type)
        } catch {
            setCopiedType("error")
        }

        setTimeout(() => setCopiedType(null), 2000)
    }

    const upgrade = async (plan: "SIX_MONTH" | "YEARLY_INITIAL" | "YEARLY_RENEWAL") => {
        if (!orgId) return
        await api.post("/organization/subscription", {
            organizationId: orgId,
            plan
        })
        await loadAll()
    }

    return (
        <AppLayout>
            <div className="w-full px-2 sm:px-4">
                <div className="overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-[#6c36a8]/42 via-[#453994]/38 to-[#1c1f49]/62 shadow-[0_24px_70px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                    <div className="space-y-4 px-5 py-5 sm:px-7">

                        {/* TOP ROW */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                            <div>
                                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-white">
                                    Organization Dashboard
                                </h1>
                                <p className="mt-1 text-sm text-purple-100/58">
                                    {orgName || "No active admin organization"}
                                </p>
                            </div>

                            {/* QUICK ACTIONS */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setShowAccessModal(true)}
                                    className="rounded-xl bg-purple-600 hover:bg-purple-500 transition px-4 py-2.5 text-sm font-medium shadow"
                                >
                                    Invite User
                                </button>
                            </div>
                        </div>

                        {/* MESSAGE */}
                        {message && (
                            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm text-emerald-300">
                                {message}
                            </div>
                        )}
                    </div>

                    <div className="space-y-6 border-t border-white/10 px-5 py-6 sm:px-7">
                        {totals && (
                            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">

                                {Object.entries(totals).map(([k, v]) => (
                                    <div
                                        key={k}
                                        className="rounded-xl border border-white/10 bg-gradient-to-br from-black/28 to-black/14 p-4 hover:scale-[1.02] transition shadow-sm"
                                    >

                                        <p className="text-xs capitalize text-gray-300 tracking-wide">
                                            {k}
                                        </p>

                                        <p className="mt-1 text-xl font-bold text-white sm:text-2xl">
                                            {String(v)}
                                        </p>

                                        <p className="mt-1 text-[10px] text-gray-400">
                                            Total {k}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="grid gap-6 md:grid-cols-2">

                            {/* SETTINGS */}
                            <div className="rounded-2xl border border-white/10 bg-black/18 p-6 space-y-5 shadow-lg">

                        <div>
                            <h2 className="text-lg font-semibold text-white">Organization Settings</h2>
                            <p className="text-xs text-gray-400 mt-1">
                                Manage visibility, access, and upload permissions for your organization.
                            </p>
                        </div>

                        {/* TOGGLE SECTION */}
                        <div className="space-y-3">

                            <label className="flex items-center justify-between text-sm">
                                <span>Restrict users to organization content</span>
                                <input
                                    type="checkbox"
                                    aria-label="restrict to organization content"
                                    checked={restrictToOrgContent}
                                    onChange={(e) => setRestrictToOrgContent(e.target.checked)}
                                    className="accent-purple-500"
                                />
                            </label>

                            <p className="text-xs text-gray-400">
                                Members will only see videos uploaded within your organization.
                            </p>

                            {restrictToOrgContent && (
                                <>
                                    <label className="flex items-center justify-between text-sm">
                                        <span>Restrict admins to organization content</span>
                                        <input
                                            type="checkbox"
                                            aria-label="restrict admins to organization content"
                                            checked={restrictContentForAdmins}
                                            onChange={(e) => setRestrictContentForAdmins(e.target.checked)}
                                            className="accent-purple-500"
                                        />
                                    </label>

                                    <p className="text-xs text-gray-400">
                                        Turn this off if admins should still see all public rows and public search results.
                                    </p>
                                </>
                            )}

                        </div>

                        {/* DOMAIN */}
                        <div className="space-y-1">
                            <label className="text-xs text-gray-400">Allowed Email Domain</label>
                            <input
                                value={allowedDomain}
                                aria-label="allowed email domain"
                                onChange={(e) => setAllowedDomain(e.target.value)}
                                placeholder="example.com"
                                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                            />
                        </div>

                        {/* UPLOAD POLICY */}
                        <div className="space-y-1">
                            <label className="text-xs text-gray-400">Upload Policy</label>
                            <select
                                value={uploadPolicy}
                                aria-label="upload policy"
                                onChange={(e) => setUploadPolicy(e.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                            >
                                <option value="ADMINS_ONLY">Admins only upload</option>
                                <option value="ALL_MEMBERS">All members upload</option>
                                <option value="SPECIFIC_USERS">Specific users upload</option>
                            </select>
                        </div>

                        {/* CONDITIONAL FIELD */}
                        {uploadPolicy === "SPECIFIC_USERS" && (
                            <div className="space-y-3">
                                <label className="text-xs text-gray-400">Allowed Uploaders</label>
                                <input
                                    value={allowedUploaderQuery}
                                    aria-label="search allowed uploaders"
                                    onChange={(e) => setAllowedUploaderQuery(e.target.value)}
                                    placeholder="Search by name or channel name"
                                    className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                                />
                                <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3">
                                    {allowedUploaderOptions.map((member) => {
                                        const checked = allowedUploaderUserIds.includes(member.user.id)
                                        return (
                                            <label
                                                key={member.id}
                                                className="flex items-center justify-between gap-3 rounded-lg bg-black/30 px-3 py-2 text-sm"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-white">
                                                        {member.user.channel?.name || member.user.name || member.user.email}
                                                    </p>
                                                    <p className="truncate text-xs text-gray-400">
                                                        {member.user.name || member.user.email}
                                                        {member.user.channel?.username ? ` • @${member.user.channel.username}` : ""}
                                                    </p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() =>
                                                        setAllowedUploaderUserIds((prev) =>
                                                            checked
                                                                ? prev.filter((id) => id !== member.user.id)
                                                                : [...prev, member.user.id]
                                                        )
                                                    }
                                                    className="accent-purple-500"
                                                />
                                            </label>
                                        )
                                    })}
                                    {allowedUploaderOptions.length === 0 && (
                                        <div className="text-xs text-gray-500">No matching members found.</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* SAVE BUTTON */}
                        <button
                            onClick={saveSettings}
                            className="w-full rounded-lg bg-purple-600 hover:bg-purple-500 transition px-4 py-2 text-sm font-medium shadow-md active:scale-95"
                        >
                            {savedSettings ? "Saved!" : "Save Settings"}
                        </button>
                            </div>

                            {/* BILLING */}
                            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/6 to-white/10 p-6 space-y-5 shadow-lg">

                        <div>
                            <h2 className="text-lg font-semibold text-white">Billing & Plans</h2>
                            <p className="text-xs text-gray-400 mt-1">
                                Upgrade your organization plan to unlock premium features.
                            </p>
                        </div>

                        <div className="grid gap-3">

                            <button
                                onClick={() => upgrade("SIX_MONTH")}
                                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 transition px-4 py-3 text-sm font-medium shadow-md flex justify-between items-center"
                            >
                                <span>6 Months Plan</span>
                                <span className="text-xs text-white/80">₹18,000</span>
                            </button>

                            <button
                                onClick={() => upgrade("YEARLY_INITIAL")}
                                className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 transition px-4 py-3 text-sm font-medium shadow-md flex justify-between items-center"
                            >
                                <span>Yearly (Initial)</span>
                                <span className="text-xs text-white/80">₹10,000</span>
                            </button>

                            <button
                                onClick={() => upgrade("YEARLY_RENEWAL")}
                                className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 transition px-4 py-3 text-sm font-medium shadow-md flex justify-between items-center"
                            >
                                <span>Yearly Renewal</span>
                                <span className="text-xs text-white/80">₹24,000</span>
                            </button>

                        </div>
                            </div>

                        </div>

                        <div className="grid gap-6 md:grid-cols-2">

                    {/* PENDING REQUESTS */}
                    <div className="rounded-2xl border border-white/10 bg-black/18 p-5 space-y-4 shadow-md">

                        <div>
                            <h2 className="text-lg font-semibold text-white">Pending Requests</h2>
                            <p className="text-xs text-gray-400 mt-1">
                                Users waiting for approval to join your organization.
                            </p>
                        </div>

                        {pendingMembers.length > 1 && (
                            <button
                                onClick={approveAll}
                                className="rounded bg-emerald-700 hover:bg-emerald-600 transition px-3 py-2 text-xs font-medium"
                            >
                                Approve All
                            </button>
                        )}

                        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">

                            {pendingMembers.map((m) => (
                                <div
                                    key={m.id}
                                    className="flex items-center justify-between gap-3 rounded-lg bg-black/40 p-3 hover:bg-black/50 transition"
                                >
                                    <span className="truncate text-sm text-white">
                                        {m.user.name || m.user.email}
                                    </span>

                                    <button
                                        onClick={() => approve(m.id)}
                                        className="shrink-0 rounded bg-emerald-600 hover:bg-emerald-500 transition px-3 py-1 text-xs font-medium"
                                    >
                                        Approve
                                    </button>
                                </div>
                            ))}

                            {pendingMembers.length === 0 && (
                                <div className="text-center text-sm text-gray-400 py-6">
                                    🚀 No pending requests
                                </div>
                            )}
                        </div>
                    </div>

                    {/* MEMBERS */}
                    <div className="rounded-2xl border border-white/10 bg-black/18 p-5 space-y-4 shadow-md">

                        <div>
                            <h2 className="text-lg font-semibold text-white">Members</h2>
                            <p className="text-xs text-gray-400 mt-1">
                                Review organization members and open full details.
                            </p>
                        </div>

                        {/* SEARCH */}
                        <input
                            placeholder="Search members..."
                            value={search}
                            aria-label="search members"
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                        />

                        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">

                            {approvedMembers.map((m) => (
                                <div
                                    key={m.id}
                                    className="flex flex-col gap-2 rounded-lg bg-black/40 p-3 hover:bg-black/50 transition sm:flex-row sm:items-center sm:justify-between"
                                >

                                    {/* USER INFO */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm text-white">
                                            {m.user.channel?.name || m.user.name || m.user.email}
                                        </span>

                                        {/* ROLE BADGE */}
                                        <span
                                            className={`text-xs px-2 py-1 rounded ${m.role === "ADMIN"
                                                ? "bg-indigo-500/20 text-indigo-300"
                                                : "bg-gray-500/20 text-gray-300"
                                                }`}
                                        >
                                            {m.role}
                                        </span>

                                        <span className="text-xs text-gray-500">
                                            {m.user.channel?.name ? m.user.name || m.user.email : m.user.email}
                                        </span>
                                    </div>

                                    {/* ACTIONS */}
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            onClick={() => setSelectedMember(m)}
                                            className="inline-flex items-center gap-1 rounded bg-slate-700 hover:bg-slate-600 transition px-3 py-1 text-xs font-medium"
                                        >
                                            <Info size={14} />
                                            View Info
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {approvedMembers.length === 0 && (
                                <div className="text-center text-sm text-gray-400 py-6">
                                    No members found
                                </div>
                            )}
                        </div>
                    </div>

                        </div>



                        <div className="rounded-2xl border border-white/10 bg-black/18 p-5 space-y-4 shadow-md">

                    <div>
                        <h2 className="text-lg font-semibold text-white">
                            Top Performing Videos
                        </h2>
                        <p className="text-xs text-gray-400 mt-1">
                            Ranked by engagement (Shares {'>'} Likes {'>'} Views)
                        </p>
                    </div>

                    <div className="space-y-2">

                        {topVideos.map((v, idx) => (
                            <div
                                key={v.publicId}
                                className="flex flex-col gap-2 rounded-lg bg-gradient-to-r from-black/40 to-black/20 p-3 text-sm hover:scale-[1.01] transition sm:flex-row sm:items-center sm:justify-between"
                            >

                                {/* TITLE + RANK */}
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-semibold text-purple-400">
                                        #{idx + 1}
                                    </span>
                                    <span className="text-white font-medium truncate">
                                        {v.title}
                                    </span>
                                </div>

                                {/* STATS */}
                                <div className="flex gap-3 text-xs text-gray-300 flex-wrap">
                                    <span className="text-emerald-400">
                                        Shares {v.shares}
                                    </span>
                                    <span className="text-blue-400">
                                        Likes {v.likes}
                                    </span>
                                    <span className="text-gray-400">
                                        Views {v.views}
                                    </span>
                                </div>
                            </div>
                        ))}

                        {topVideos.length === 0 && (
                            <div className="text-center text-sm text-gray-400 py-6">
                                🎬 No video performance data yet
                                <div className="text-xs mt-1 text-gray-500">
                                    Upload videos to start tracking engagement
                                </div>
                            </div>
                        )}

                    </div>
                        </div>

                        {activity && (
                            <div className="grid gap-4 lg:grid-cols-2">
                                <LineChartCard
                                    title="Views By Video"
                                    dates={graphSeries.views.dates}
                                    series={graphSeries.views.series}
                                />
                                <BarChartCard
                                    title="Shares By Video"
                                    dates={graphSeries.shares.dates}
                                    series={graphSeries.shares.series}
                                />
                                <div className="lg:col-span-2">
                                    <LineChartCard
                                        title="Engagement Mix"
                                        dates={graphSeries.engagement.dates}
                                        series={graphSeries.engagement.series}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {showAccessModal && (
                <AccessControlModal
                    organizationPublicLink={organizationPublicLink}
                    organizationPrivateLink={organizationPrivateLink}
                    latestInviteLink={latestInviteLink}
                    inviteEmail={inviteEmail}
                    setInviteEmail={setInviteEmail}
                    promoteEmail={promoteEmail}
                    setPromoteEmail={setPromoteEmail}
                    copiedType={copiedType}
                    onCopyLink={copyLink}
                    onInvite={invite}
                    onPromote={makeAdminByEmail}
                    onClose={() => setShowAccessModal(false)}
                />
            )}
            {selectedMember && (
                <MemberInfoModal
                    member={selectedMember}
                    ownerId={ownerId}
                    onClose={() => setSelectedMember(null)}
                    onMakeAdmin={makeAdmin}
                    onRemoveAdmin={removeAdmin}
                    onRemoveMember={removeMember}
                />
            )}
        </AppLayout>
    )
}

const AccessControlModal = ({
    organizationPublicLink,
    organizationPrivateLink,
    latestInviteLink,
    inviteEmail,
    setInviteEmail,
    promoteEmail,
    setPromoteEmail,
    copiedType,
    onCopyLink,
    onInvite,
    onPromote,
    onClose
}: {
    organizationPublicLink: string
    organizationPrivateLink: string
    latestInviteLink: string
    inviteEmail: string
    setInviteEmail: (value: string) => void
    promoteEmail: string
    setPromoteEmail: (value: string) => void
    copiedType: string | null
    onCopyLink: (link: string, type: string) => void
    onInvite: () => void
    onPromote: () => void
    onClose: () => void
}) => (
    <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.22),transparent_32%),rgba(8,10,20,0.62)] px-4 backdrop-blur-md"
        onClick={onClose}
    >
        <div
            className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/12 bg-gradient-to-br from-[#251d46]/96 via-[#19192f]/96 to-[#11131f]/96 shadow-[0_32px_90px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                <div>
                    <h2 className="text-2xl font-semibold text-white">Invite & Manage Access</h2>
                    <p className="mt-1 text-sm text-purple-100/58">
                        Share organization links, invite new users, and promote trusted members from one place.
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-gray-300 transition hover:bg-white/14 hover:text-white"
                >
                    ✕
                </button>
            </div>

            <div className="grid max-h-[calc(90vh-88px)] gap-0 overflow-y-auto lg:grid-cols-[1.05fr_0.95fr]">
                <section className="space-y-5 border-b border-white/10 px-6 py-6 lg:border-b-0 lg:border-r">
                    <div>
                        <h3 className="text-lg font-semibold text-white">Organization Join Links</h3>
                        <p className="mt-1 text-sm text-purple-100/55">
                            Public links join instantly. Private links keep access approval in your control.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-2xl border border-emerald-500/18 bg-emerald-500/8 p-4">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-emerald-300">Public Access</p>
                                <span className="text-[11px] text-purple-100/45">No approval required</span>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                    value={organizationPublicLink}
                                    readOnly
                                    aria-label="public organization link"
                                    className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"
                                />
                                <button
                                    onClick={() => onCopyLink(organizationPublicLink, "public")}
                                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-emerald-500"
                                >
                                    {copiedType === "public" ? "Copied!" : "Copy Public Link"}
                                </button>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-500/18 bg-amber-500/8 p-4">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-amber-300">Private Access</p>
                                <span className="text-[11px] text-purple-100/45">Approval required</span>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                    value={organizationPrivateLink}
                                    readOnly
                                    aria-label="private organization link"
                                    className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"
                                />
                                <button
                                    onClick={() => onCopyLink(organizationPrivateLink, "private")}
                                    className="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-amber-500"
                                >
                                    {copiedType === "private" ? "Copied!" : "Copy Private Link"}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="space-y-5 px-6 py-6">
                    <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                        <div>
                            <h3 className="text-lg font-semibold text-white">Invite User</h3>
                            <p className="mt-1 text-sm text-purple-100/55">
                                Invite by email address or channel name.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="user@example.com or channel-name"
                                aria-label="invite user"
                                className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <button
                                onClick={onInvite}
                                className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-purple-500"
                            >
                                Send Invite
                            </button>
                        </div>

                        {latestInviteLink && (
                            <div className="rounded-xl border border-white/10 bg-black/22 p-3 space-y-2">
                                <p className="text-xs text-purple-100/60">
                                    Latest invite link, valid for 24 hours or until used.
                                </p>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <input
                                        value={latestInviteLink}
                                        readOnly
                                        aria-label="latest invite link"
                                        className="flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-white"
                                    />
                                    <button
                                        onClick={() => onCopyLink(latestInviteLink, "invite")}
                                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-500"
                                    >
                                        {copiedType === "invite" ? "Copied!" : "Copy Invite"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                        <div>
                            <h3 className="text-lg font-semibold text-white">Promote Member</h3>
                            <p className="mt-1 text-sm text-purple-100/55">
                                Grant admin access by email or channel name.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                value={promoteEmail}
                                onChange={(e) => setPromoteEmail(e.target.value)}
                                placeholder="member@example.com or channel-name"
                                aria-label="promote member"
                                className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                                onClick={onPromote}
                                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
                            >
                                Promote
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </div>
)

const CHART_COLORS = ["#60a5fa", "#34d399", "#f59e0b", "#f472b6"]

const LineChartCard = ({
    title,
    dates,
    series
}: {
    title: string
    dates: string[]
    series: ChartSeries[]
}) => {
    const width = 640
    const height = 220
    const padding = 28
    const maxValue = Math.max(...series.flatMap((item) => item.values), 1)
    const xStep = dates.length > 1 ? (width - padding * 2) / (dates.length - 1) : 0
    const yFor = (value: number) => height - padding - (value / maxValue) * (height - padding * 2)

    return (
        <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-5 space-y-4 shadow-md">
            <div>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <p className="text-xs text-gray-400 mt-1">Unique date and video trend lines across recent activity.</p>
            </div>

            {dates.length && series.length ? (
                <>
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
                        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#475569" strokeWidth="1" />
                        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#475569" strokeWidth="1" />
                        {series.map((item, seriesIndex) => {
                            const points = item.values.map((value, index) => `${padding + xStep * index},${yFor(value)}`).join(" ")
                            return (
                                <g key={`${title}-${item.label}`}>
                                    <polyline
                                        fill="none"
                                        stroke={CHART_COLORS[seriesIndex % CHART_COLORS.length]}
                                        strokeWidth="3"
                                        points={points}
                                    />
                                    {item.values.map((value, index) => (
                                        <circle
                                            key={`${item.label}-${dates[index]}`}
                                            cx={padding + xStep * index}
                                            cy={yFor(value)}
                                            r="4"
                                            fill={CHART_COLORS[seriesIndex % CHART_COLORS.length]}
                                        />
                                    ))}
                                </g>
                            )
                        })}
                    </svg>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-300">
                        {series.map((item, index) => (
                            <div key={item.label} className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                                <span>{item.label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400 sm:grid-cols-4">
                        {dates.map((date) => (
                            <span key={`${title}-${date}`}>{date}</span>
                        ))}
                    </div>
                </>
            ) : (
                <div className="py-8 text-sm text-center text-gray-400">No data yet</div>
            )}
        </div>
    )
}

const BarChartCard = ({
    title,
    dates,
    series
}: {
    title: string
    dates: string[]
    series: ChartSeries[]
}) => {
    const width = 640
    const height = 220
    const padding = 28
    const maxValue = Math.max(...series.flatMap((item) => item.values), 1)
    const groupWidth = dates.length ? (width - padding * 2) / dates.length : 0
    const barWidth = series.length ? Math.max(10, (groupWidth - 8) / series.length) : 0

    return (
        <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-5 space-y-4 shadow-md">
            <div>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <p className="text-xs text-gray-400 mt-1">Grouped bars by unique date and video shares.</p>
            </div>

            {dates.length && series.length ? (
                <>
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
                        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#475569" strokeWidth="1" />
                        {dates.map((date, dateIndex) =>
                            series.map((item, seriesIndex) => {
                                const value = item.values[dateIndex] || 0
                                const barHeight = value === 0 ? 2 : (value / maxValue) * (height - padding * 2)
                                const x = padding + groupWidth * dateIndex + seriesIndex * barWidth + 4
                                const y = height - padding - barHeight
                                return (
                                    <rect
                                        key={`${date}-${item.label}`}
                                        x={x}
                                        y={y}
                                        width={barWidth - 4}
                                        height={barHeight}
                                        rx="4"
                                        fill={CHART_COLORS[seriesIndex % CHART_COLORS.length]}
                                    />
                                )
                            })
                        )}
                    </svg>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-300">
                        {series.map((item, index) => (
                            <div key={item.label} className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                                <span>{item.label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400 sm:grid-cols-4">
                        {dates.map((date) => (
                            <span key={`${title}-${date}`}>{date}</span>
                        ))}
                    </div>
                </>
            ) : (
                <div className="py-8 text-sm text-center text-gray-400">No data yet</div>
            )}
        </div>
    )
}

const MemberInfoModal = ({
    member,
    ownerId,
    onClose,
    onMakeAdmin,
    onRemoveAdmin,
    onRemoveMember
}: {
    member: Membership
    ownerId: string | null
    onClose: () => void
    onMakeAdmin: (id: string) => Promise<void>
    onRemoveAdmin: (id: string) => Promise<void>
    onRemoveMember: (id: string) => Promise<void>
}) => (
    <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.22),transparent_32%),rgba(7,9,18,0.62)] px-4 backdrop-blur-md"
        onClick={onClose}
    >
        <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-white/12 bg-[linear-gradient(145deg,rgba(40,30,74,0.96),rgba(22,22,38,0.97)_44%,rgba(13,15,26,0.98))] p-4 sm:p-6 shadow-[0_32px_90px_rgba(0,0,0,0.42)]"
            onClick={(event) => event.stopPropagation()}
        >
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                    <h2 className="text-2xl font-semibold text-white">Member Details</h2>
                    <p className="mt-1 text-sm text-purple-100/58">
                        Review the user identity, channel details, and organization access status.
                    </p>
                </div>
                <button
                    onClick={onClose}
                    aria-label="Close member details"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-gray-300 transition hover:bg-white/14 hover:text-white"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow label="Name" value={member.user.name || member.user.email || "—"} />
                <InfoRow label="Channel Name" value={member.user.channel?.name || "—"} />
                <InfoRow label="Channel Username" value={member.user.channel?.username || "—"} />
                <InfoRow label="Membership Requested" value={member.requestedAt ? new Date(member.requestedAt).toLocaleString() : "—"} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3 border-t border-white/10 pt-5">
                {member.role !== "ADMIN" && (
                    <button
                        onClick={async () => {
                            await onMakeAdmin(member.id)
                            onClose()
                        }}
                        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500"
                    >
                        Make Admin
                    </button>
                )}

                {member.role === "ADMIN" && ownerId !== member.user.id && (
                    <button
                        onClick={async () => {
                            await onRemoveAdmin(member.id)
                            onClose()
                        }}
                        className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-rose-500"
                    >
                        Remove Admin
                    </button>
                )}

                {ownerId !== member.user.id && (
                    <button
                        onClick={async () => {
                            await onRemoveMember(member.id)
                            onClose()
                        }}
                        className="rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/16"
                    >
                        Remove User
                    </button>
                )}
            </div>
        </div>
    </div>
)

const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <p className="text-[11px] uppercase tracking-[0.16em] text-purple-100/40">{label}</p>
        <p className="mt-2 break-words text-sm text-white">{value}</p>
    </div>
)

export default OrganizationDashboard
