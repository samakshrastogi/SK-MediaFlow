import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Clock3, ListVideo, Play, Sparkles } from "lucide-react"
import { useNavigate } from "react-router-dom"

import AppLayout from "@/layouts/AppLayout"
import { api } from "@/api/axios"
import { getCachedPageData, setCachedPageData } from "@/utils/pageCache"

interface Video {
    id: string
    publicId?: string
    title?: string
    aiTitle?: string
    aiDescription?: string
    thumbnailKey?: string
    uploaderName?: string
    channel?: {
        name?: string
    }
}

interface Playlist {
    id: string
    name: string
    videos: Video[]
}

const stableHash = (value?: string) =>
    Array.from(String(value ?? "")).reduce((total, char) => total + char.charCodeAt(0), 0)

const getTitle = (video: Video) => video.aiTitle?.trim() || video.title?.trim() || "Untitled"

const getThumbnail = (video?: Video) =>
    video?.thumbnailKey
        ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}`
        : "/placeholder-thumbnail.png"

const getUpdatedLabel = (playlist: Playlist) => {
    const hours = (stableHash(`${playlist.id}${playlist.name}`) % 18) + 1
    return `${hours}h ago`
}

const getProgress = (playlist: Playlist) => 18 + (stableHash(`${playlist.name}${playlist.id}`) % 62)

const PlaylistPage = () => {
    const navigate = useNavigate()
    const cachedPlaylists = getCachedPageData<Playlist[]>("page:playlists")

    const [playlists, setPlaylists] = useState<Playlist[]>(cachedPlaylists || [])
    const [loading, setLoading] = useState(!cachedPlaylists)

    useEffect(() => {
        const fetchPlaylists = async () => {
            try {
                const res = await api.get("/video-actions/playlists-with-videos")
                setPlaylists(res.data)
                setCachedPageData("page:playlists", res.data, 120000)
            } catch {
                setPlaylists(cachedPlaylists || [])
            } finally {
                setLoading(false)
            }
        }

        void fetchPlaylists()
    }, [])

    const shouldScroll = playlists.length > 6

    const totalVideos = useMemo(
        () => playlists.reduce((count, playlist) => count + playlist.videos.length, 0),
        [playlists]
    )

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
                                <ListVideo size={13} className="text-cyan-200" />
                                Library
                            </div>
                            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl [font-family:'Inter_Tight','Satoshi',sans-serif]">
                                <span className="bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-transparent">
                                    My Playlists
                                </span>
                            </h1>
                            <p className="text-sm text-slate-300/68 sm:text-[0.95rem]">
                                Organize saved videos in a clean cinematic collection.
                            </p>
                            {!loading && playlists.length > 0 && (
                                <p className="text-xs text-slate-400">
                                    {playlists.length} playlists • {totalVideos} videos
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
                                            key={`playlist-skeleton-${index}`}
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
                            ) : playlists.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.35 }}
                                    className="flex h-full min-h-[280px] items-center justify-center"
                                >
                                    <div className="text-center">
                                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-cyan-100">
                                            <ListVideo size={24} />
                                        </div>
                                        <p className="text-base font-medium text-white">No playlists yet</p>
                                        <p className="mt-2 text-sm text-slate-400">
                                            Create your first playlist to start building your collection.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => navigate("/search")}
                                            className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-white transition hover:bg-white/[0.1]"
                                        >
                                            <Sparkles size={15} />
                                            Discover content
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {playlists.map((playlist, index) => (
                                        <motion.div
                                            key={playlist.id}
                                            initial={{ opacity: 0, y: 14 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.03, duration: 0.28 }}
                                            whileHover={{ y: -4 }}
                                            className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] shadow-[0_12px_36px_rgba(4,10,24,0.22)] transition hover:border-white/16 hover:bg-white/[0.06]"
                                        >
                                            <div className="relative overflow-hidden rounded-[20px] m-3 mb-0 grid h-40 grid-cols-2 gap-2">
                                                {[0, 1, 2, 3].map((slot) => {
                                                    const slotVideo = playlist.videos[slot]

                                                    if (!slotVideo) {
                                                        return (
                                                            <div
                                                                key={`${playlist.id}-${slot}`}
                                                                className="h-full w-full rounded-[16px] bg-white/[0.04]"
                                                            />
                                                        )
                                                    }

                                                    return (
                                                        <img
                                                            key={`${playlist.id}-${slot}`}
                                                            src={getThumbnail(slotVideo)}
                                                            alt={getTitle(slotVideo)}
                                                            onError={(event) => {
                                                                event.currentTarget.src = "/placeholder-thumbnail.png"
                                                            }}
                                                            className="h-full w-full rounded-[16px] object-cover transition duration-500 hover:scale-[1.02]"
                                                        />
                                                    )
                                                })}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                                            </div>

                                            <div className="space-y-3 p-4">
                                                <div>
                                                    <p className="line-clamp-2 text-[1rem] font-medium text-white">{playlist.name}</p>
                                                    <p className="mt-1 text-sm text-slate-400">
                                                        {playlist.videos.length} videos
                                                    </p>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-slate-400">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <Clock3 size={13} />
                                                        {getUpdatedLabel(playlist)}
                                                    </span>
                                                    {playlist.videos[0] && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const first = playlist.videos[0]
                                                                const id = first.publicId ?? String(first.id)
                                                                navigate(`/video/${id}`)
                                                            }}
                                                            className="inline-flex items-center gap-1.5 text-white/85 transition hover:text-white"
                                                        >
                                                            <Play size={13} />
                                                            Play
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="h-1 overflow-hidden rounded-full bg-white/8">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400"
                                                        style={{ width: `${getProgress(playlist)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

export default PlaylistPage
