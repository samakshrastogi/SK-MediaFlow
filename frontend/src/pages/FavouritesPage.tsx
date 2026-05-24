import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Heart, Play, Sparkles } from "lucide-react"
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
const getThumbnail = (video: Video) =>
    video.thumbnailKey
        ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}`
        : "/placeholder.jpg"

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
    const cachedVideos = getCachedPageData<Video[]>("page:favorites")

    const [videos, setVideos] = useState<Video[]>(cachedVideos || [])
    const [loading, setLoading] = useState(!cachedVideos)

    useEffect(() => {
        const fetchFavorites = async () => {
            try {
                const res = await api.get("/video-actions/favorites")
                setVideos(res.data)
                setCachedPageData("page:favorites", res.data, 120000)
            } catch {
                setVideos(cachedVideos || [])
            } finally {
                setLoading(false)
            }
        }

        void fetchFavorites()
    }, [])

    const shouldScroll = videos.length > 8

    return (
        <AppLayout>
            <div className="flex h-[calc(100vh-8rem)] min-h-[620px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,#070b18_0%,#0b1020_58%,#090614_100%)] shadow-[0_24px_100px_rgba(3,7,18,0.55)]">
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[30px]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(74,87,255,0.16),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.12),transparent_24%),linear-gradient(180deg,transparent,rgba(6,8,18,0.22))]" />
                    <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(rgba(255,255,255,0.35)_0.8px,transparent_0.8px)] [background-size:22px_22px]" />
                </div>

                <div className="relative z-10 flex h-full flex-col px-4 py-4 sm:px-6 sm:py-5">
                    <motion.section
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="w-full rounded-[28px] border border-white/10 bg-white/[0.05] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:px-6"
                    >
                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.28em] text-slate-300/72">
                                <Heart size={13} className="text-fuchsia-200" />
                                Saved
                            </div>
                            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl [font-family:'Inter_Tight','Satoshi',sans-serif]">
                                <span className="bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-transparent">
                                    Favourite Videos
                                </span>
                            </h1>
                            <p className="text-sm text-slate-300/68 sm:text-[0.95rem]">
                                Videos you love, saved in one clean premium library.
                            </p>
                            {!loading && videos.length > 0 && (
                                <p className="text-xs text-slate-400">
                                    {videos.length} saved videos
                                </p>
                            )}
                        </div>
                    </motion.section>

                    <div className="mt-4 flex w-full min-h-0 flex-1">
                        <div
                            className={`w-full min-h-0 rounded-[28px] border border-white/8 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:p-5 ${
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
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {videos.map((video, index) => {
                                        const id = video.publicId ?? String(video.id)
                                        const progress = typeof video.progress === "number"
                                            ? Math.max(8, Math.min(100, video.progress))
                                            : 18 + (stableHash(video.publicId || video.id || getTitle(video)) % 52)

                                        return (
                                            <motion.button
                                                key={video.publicId || video.id}
                                                type="button"
                                                initial={{ opacity: 0, y: 14 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.03, duration: 0.28 }}
                                                whileHover={{ y: -4 }}
                                                onMouseEnter={() => prefetchMedia(video.signedUrl)}
                                                onFocus={() => prefetchMedia(video.signedUrl)}
                                                onClick={() => {
                                                    prefetchMedia(video.signedUrl)
                                                    navigate(video.orientation === "PORTRAIT" ? `/portrait/${id}` : `/video/${id}`, {
                                                        state: { video }
                                                    })
                                                }}
                                                className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] text-left shadow-[0_12px_36px_rgba(4,10,24,0.22)] transition hover:border-white/16 hover:bg-white/[0.06]"
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
                                            </motion.button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

export default FavouritesPage
