import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Clock3, ListVideo, Play, Sparkles } from "lucide-react"
import { useNavigate } from "react-router-dom"

import AppLayout from "@/layouts/AppLayout"
import { api } from "@/api/axios"
import { getCachedPageData, setCachedPageData } from "@/utils/pageCache"

interface Video {
    id?: string
    publicId?: string
    title?: string
    aiTitle?: string
    aiDescription?: string
    thumbnailKey?: string
    uploaderName?: string
    createdAt?: string
    orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
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
    const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)

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

    const selectedPlaylist = useMemo(
        () => playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null,
        [playlists, selectedPlaylistId]
    )

    const shouldScroll = playlists.length > 6 || Boolean(selectedPlaylist)

    useEffect(() => {
        if (!selectedPlaylistId) return
        if (!playlists.some((playlist) => playlist.id === selectedPlaylistId)) {
            setSelectedPlaylistId(null)
        }
    }, [playlists, selectedPlaylistId])

    const openVideo = (video: Video) => {
        const id = video.publicId ?? String(video.id ?? "")
        if (!id) return

        navigate(video.orientation === "PORTRAIT" ? `/portrait/${id}` : `/video/${id}`, {
            state: { video }
        })
    }

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
                        <div>
                            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl [font-family:'Inter_Tight','Satoshi',sans-serif]">
                                <span className="bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-transparent">
                                    My Playlists
                                </span>
                            </h1>
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
                                <div className="space-y-5">
                                    {selectedPlaylist ? (
                                        <motion.section
                                            initial={{ opacity: 0, y: 12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.28 }}
                                            className="overflow-hidden rounded-[24px] border border-cyan-200/16 bg-[linear-gradient(135deg,rgba(34,211,238,0.1),rgba(124,58,237,0.08),rgba(255,255,255,0.035))] shadow-[0_18px_50px_rgba(4,10,24,0.26)]"
                                        >
                                            <div className="flex flex-col gap-3 border-b border-white/8 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/62">
                                                        Selected Playlist
                                                    </p>
                                                    <h2 className="mt-1 text-xl font-semibold text-white">
                                                        {selectedPlaylist.name}
                                                    </h2>
                                                    <p className="mt-1 text-sm text-slate-400">
                                                        Select a video below to start playback.
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-slate-300">
                                                        {selectedPlaylist.videos.length} videos
                                                    </span>
                                                    {selectedPlaylist.videos[0] ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openVideo(selectedPlaylist.videos[0])}
                                                            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"
                                                        >
                                                            <Play size={15} />
                                                            Play first
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>

                                            {selectedPlaylist.videos.length === 0 ? (
                                                <div className="px-4 py-8 text-center text-sm text-slate-400">
                                                    This playlist has no videos yet.
                                                </div>
                                            ) : (
                                                <div className="grid gap-3 p-4 md:grid-cols-2">
                                                    {selectedPlaylist.videos.map((video) => (
                                                        <button
                                                            key={video.publicId ?? video.id}
                                                            type="button"
                                                            onClick={() => openVideo(video)}
                                                            className="group flex min-w-0 gap-3 rounded-[18px] border border-white/8 bg-black/18 p-2.5 text-left transition hover:border-cyan-200/24 hover:bg-white/[0.07]"
                                                        >
                                                            <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-[14px] bg-white/[0.05] sm:h-24 sm:w-40">
                                                                <img
                                                                    src={getThumbnail(video)}
                                                                    alt={getTitle(video)}
                                                                    onError={(event) => {
                                                                        event.currentTarget.src = "/placeholder-thumbnail.png"
                                                                    }}
                                                                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                                                />
                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/48 via-transparent to-transparent" />
                                                                <span className="absolute bottom-2 left-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-950 shadow-lg">
                                                                    <Play size={13} className="ml-0.5 fill-current" />
                                                                </span>
                                                            </div>

                                                            <div className="min-w-0 flex-1 py-1">
                                                                <p className="line-clamp-2 text-sm font-semibold leading-5 text-white sm:text-base">
                                                                    {getTitle(video)}
                                                                </p>
                                                                <p className="mt-1 truncate text-xs text-slate-400">
                                                                    {video.channel?.name || video.uploaderName || "Unknown channel"}
                                                                </p>
                                                                <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-cyan-100/54">
                                                                    {video.orientation === "PORTRAIT" ? "Portrait" : "Video"}
                                                                </p>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </motion.section>
                                    ) : null}

                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {playlists.map((playlist, index) => (
                                        <motion.div
                                            key={playlist.id}
                                            initial={{ opacity: 0, y: 14 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.03, duration: 0.28 }}
                                            whileHover={{ y: -4 }}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setSelectedPlaylistId(playlist.id)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault()
                                                    setSelectedPlaylistId(playlist.id)
                                                }
                                            }}
                                            className={`cursor-pointer overflow-hidden rounded-[24px] border bg-white/[0.04] shadow-[0_12px_36px_rgba(4,10,24,0.22)] transition hover:border-white/16 hover:bg-white/[0.06] ${
                                                selectedPlaylistId === playlist.id
                                                    ? "border-cyan-200/40 ring-1 ring-cyan-200/20"
                                                    : "border-white/10"
                                            }`}
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
                                                            onClick={(event) => {
                                                                event.stopPropagation()
                                                                setSelectedPlaylistId(playlist.id)
                                                            }}
                                                            className="inline-flex items-center gap-1.5 text-white/85 transition hover:text-white"
                                                        >
                                                            <Play size={13} />
                                                            View
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
