import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ChevronDown, Heart, ListVideo, Play, Sparkles, Trash2 } from "lucide-react"
import { useNavigate } from "react-router-dom"

import AppLayout from "@/layouts/AppLayout"
import { api } from "@/api/axios"
import { getCachedPageData, setCachedPageData } from "@/utils/pageCache"
import { prefetchMedia } from "@/utils/media"

interface Video {
    id: string
    publicId?: string
    title: string
    aiTitle?: string
    aiDescription?: string
    thumbnailKey?: string
    uploaderName?: string
    createdAt?: string
    progress?: number
    signedUrl?: string
    orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
    channel?: {
        name?: string
    }
}

const stableHash = (value?: string) =>
    Array.from(String(value ?? "")).reduce((total, char) => total + char.charCodeAt(0), 0)

const getTitle = (video: Video) => video.aiTitle?.trim() || video.title?.trim() || "Untitled"
const getChannel = (video: Video) => video.channel?.name?.trim() || video.uploaderName?.trim() || "Unknown channel"
const getVideoKey = (video: Video) => video.publicId ?? video.id ?? ""
const getThumbnail = (video: Video) =>
    video.thumbnailKey
        ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}`
        : "/placeholder.jpg"

const getUniqueVideos = (items: Video[] = []) => {
    const unique = new Map<string, Video>()

    items.forEach((video) => {
        const key = getVideoKey(video)
        if (key && !unique.has(key)) {
            unique.set(key, video)
        }
    })

    return Array.from(unique.values())
}

const getRelativeTime = (date?: string) => {
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

const FavouritesPage = () => {
    const navigate = useNavigate()
    const cachedPageVideos = getCachedPageData<Video[]>("page:favorites")
    const cachedVideos = getUniqueVideos(cachedPageVideos || [])

    const [videos, setVideos] = useState<Video[]>(cachedVideos)
    const [loading, setLoading] = useState(!cachedPageVideos)
    const [deleteMenuOpen, setDeleteMenuOpen] = useState(false)
    const [selectingVideos, setSelectingVideos] = useState(false)
    const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(() => new Set())
    const [message, setMessage] = useState("")

    useEffect(() => {
        const fetchFavorites = async () => {
            try {
                const res = await api.get("/video-actions/favorites")
                const uniqueVideos = getUniqueVideos(res.data)
                setVideos(uniqueVideos)
                setCachedPageData("page:favorites", uniqueVideos, 120000)
            } catch {
                setVideos(cachedVideos)
            } finally {
                setLoading(false)
            }
        }

        void fetchFavorites()
    }, [])

    const shouldScroll = videos.length > 8

    const openVideo = (video: Video) => {
        const id = getVideoKey(video)
        if (!id) return

        prefetchMedia(video.signedUrl)
        navigate(video.orientation === "PORTRAIT" ? `/portrait/${id}` : `/video/${id}`, {
            state: { video }
        })
    }

    const updateVideos = (updater: (current: Video[]) => Video[]) => {
        setVideos((current) => {
            const next = getUniqueVideos(updater(current))
            setCachedPageData("page:favorites", next, 120000)
            return next
        })
    }

    const toggleSelectedVideo = (video: Video) => {
        const id = getVideoKey(video)
        if (!id) return

        setSelectedVideoIds((current) => {
            const next = new Set(current)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const removeSelectedVideos = async () => {
        if (selectedVideoIds.size === 0) return

        const videosToRemove = videos.filter((video) => selectedVideoIds.has(getVideoKey(video)))
        if (videosToRemove.length === 0) return

        try {
            await Promise.all(
                videosToRemove.map((video) => api.delete(`/video-actions/favorites/${encodeURIComponent(getVideoKey(video))}`))
            )
            const removedIds = new Set(videosToRemove.map(getVideoKey))
            updateVideos((current) => current.filter((video) => !removedIds.has(getVideoKey(video))))
            setSelectedVideoIds(new Set())
            setSelectingVideos(false)
            setMessage(videosToRemove.length === 1 ? "Video removed from favourites." : "Videos removed from favourites.")
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to remove selected videos.")
        }
    }

    useEffect(() => {
        if (!message) return

        const timer = window.setTimeout(() => {
            setMessage("")
        }, 2200)

        return () => window.clearTimeout(timer)
    }, [message])

    return (
        <AppLayout>
            <div className="relative flex min-h-[calc(100dvh-5rem)] flex-col md:min-h-[calc(100dvh-7.5rem)]">
                <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5">
                    <motion.section
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="w-full px-1 py-2 sm:px-2"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl [font-family:'Inter_Tight','Satoshi',sans-serif]">
                                <span className="bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-transparent">
                                    Favourite Videos
                                </span>
                            </h1>

                            {videos.length > 0 ? (
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setDeleteMenuOpen((open) => !open)}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-rose-300/20 bg-rose-500/12 text-rose-100 transition hover:bg-rose-500/18"
                                        aria-label="Open delete menu"
                                        title="Delete"
                                    >
                                        {deleteMenuOpen ? <ChevronDown size={18} className="rotate-180 transition" /> : <Trash2 size={18} />}
                                    </button>

                                    {deleteMenuOpen ? (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-white/12 bg-[#15112d] p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.36)] backdrop-blur-xl">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDeleteMenuOpen(false)
                                                    setSelectingVideos(true)
                                                    setSelectedVideoIds(new Set())
                                                }}
                                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-white transition hover:bg-white/[0.08]"
                                            >
                                                <ListVideo size={15} />
                                                Select videos
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </motion.section>

                    <div className="mt-4 flex w-full min-h-0 flex-1">
                        <div
                            className={`w-full min-h-0 p-1 sm:p-2 ${
                                shouldScroll ? "overflow-y-auto" : "overflow-hidden"
                            }`}
                        >
                            {loading ? (
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {Array.from({ length: 6 }).map((_, index) => (
                                        <div
                                            key={`favorite-skeleton-${index}`}
                                            className="overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.04] p-3"
                                        >
                                            <div className="h-40 rounded-[18px] bg-white/8" />
                                            <div className="mt-4 space-y-3">
                                                <div className="h-4 w-20 rounded-full bg-white/10" />
                                                <div className="h-5 w-4/5 rounded-full bg-white/10" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : videos.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.35 }}
                                    className="flex h-full min-h-[280px] items-center justify-center"
                                >
                                    <div className="text-center">
                                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-fuchsia-100">
                                            <Heart size={24} />
                                        </div>
                                        <p className="text-base font-medium text-white">No favorites yet</p>
                                        <p className="mt-2 text-sm text-slate-400">
                                            Save videos to build your collection.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => navigate("/search")}
                                            className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]"
                                        >
                                            <Sparkles size={15} />
                                            Explore content
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="space-y-4">
                                    {selectingVideos ? (
                                        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/16 p-3 sm:flex-row sm:items-center sm:justify-between">
                                            <p className="text-sm text-slate-300">
                                                Select videos to remove from favourites.
                                            </p>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectingVideos(false)
                                                        setSelectedVideoIds(new Set())
                                                    }}
                                                    className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white transition hover:bg-white/[0.1]"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void removeSelectedVideos()}
                                                    disabled={selectedVideoIds.size === 0}
                                                    className="rounded-full bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/45"
                                                >
                                                    Delete selected ({selectedVideoIds.size})
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        {videos.map((video, index) => {
                                            const id = getVideoKey(video)
                                            const checked = selectedVideoIds.has(id)
                                            const progress = typeof video.progress === "number"
                                                ? Math.max(8, Math.min(100, video.progress))
                                                : 18 + (stableHash(video.publicId || video.id || getTitle(video)) % 52)

                                            return (
                                                <motion.div
                                                    key={id}
                                                    role="button"
                                                    tabIndex={0}
                                                    initial={{ opacity: 0, y: 14 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: index * 0.03, duration: 0.28 }}
                                                    whileHover={{ y: -4 }}
                                                    onMouseEnter={() => prefetchMedia(video.signedUrl)}
                                                    onFocus={() => prefetchMedia(video.signedUrl)}
                                                    onClick={() => openVideo(video)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter" || event.key === " ") {
                                                            event.preventDefault()
                                                            openVideo(video)
                                                        }
                                                    }}
                                                    className={`cursor-pointer overflow-hidden rounded-[24px] border bg-white/[0.04] text-left shadow-[0_12px_36px_rgba(4,10,24,0.22)] transition hover:border-white/16 hover:bg-white/[0.06] ${
                                                        checked ? "border-cyan-200/40 ring-1 ring-cyan-200/20" : "border-white/10"
                                                    }`}
                                                >
                                                    <div className="relative overflow-hidden rounded-[20px] m-3 mb-0">
                                                        <img
                                                            src={getThumbnail(video)}
                                                            alt={getTitle(video)}
                                                            onError={(event) => {
                                                                event.currentTarget.src = "/placeholder.jpg"
                                                            }}
                                                            className={`w-full object-cover transition duration-500 group-hover:scale-[1.02] ${video.orientation === "PORTRAIT" ? "h-52" : "h-40"}`}
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                                                        <div className="absolute left-3 top-3 rounded-full border border-white/14 bg-black/34 px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.22em] text-white">
                                                            Favorite
                                                        </div>
                                                        {selectingVideos ? (
                                                            <label
                                                                className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/45 p-2 text-white backdrop-blur-md transition hover:bg-black/60"
                                                                onClick={(event) => event.stopPropagation()}
                                                                title="Select video"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => toggleSelectedVideo(video)}
                                                                    className="h-4 w-4 accent-cyan-300"
                                                                />
                                                            </label>
                                                        ) : null}
                                                        <div className="absolute right-3 bottom-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-white/10 text-white backdrop-blur-xl">
                                                            <Play size={15} className="ml-0.5" />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3 p-4">
                                                        <div>
                                                            <p className="line-clamp-2 text-[1rem] font-medium text-white">
                                                                {getTitle(video)}
                                                            </p>
                                                            <p className="mt-1 text-sm text-slate-400">
                                                                {getChannel(video)} • {getRelativeTime(video.createdAt)}
                                                            </p>
                                                        </div>

                                                        <div className="h-1 overflow-hidden rounded-full bg-white/8">
                                                            <div
                                                                className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400"
                                                                style={{ width: `${progress}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {message ? (
                <div className="pointer-events-none fixed left-1/2 top-24 z-[90] w-[calc(100vw-2rem)] max-w-xs -translate-x-1/2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                    {message}
                </div>
            ) : null}
        </AppLayout>
    )
}

export default FavouritesPage
