import { useEffect, useRef, useState } from "react"
import { Search, Bell } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useNavigate } from "react-router-dom"
import UserAvatar from "@/components/UserAvatar"
import { api } from "@/api/axios"

interface NotificationItem {
    id: string
    title: string
    message: string
    link?: string | null
    isRead: boolean
    createdAt: string
}

interface ActiveOrganizationLite {
    id: string
    name: string
    ownerId?: string
}

interface OrganizationMembershipLite {
    organization?: ActiveOrganizationLite
}

const Topbar = () => {
    const { logout, user } = useAuth()
    const navigate = useNavigate()

    const [dropdownOpen, setDropdownOpen] = useState(false)
    const [notificationOpen, setNotificationOpen] = useState(false)
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const [activeOrganization, setActiveOrganization] = useState<ActiveOrganizationLite | null>(null)
    const [canLeaveOrganization, setCanLeaveOrganization] = useState(false)

    const dropdownRef = useRef<HTMLDivElement>(null)
    const notificationRef = useRef<HTMLDivElement>(null)

    const loadNotifications = async () => {
        try {
            const res = await api.get("/notification")
            const rows = (res.data?.data || []) as NotificationItem[]
            setNotifications(rows)
        } catch {
            setNotifications([])
        }
    }

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setDropdownOpen(false)
            }

            if (
                notificationRef.current &&
                !notificationRef.current.contains(event.target as Node)
            ) {
                setNotificationOpen(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadNotifications()
        }, 0)
        const interval = window.setInterval(() => {
            void loadNotifications()
        }, 20000)
        return () => {
            window.clearTimeout(timer)
            window.clearInterval(interval)
        }
    }, [])

    useEffect(() => {
        const fetchOrg = async () => {
            try {
                const res = await api.get("/organization/my")
                const memberships = (res.data?.data?.memberships || []) as OrganizationMembershipLite[]
                const accessOrgId = res.data?.data?.access?.activeOrganizationId
                const activeMembership = memberships.find(
                    (m) => m.organization?.id === accessOrgId
                )

                if (activeMembership?.organization) {
                    setActiveOrganization({
                        id: activeMembership.organization.id,
                        name: activeMembership.organization.name,
                        ownerId: activeMembership.organization.ownerId
                    })
                } else {
                    setActiveOrganization(null)
                }

                const canLeave =
                    Boolean(activeMembership?.organization) &&
                    activeMembership?.organization?.ownerId !== user?.id
                setCanLeaveOrganization(canLeave)
            } catch {
                setActiveOrganization(null)
                setCanLeaveOrganization(false)
            }
        }

        fetchOrg()
    }, [user?.id])

    const handleLogout = async () => {
        await logout()
        navigate("/login")
    }

    const handleLeaveOrganization = async () => {
        if (!activeOrganization) return
        const ok = window.confirm(
            `Leave ${activeOrganization.name}?`
        )
        if (!ok) return

        try {
            await api.post("/organization/leave", {
                organizationId: activeOrganization.id
            })
            setActiveOrganization(null)
            setDropdownOpen(false)
        } catch (error) {
            console.error("Leave organization failed", error)
        }
    }

    const handleSearch = () => navigate("/search")

    const unreadCount = notifications.filter((n) => !n.isRead).length

    const handleNotificationClick = async (item: NotificationItem) => {
        try {
            if (!item.isRead) {
                await api.post(`/notification/${item.id}/read`)
                setNotifications((prev) =>
                    prev.map((row) => (row.id === item.id ? { ...row, isRead: true } : row))
                )
            }
        } catch {
            // no-op
        }

        setNotificationOpen(false)

        if (item.link) {
            navigate(item.link)
        }
    }

    const markAllRead = async () => {
        try {
            await api.post("/notification/read-all")
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
        } catch {
            // no-op
        }
    }

    return (
        <header
            className="
        fixed top-0 left-0 right-0 h-[64px]
        flex items-center justify-between
        px-4 md:px-6
        bg-[#1b1236]/80 backdrop-blur-xl border-b border-white/10
        z-50
        "
        >
            {/* 🔷 LEFT */}
            <div className="flex items-center gap-3 md:gap-4">

                {/* LOGO */}
                <div
                    onClick={() => navigate("/home")}
                    className="flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                    <img
                        src="/images/logo.png"
                        alt="SK Cinema Logo"
                        className="w-6 h-6 sm:w-7 sm:h-7 object-contain"
                    />

                    <h1 className="text-base sm:text-lg md:text-xl font-bold">
                        SK Cinema
                    </h1>
                </div>
            </div>

            {/* 🔷 RIGHT */}
            <div className="flex items-center gap-3 md:gap-4 relative">

                {/* SEARCH ICON (MOBILE) */}
                <button
                    className="md:hidden p-2 bg-white/10 rounded-lg"
                    aria-label="Search"
                    onClick={handleSearch}
                >
                    <Search size={18} />
                </button>

                {/* NOTIFICATIONS */}
                <div ref={notificationRef} className="relative">
                    <button
                        onClick={() => setNotificationOpen((v) => !v)}
                        className="relative text-gray-300 cursor-pointer"
                        aria-label="Notifications"
                    >
                        <Bell className="text-gray-300" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] text-white leading-4 text-center">
                                {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                        )}
                    </button>

                    {notificationOpen && (
                        <div className="absolute right-0 mt-3 w-80 max-h-96 overflow-y-auto bg-gray-900 border border-gray-800 rounded-xl shadow-xl p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-sm font-semibold">Notifications</p>
                                {notifications.length > 0 && unreadCount > 0 && (
                                    <button
                                        onClick={markAllRead}
                                        className="text-xs text-blue-300 hover:text-blue-200"
                                    >
                                        Mark all read
                                    </button>
                                )}
                            </div>

                            {notifications.length === 0 ? (
                                <p className="text-xs text-gray-400">No notifications yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {notifications.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => handleNotificationClick(item)}
                                            className={`w-full text-left p-2 rounded-lg transition border ${
                                                item.isRead
                                                    ? "bg-white/5 hover:bg-white/10 border-white/5"
                                                    : "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30"
                                            }`}
                                        >
                                            <p className="text-sm text-white truncate">
                                                {item.title}
                                            </p>
                                            <p className="text-xs text-gray-300 line-clamp-2">
                                                {item.message}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* PROFILE */}
                <div ref={dropdownRef} className="relative">
                    <div
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="cursor-pointer"
                    >
                        <UserAvatar
                            name={user?.name}
                            avatarUrl={user?.avatarUrl}
                            avatarKey={user?.avatarKey}
                            alt="User Profile"
                        />
                    </div>

                    {dropdownOpen && user && (
                        <div className="absolute right-0 mt-3 w-60 bg-gray-900 border border-gray-800 rounded-xl shadow-xl p-4">
                            <p className="font-semibold text-lg">{user.name}</p>

                            <p className="text-sm text-gray-400">
                                Joined:{" "}
                                {user.createdAt
                                    ? new Date(user.createdAt).toLocaleDateString()
                                    : "N/A"}
                            </p>

                            <button
                                onClick={() => {
                                    setDropdownOpen(false)
                                    navigate("/profile")
                                }}
                                className="mt-4 w-full bg-purple-600 hover:bg-purple-700 transition p-2 rounded-lg text-sm"
                            >
                                View Profile
                            </button>

                            {activeOrganization && canLeaveOrganization && (
                                <button
                                    onClick={handleLeaveOrganization}
                                    className="mt-2 w-full bg-amber-600 hover:bg-amber-700 transition p-2 rounded-lg text-sm"
                                >
                                    Leave Organization
                                </button>
                            )}

                            <button
                                onClick={handleLogout}
                                className="mt-2 w-full bg-red-600 hover:bg-red-700 transition p-2 rounded-lg text-sm"
                            >
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}

export default Topbar
