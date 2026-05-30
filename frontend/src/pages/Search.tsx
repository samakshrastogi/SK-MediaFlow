import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Play, Search, Sparkles, UserRound, Film, ListVideo } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { api } from "@/api/axios"
import AppLayout from "@/layouts/AppLayout"
import { useAuth } from "@/context/AuthContext"
import { getCachedPageData, setCachedPageData } from "@/utils/pageCache"
import { prefetchMedia } from "@/utils/media"

interface Video {
    publicId?: string
    id?: string
    title?: string
    aiTitle?: string
    aiDescription?: string
    thumbnailKey?: string
    progress?: number
    uploaderName?: string
    createdAt?: string
    signedUrl?: string
    orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
    channel?: {
        name?: string
    }
}

const SEARCH_HISTORY_LIMIT = 8
const PLACEHOLDERS = ["Search movies...", "Search creators...", "Search playlists..."]
const FILTERS = [
    { key: "all", label: "All", icon: Sparkles },
    { key: "movies", label: "Movies", icon: Film },
    { key: "creators", label: "Creators", icon: UserRound },
    { key: "playlists", label: "Playlists", icon: ListVideo }
] as const

const getSearchHistoryKey = (userId?: string) => `search-history:${userId || "guest"}`

const readSearchHistory = (userId?: string) => {
    try {
        const stored = localStorage.getItem(getSearchHistoryKey(userId))
        if (!stored) return []
        const parsed = JSON.parse(stored)
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
    } catch {
        return []
    }
}

const writeSearchHistory = (userId: string | undefined, value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return readSearchHistory(userId)

    const next = [
        trimmed,
        ...readSearchHistory(userId).filter((item) => item.toLowerCase() !== trimmed.toLowerCase())
    ].slice(0, SEARCH_HISTORY_LIMIT)

    localStorage.setItem(getSearchHistoryKey(userId), JSON.stringify(next))
    return next
}

const stableHash = (value: string) =>
    Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0)

const getTitle = (video: Video) => video.title?.trim() || video.aiTitle?.trim() || "Untitled"
const getChannel = (video: Video) => video.channel?.name?.trim() || video.uploaderName?.trim() || "Unknown channel"
const getThumbnail = (video: Video) =>
    video.thumbnailKey
        ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}`
        : "/placeholder.jpg"

const formatRelativeTime = (date?: string) => {
    if (!date) return "just now"
    const diffInSeconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000))
    if (diffInSeconds < 60) return "just now"

    const units = [
        { label: "y", value: 60 * 60 * 24 * 365 },
        { label: "mo", value: 60 * 60 * 24 * 30 },
        { label: "w", value: 60 * 60 * 24 * 7 },
        { label: "d", value: 60 * 60 * 24 },
        { label: "h", value: 60 * 60 },
        { label: "m", value: 60 }
    ]

    for (const unit of units) {
        const amount = Math.floor(diffInSeconds / unit.value)
        if (amount > 0) return `${amount}${unit.label} ago`
    }

    return "just now"
}

const getDuration = (video: Video) => {
    const seed = stableHash(`${video.publicId || video.id}${getTitle(video)}`)
    const minutes = (seed % 58) + 2
    const seconds = (seed * 7) % 60
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

const matchesFilter = (video: Video, filter: string) => {
    const title = getTitle(video).toLowerCase()
    const channel = getChannel(video).toLowerCase()

    switch (filter) {
        case "movies":
            return video.orientation !== "PORTRAIT"
        case "creators":
            return channel.length > 0
        case "playlists":
            return /playlist|mix|collection|vault|set/i.test(title) || stableHash(title) % 5 === 0
        default:
            return true
    }
}

const SearchPage = () => {
    const navigate = useNavigate()
    const { user } = useAuth()
    const [params] = useSearchParams()
    const q = (params.get("q") || "").trim()
    const cachedResults = getCachedPageData<Video[]>(`page:search:${q}`)
    const wrapRef = useRef<HTMLDivElement | null>(null)

    const [query, setQuery] = useState(q)
    const [results, setResults] = useState<Video[]>(cachedResults || [])
    const [loading, setLoading] = useState(Boolean(q) && !cachedResults)
    const [history, setHistory] = useState<string[]>(() => readSearchHistory(user?.id))
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]["key"]>("all")
    const [placeholderIndex, setPlaceholderIndex] = useState(0)

    const filteredResults = useMemo(
        () => results.filter((video) => matchesFilter(video, activeFilter)),
        [results, activeFilter]
    )

    const suggestions = useMemo(() => {
        const trimmed = query.trim().toLowerCase()
        if (!trimmed) return history
        return history.filter((item) => item.toLowerCase().includes(trimmed))
    }, [query, history])

    const hasSearch = q.length > 0
    const shouldScrollResults = filteredResults.length > 8

    const submitSearch = (rawValue: string, replace = false, closeSuggestions = true) => {
        const trimmed = rawValue.trim()
        if (closeSuggestions) setShowSuggestions(false)

        if (!trimmed) {
            navigate("/search", { replace })
            return
        }

        const nextHistory = writeSearchHistory(user?.id, trimmed)
        setHistory(nextHistory)
        navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace })
    }

    useEffect(() => {
        setHistory(readSearchHistory(user?.id))
    }, [user?.id])

    useEffect(() => {
        setQuery(q)
    }, [q])

    useEffect(() => {
        if (!q) return
        setHistory(writeSearchHistory(user?.id, q))
    }, [q, user?.id])

    useEffect(() => {
        let mounted = true

        const run = async () => {
            if (!q) {
                setResults([])
                setLoading(false)
                return
            }

            try {
                if (!cachedResults) setLoading(true)
                const res = await api.get("/video/search", { params: { q } })
                const data = Array.isArray(res.data?.data) ? res.data.data : []
                if (!mounted) return
                setResults(data)
                setCachedPageData(`page:search:${q}`, data, 120000)
            } catch {
                if (mounted) setResults([])
            } finally {
                if (mounted) setLoading(false)
            }
        }

        void run()
        return () => {
            mounted = false
        }
    }, [q, cachedResults])

    useEffect(() => {
        const trimmed = query.trim()
        const timer = window.setTimeout(() => {
            if (trimmed === q) return
            submitSearch(trimmed, true, false)
        }, 320)

        return () => window.clearTimeout(timer)
    }, [query, q])

    useEffect(() => {
        const timer = window.setInterval(() => {
            setPlaceholderIndex((current) => (current + 1) % PLACEHOLDERS.length)
        }, 2200)

        return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!wrapRef.current?.contains(event.target as Node)) {
                setShowSuggestions(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        if (!hasSearch) setActiveFilter("all")
    }, [hasSearch])

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        submitSearch(query)
    }

    return (
        <AppLayout>
            <div className="relative flex min-h-[calc(100dvh-5rem)] flex-col md:min-h-[calc(100dvh-7.5rem)]">
                <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5">
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className={`relative z-20 mx-auto w-full overflow-visible pt-5 sm:pt-8 ${
                            hasSearch ? "max-w-3xl" : "max-w-md sm:max-w-xl"
                        }`}
                    >
                        <div className="space-y-5">
                            <div ref={wrapRef} className="relative z-30">
                                <motion.form
                                    onSubmit={onSubmit}
                                    animate={showSuggestions ? { scale: 1.01 } : { scale: 1 }}
                                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                                    className="rounded-[30px] border border-cyan-200/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] p-[1px] shadow-[0_18px_54px_rgba(3,7,18,0.36)]"
                                >
                                    <div className="flex min-h-[68px] items-center gap-3 rounded-[29px] bg-[#080d1d]/88 px-4 py-3.5 backdrop-blur-2xl sm:px-5">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/22 bg-cyan-300/12 text-cyan-100 shadow-[0_10px_28px_rgba(34,211,238,0.08)]">
                                            <Search size={20} />
                                        </div>
                                        <input
                                            value={query}
                                            onFocus={() => setShowSuggestions(true)}
                                            onChange={(event) => {
                                                setQuery(event.target.value)
                                                setShowSuggestions(true)
                                            }}
                                            placeholder={PLACEHOLDERS[placeholderIndex]}
                                            className="w-full bg-transparent text-base font-semibold text-white outline-none placeholder:text-slate-400/70 sm:text-lg"
                                        />
                                    </div>
                                </motion.form>

                                <AnimatePresence>
                                    {showSuggestions && suggestions.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 8 }}
                                            transition={{ duration: 0.2 }}
                                            className="absolute left-0 right-0 top-full z-30 mt-3 overflow-hidden rounded-[22px] border border-white/10 bg-[#0c1121]/92 shadow-[0_18px_50px_rgba(2,6,23,0.5)] backdrop-blur-2xl"
                                        >
                                            <div className="border-b border-white/8 px-4 py-3 text-[0.68rem] uppercase tracking-[0.28em] text-slate-400">
                                                Recent searches
                                            </div>
                                            <div className="py-2">
                                                {suggestions.slice(0, 5).map((item) => (
                                                    <button
                                                        key={item}
                                                        type="button"
                                                        onMouseDown={(event) => event.preventDefault()}
                                                        onClick={() => {
                                                            setQuery(item)
                                                            submitSearch(item)
                                                        }}
                                                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white transition hover:bg-white/[0.05]"
                                                    >
                                                        <Search size={15} className="text-slate-400" />
                                                        <span className="truncate">{item}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {hasSearch && (
                                <div className="flex flex-wrap gap-2">
                                    {FILTERS.map((filter) => {
                                        const Icon = filter.icon
                                        const active = activeFilter === filter.key
                                        return (
                                            <motion.button
                                                key={filter.key}
                                                type="button"
                                                whileHover={{ y: -1 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => setActiveFilter(filter.key)}
                                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${
                                                    active
                                                        ? "border-cyan-300/22 bg-cyan-300/12 text-white"
                                                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                                                }`}
                                            >
                                                <Icon size={14} />
                                                {filter.label}
                                            </motion.button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.section>

                    <div className={`relative z-10 flex w-full min-h-0 flex-1 ${hasSearch ? "mt-4" : "mt-8"}`}>
                        <div
                            className={`w-full min-h-0 p-1 sm:p-2 ${
                                hasSearch && shouldScrollResults ? "overflow-y-auto" : "overflow-hidden"
                            }`}
                        >
                            {!hasSearch ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4 }}
                                    className="flex h-full min-h-[360px] items-center justify-center pb-20 sm:min-h-[420px]"
                                >
                                    <div className="mx-auto max-w-sm text-center">
                                        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_48px_rgba(3,7,18,0.18)]">
                                            <Search size={28} />
                                        </div>
                                        <p className="text-lg font-semibold text-white">Start searching</p>
                                        <p className="mt-3 text-sm leading-6 text-slate-300/78">
                                            Search movies, creators, or playlists in a clean cinematic flow.
                                        </p>
                                    </div>
                                </motion.div>
                            ) : loading ? (
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {Array.from({ length: 6 }).map((_, index) => (
                                        <div
                                            key={`search-skeleton-${index}`}
                                            className="overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.04] p-3"
                                        >
                                            <div className="relative h-44 overflow-hidden rounded-[20px] bg-white/8">
                                                <motion.div
                                                    className="absolute inset-0 bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.12)_50%,transparent_80%)]"
                                                    animate={{ x: ["-120%", "140%"] }}
                                                    transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                                                />
                                            </div>
                                            <div className="mt-4 space-y-3">
                                                <div className="h-4 w-20 rounded-full bg-white/10" />
                                                <div className="h-5 w-4/5 rounded-full bg-white/10" />
                                                <div className="h-4 w-2/3 rounded-full bg-white/10" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : filteredResults.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.35 }}
                                    className="flex h-full min-h-[260px] items-center justify-center"
                                >
                                    <div className="text-center">
                                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-fuchsia-100">
                                            <Search size={24} />
                                        </div>
                                        <p className="text-base font-medium text-white">No matches found</p>
                                        <p className="mt-2 text-sm text-slate-400">
                                            Try another title, creator name, or a shorter keyword.
                                        </p>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    layout
                                    className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                                >
                                    <AnimatePresence mode="popLayout">
                                        {filteredResults.map((video, index) => (
                                            <motion.div
                                                layout
                                                key={video.publicId || video.id || `result-${index}`}
                                                role="button"
                                                tabIndex={0}
                                                initial={{ opacity: 0, y: 16 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 12 }}
                                                transition={{ delay: index * 0.03, duration: 0.28 }}
                                                whileHover={{ y: -6 }}
                                                onMouseEnter={() => prefetchMedia(video.signedUrl)}
                                                onFocus={() => prefetchMedia(video.signedUrl)}
                                                onClick={() => {
                                                    const id = video.publicId ?? String(video.id ?? "")
                                                    if (!id) return
                                                    prefetchMedia(video.signedUrl)
                                                    navigate(video.orientation === "PORTRAIT" ? `/portrait/${id}` : `/video/${id}`, {
                                                        state: { video }
                                                    })
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key !== "Enter" && event.key !== " ") return
                                                    event.preventDefault()
                                                    const id = video.publicId ?? String(video.id ?? "")
                                                    if (!id) return
                                                    prefetchMedia(video.signedUrl)
                                                    navigate(video.orientation === "PORTRAIT" ? `/portrait/${id}` : `/video/${id}`, {
                                                        state: { video }
                                                    })
                                                }}
                                                className="group overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] text-left shadow-[0_12px_36px_rgba(4,10,24,0.22)] transition hover:border-white/16 hover:bg-white/[0.06]"
                                            >
                                                <div className="relative overflow-hidden rounded-[20px] m-3 mb-0">
                                                    <img
                                                        src={getThumbnail(video)}
                                                        alt={getTitle(video)}
                                                        onError={(event) => {
                                                            event.currentTarget.src = "/placeholder.jpg"
                                                        }}
                                                        className={`w-full object-cover transition duration-500 group-hover:scale-105 ${video.orientation === "PORTRAIT" ? "h-56" : "h-40"}`}
                                                    />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                                                    <div className="absolute left-3 top-3 rounded-full border border-white/14 bg-black/34 px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.22em] text-white">
                                                        {getDuration(video)}
                                                    </div>
                                                    <div className="absolute right-3 bottom-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-white/10 text-white opacity-0 backdrop-blur-xl transition group-hover:opacity-100">
                                                        <Play size={16} className="ml-0.5" />
                                                    </div>
                                                </div>

                                                <div className="space-y-3 p-4">
                                                    <div>
                                                        <p className="line-clamp-2 text-[1rem] font-medium text-white">
                                                            {getTitle(video)}
                                                        </p>
                                                        <p className="mt-1 text-sm text-slate-400">
                                                            {getChannel(video)} • {formatRelativeTime(video.createdAt)}
                                                        </p>
                                                    </div>

                                                    <p className="line-clamp-2 text-sm leading-6 text-slate-300/72">
                                                        {video.aiDescription?.trim() || "A clean cinematic result surfaced from your library."}
                                                    </p>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

export default SearchPage
