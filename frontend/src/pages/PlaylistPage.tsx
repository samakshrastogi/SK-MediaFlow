import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, ChevronDown, Clock3, ListVideo, Sparkles, Trash2 } from "lucide-react"
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

const getVideoKey = (video: Video) => video.publicId ?? video.id ?? ""

const PlaylistPage = () => {
    const navigate = useNavigate()
    const cachedPlaylists = getCachedPageData<Playlist[]>("page:playlists")

    const [playlists, setPlaylists] = useState<Playlist[]>(cachedPlaylists || [])
    const [loading, setLoading] = useState(!cachedPlaylists)
    const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
    const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null)
    const [deleteMenuOpen, setDeleteMenuOpen] = useState(false)
    const [selectingVideos, setSelectingVideos] = useState(false)
    const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(() => new Set())
    const [message, setMessage] = useState("")

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

    useEffect(() => {
        setDeleteMenuOpen(false)
        setSelectingVideos(false)
        setSelectedVideoIds(new Set())
    }, [selectedPlaylistId])

    const openVideo = (video: Video) => {
        const id = video.publicId ?? String(video.id ?? "")
        if (!id) return

        navigate(video.orientation === "PORTRAIT" ? `/portrait/${id}` : `/video/${id}`, {
            state: { video }
        })
    }

    const updatePlaylists = (updater: (current: Playlist[]) => Playlist[]) => {
        setPlaylists((current) => {
            const next = updater(current)
            setCachedPageData("page:playlists", next, 120000)
            return next
        })
    }

    const deletePlaylist = async () => {
        if (!playlistToDelete) return

        try {
            await api.delete(`/video-actions/playlists/${playlistToDelete.id}`)
            updatePlaylists((current) => current.filter((playlist) => playlist.id !== playlistToDelete.id))
            if (selectedPlaylistId === playlistToDelete.id) {
                setSelectedPlaylistId(null)
            }
            setMessage("Playlist deleted.")
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Failed to delete playlist.")
        } finally {
            setPlaylistToDelete(null)
        }
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
        if (!selectedPlaylist || selectedVideoIds.size === 0) return

        const videosToRemove = selectedPlaylist.videos.filter((video) => selectedVideoIds.has(getVideoKey(video)))
        if (videosToRemove.length === 0) return

        try {
            await Promise.all(
                videosToRemove.map((video) =>
                    api.delete(`/video-actions/playlists/${selectedPlaylist.id}/videos/${getVideoKey(video)}`)
                )
            )
            const removedIds = new Set(videosToRemove.map(getVideoKey))
            updatePlaylists((current) =>
                current.map((playlist) =>
                    playlist.id === selectedPlaylist.id
                        ? {
                            ...playlist,
                            videos: playlist.videos.filter((video) => !removedIds.has(getVideoKey(video)))
                        }
                        : playlist
                )
            )
            setSelectedVideoIds(new Set())
            setSelectingVideos(false)
            setMessage(videosToRemove.length === 1 ? "Video removed from playlist." : "Videos removed from playlist.")
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
                            ) : selectedPlaylist ? (
                                <motion.section
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.28 }}
                                    className="overflow-hidden rounded-[24px] border border-cyan-200/16 bg-[linear-gradient(135deg,rgba(34,211,238,0.1),rgba(124,58,237,0.08),rgba(255,255,255,0.035))] shadow-[0_18px_50px_rgba(4,10,24,0.26)]"
                                >
                                    <div className="space-y-4 border-b border-white/8 px-4 py-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedPlaylistId(null)}
                                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.09]"
                                                aria-label="Back to playlists"
                                                title="Back"
                                            >
                                                <ArrowLeft size={18} />
                                            </button>

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
                                                            setPlaylistToDelete(selectedPlaylist)
                                                        }}
                                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-rose-100 transition hover:bg-rose-500/14"
                                                    >
                                                        <Trash2 size={15} />
                                                        Delete playlist
                                                    </button>
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
                                        </div>

                                        <div className="min-w-0">
                                            <h2 className="truncate text-xl font-semibold text-white">
                                                {selectedPlaylist.name}
                                            </h2>
                                            <p className="mt-1 text-sm text-slate-400">
                                                {selectedPlaylist.videos.length} videos
                                            </p>
                                        </div>
                                    </div>

                                    {selectedPlaylist.videos.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-sm text-slate-400">
                                            This playlist has no videos yet.
                                        </div>
                                    ) : (
                                        <div className="space-y-4 p-4">
                                            {selectingVideos ? (
                                                <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/16 p-3 sm:flex-row sm:items-center sm:justify-between">
                                                    <p className="text-sm text-slate-300">
                                                        Select videos to remove from this playlist.
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

                                            <div className="grid gap-3 md:grid-cols-2">
                                                {selectedPlaylist.videos.map((video) => {
                                                    const videoKey = getVideoKey(video)
                                                    const checked = selectedVideoIds.has(videoKey)

                                                    return (
                                                        <div
                                                            key={videoKey}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => openVideo(video)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === "Enter" || event.key === " ") {
                                                                    event.preventDefault()
                                                                    openVideo(video)
                                                                }
                                                            }}
                                                            className={`group flex min-w-0 cursor-pointer gap-3 rounded-[18px] border bg-black/18 p-2.5 text-left transition hover:border-cyan-200/24 hover:bg-white/[0.07] ${
                                                                checked ? "border-cyan-200/40 ring-1 ring-cyan-200/20" : "border-white/8"
                                                            }`}
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

                                                            {selectingVideos ? (
                                                                <label
                                                                    className="self-start rounded-full border border-white/15 bg-white/[0.08] p-2 transition hover:bg-white/[0.12]"
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
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </motion.section>
                            ) : (
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
                                                    <span className="text-cyan-100/60">Open playlist</span>
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
            {message ? (
                <div className="pointer-events-none fixed left-1/2 top-24 z-[90] w-[calc(100vw-2rem)] max-w-xs -translate-x-1/2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                    {message}
                </div>
            ) : null}
            {playlistToDelete ? (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-[28px] border border-white/12 bg-[#121028] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                        <p className="text-lg font-semibold">Delete playlist?</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                            This will remove "{playlistToDelete.name}" and all saved videos inside it from your playlist library.
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setPlaylistToDelete(null)}
                                className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.1]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void deletePlaylist()}
                                className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </AppLayout>
    )
}

export default PlaylistPage
