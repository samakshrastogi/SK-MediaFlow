import { useEffect, useRef, useState } from "react"
import { Bell } from "lucide-react"
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

const getNotifications = async (force = false) => {
    if (
        !force &&
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
                return notificationsCache || []
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
    const [scrolled, setScrolled] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const notificationRef = useRef<HTMLDivElement>(null)

    const loadNotifications = async (force = false) => {
        if (!user) {
            notificationsCache = null
            notificationsCacheAt = 0
            setNotifications([])
            return
        }
        const rows = await getNotifications(force)
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
        if (!user) {
            notificationsCache = null
            notificationsCacheAt = 0
            setNotifications([])
            return
        }

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
    }, [user])

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 18)
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [])

    const handleLogout = async () => {
        await logout()
        navigate("/login")
    }

    const unreadCount = notifications.filter((n) => !n.isRead).length

    const handleNotificationClick = async (item: NotificationItem) => {
        try {
            if (!item.isRead) {
                await api.post(`/notification/${item.id}/read`)
                const markRead = (rows: NotificationItem[]) =>
                    rows.map((row) => (row.id === item.id ? { ...row, isRead: true } : row))

                notificationsCache = notificationsCache ? markRead(notificationsCache) : notificationsCache
                notificationsCacheAt = Date.now()
                setNotifications(markRead)
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
            className={`fixed left-0 right-0 top-0 z-50 flex h-[68px] items-center justify-between px-4 transition-all duration-300 md:px-6 ${
                scrolled
                    ? "border-b border-white/10 bg-[linear-gradient(180deg,rgba(10,12,28,0.92),rgba(16,14,38,0.78))] shadow-[0_18px_40px_rgba(0,0,0,0.22)] backdrop-blur-2xl"
                    : "bg-[linear-gradient(180deg,rgba(10,12,28,0.45),rgba(16,14,38,0.14))] backdrop-blur-xl"
            }`}
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
                        alt="SK-MediaFlow Logo"
                        className="h-7 w-7 object-contain drop-shadow-[0_0_12px_rgba(56,189,248,0.3)] sm:h-8 sm:w-8"
                    />

                    <h1 className="bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-base font-bold text-transparent sm:text-lg md:text-xl">
                        SK-MediaFlow
                    </h1>
                </div>
            </div>

            {/* 🔷 RIGHT */}
            <div className="flex items-center gap-3 md:gap-4 relative">

                {/* NOTIFICATIONS */}
                <div ref={notificationRef} className="relative">
                    <button
                        onClick={() => {
                            if (!user) {
                                navigate("/login", { state: { from: window.location.pathname } })
                                return
                            }
                            const nextOpen = !notificationOpen
                            setNotificationOpen(nextOpen)
                            if (nextOpen) {
                                void loadNotifications(true)
                            }
                        }}
                        className="relative cursor-pointer rounded-full border border-white/10 bg-white/6 p-2 text-gray-300 transition hover:bg-white/10 hover:text-white"
                        aria-label="Notifications"
                    >
                        <Bell className={`text-gray-300 transition ${unreadCount > 0 ? "animate-pulse text-cyan-100" : ""}`} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] text-white leading-4 text-center">
                                {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                        )}
                    </button>

                    {notificationOpen && (
                        <div className="fixed left-3 right-3 top-[76px] z-[70] max-h-[min(28rem,calc(100dvh-6rem))] overflow-hidden rounded-3xl border border-white/10 bg-[#0f1424]/95 shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[360px]">
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
                                            className="shrink-0 rounded-full border border-white/8 bg-white/6 px-3 py-1 text-[11px] text-purple-100/75 transition hover:bg-white/10"
                                        >
                                            Mark all read
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="max-h-[calc(min(28rem,calc(100dvh-6rem))-4.75rem)] overflow-y-auto p-3">
                                {notifications.length === 0 ? (
                                    <div className="rounded-2xl border border-white/8 bg-white/[0.06] px-4 py-8 text-center">
                                        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/8 text-purple-100">
                                            <Bell size={18} />
                                        </div>
                                        <p className="text-sm font-semibold text-white">No notifications yet</p>
                                        <p className="mt-1 text-xs text-purple-100/50">
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
                        onClick={() => {
                            if (!user) {
                                navigate("/login", { state: { from: window.location.pathname } })
                                return
                            }
                            setDropdownOpen(!dropdownOpen)
                        }}
                        className="cursor-pointer rounded-full border border-white/10 bg-white/6 p-0.5 shadow-[0_0_18px_rgba(96,165,250,0.12)] transition hover:bg-white/10"
                    >
                        <UserAvatar
                            name={user?.name}
                            avatarUrl={user?.avatarUrl}
                            avatarKey={user?.avatarKey}
                            alt="User Profile"
                        />
                    </div>

                    {dropdownOpen && user && (
                        <div className="absolute right-0 mt-3 w-[min(15rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-[#111827]/80 p-4 shadow-xl backdrop-blur-xl">
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
