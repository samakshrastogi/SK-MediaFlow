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

const NOTIFICATIONS_TTL_MS = 15000

let notificationsCache: NotificationItem[] | null = null
let notificationsCacheAt = 0
let notificationsPromise: Promise<NotificationItem[]> | null = null

const getNotifications = async () => {
    if (
        notificationsCache &&
        Date.now() - notificationsCacheAt < NOTIFICATIONS_TTL_MS
    ) {
        return notificationsCache
    }

    if (!notificationsPromise) {
        notificationsPromise = api.get("/notification")
            .then((res) => {
                notificationsCache = (res.data?.data || []) as NotificationItem[]
                notificationsCacheAt = Date.now()
                return notificationsCache
            })
            .catch(() => {
                notificationsCache = []
                notificationsCacheAt = Date.now()
                return []
            })
            .finally(() => {
                notificationsPromise = null
            })
    }

    return notificationsPromise
}

const Topbar = () => {
    const { logout, user } = useAuth()
    const navigate = useNavigate()

    const [dropdownOpen, setDropdownOpen] = useState(false)
    const [notificationOpen, setNotificationOpen] = useState(false)
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const dropdownRef = useRef<HTMLDivElement>(null)
    const notificationRef = useRef<HTMLDivElement>(null)

    const loadNotifications = async () => {
        const rows = await getNotifications()
        setNotifications(rows)
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

    const handleLogout = async () => {
        await logout()
        navigate("/login")
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
            notificationsCache = notifications.map((n) => ({ ...n, isRead: true }))
            notificationsCacheAt = Date.now()
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
                        alt="StreamHub Logo"
                        className="w-6 h-6 sm:w-7 sm:h-7 object-contain"
                    />

                    <h1 className="text-base sm:text-lg md:text-xl font-bold">
                        StreamHub
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
                        <div className="absolute right-0 mt-3 w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/85 shadow-[0_24px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl">
                            <div className="border-b border-white/8 px-4 py-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-base font-semibold text-white">Notifications</p>
                                        <p className="mt-0.5 text-xs text-purple-100/45">
                                            Latest alerts and activity updates
                                        </p>
                                    </div>
                                {notifications.length > 0 && unreadCount > 0 && (
                                    <button
                                        onClick={markAllRead}
                                        className="rounded-full border border-white/8 bg-white/6 px-3 py-1 text-[11px] text-purple-100/75 transition hover:bg-white/10"
                                    >
                                        Mark all read
                                    </button>
                                )}
                                </div>
                            </div>

                            <div className="max-h-96 overflow-y-auto p-3">
                                {notifications.length === 0 ? (
                                    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-6 text-center">
                                        <p className="text-sm font-medium text-white">No notifications yet</p>
                                        <p className="mt-1 text-xs text-purple-100/45">
                                            New updates will appear here.
                                        </p>
                                    </div>
                                ) : (
                                <div className="space-y-2.5">
                                    {notifications.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => handleNotificationClick(item)}
                                            className={`w-full rounded-2xl border p-3 text-left transition ${
                                                item.isRead
                                                    ? "border-white/6 bg-white/[0.06] hover:bg-white/[0.09]"
                                                    : "border-blue-400/20 bg-linear-to-br from-blue-500/14 to-cyan-400/8 hover:from-blue-500/18 hover:to-cyan-400/12"
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                                                    item.isRead ? "bg-white/8 text-purple-100/55" : "bg-blue-500/18 text-blue-200"
                                                }`}>
                                                    {item.isRead ? "✓" : "•"}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <p className="line-clamp-1 text-sm font-semibold text-white">
                                                            {item.title}
                                                        </p>
                                                        {!item.isRead && (
                                                            <span className="mt-0.5 inline-flex rounded-full bg-blue-500/18 px-2 py-0.5 text-[10px] font-medium text-blue-200">
                                                                New
                                                            </span>
                                                        )}
                                                    </div>

                                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-purple-100/65">
                                                        {item.message}
                                                    </p>

                                                    <p className="mt-2 text-[11px] text-purple-100/38">
                                                        {new Date(item.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                )}
                            </div>
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
                        <div className="absolute right-0 mt-3 w-60 rounded-xl border border-white/10 bg-[#111827]/80 p-4 shadow-xl backdrop-blur-xl">
                            <p className="font-semibold text-lg">{user.name}</p>

                            <p className="text-sm text-gray-400">
                                Joined:{" "}
                                {user.createdAt
                                    ? new Date(user.createdAt).toLocaleDateString()
                                    : "N/A"}
                            </p>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => {
                                        setDropdownOpen(false)
                                        navigate("/profile")
                                    }}
                                    className="rounded-lg bg-purple-600 p-2 text-sm transition hover:bg-purple-700"
                                >
                                    View Profile
                                </button>

                                <button
                                    onClick={handleLogout}
                                    className="rounded-lg bg-red-600 p-2 text-sm transition hover:bg-red-700"
                                >
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}

export default Topbar
