import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { api } from "@/api/axios"
import Topbar from "@/components/Topbar"
import Sidebar from "@/components/Sidebar"
import { useAuth } from "@/context/AuthContext"
import UserAvatar from "@/components/UserAvatar"
import SharePopup from "@/components/SharePopup"

interface VideoDetail {
    id: string
    publicId: string
    title?: string
    aiTitle?: string
    aiDescription?: string
    signedUrl: string
    orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
    thumbnailKey?: string
    channel?: {
        name?: string
        username?: string
    }
    uploaderName?: string
    uploaderAvatarUrl?: string
    uploaderAvatarKey?: string
    createdAt?: string
}

interface Comment {
    id: string
    commentText: string
    username: string
    channelName?: string
    createdAt: string
}

interface Playlist {
    id: string
    name: string
}

const PortraitPlayer = () => {
    const { publicId } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()

    const [videos, setVideos] = useState<VideoDetail[]>([])
    const [loading, setLoading] = useState(true)
    const [activeIndex, setActiveIndex] = useState(0)

    const [likes, setLikes] = useState(0)
    const [dislikes, setDislikes] = useState(0)
    const [views, setViews] = useState(0)
    const [shares, setShares] = useState(0)
    const [subscribers, setSubscribers] = useState(0)
    const [subscribed, setSubscribed] = useState(false)
    const [liked, setLiked] = useState(false)
    const [disliked, setDisliked] = useState(false)
    const [comments, setComments] = useState<Comment[]>([])
    const [commentInput, setCommentInput] = useState("")
    const [shouldScroll, setShouldScroll] = useState(false)

    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [showPlaylist, setShowPlaylist] = useState(false)
    const [newPlaylistName, setNewPlaylistName] = useState("")
    const [showSharePopup, setShowSharePopup] = useState(false)
    const [descriptionExpanded, setDescriptionExpanded] = useState(false)
    const [descriptionOverflowing, setDescriptionOverflowing] = useState(false)
    const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null)

    const videoRef = useRef<HTMLVideoElement | null>(null)
    const commentsRef = useRef<HTMLDivElement | null>(null)
    const descriptionRef = useRef<HTMLParagraphElement | null>(null)
    const playlistMenuRef = useRef<HTMLDivElement | null>(null)
    const wheelLockRef = useRef(false)
    const touchStartYRef = useRef<number | null>(null)
    const watchedBufferRef = useRef(0)
    const watchIntervalRef = useRef<number | null>(null)

    const activeVideo = videos[activeIndex]

    useEffect(() => {
        const loadFeed = async () => {
            try {
                const res = await api.get("/video/portrait")
                const data = Array.isArray(res.data?.data) ? (res.data.data as VideoDetail[]) : []
                setVideos(data)
            } catch (error) {
                setVideos([])
            } finally {
                setLoading(false)
            }
        }

        loadFeed()
    }, [])

    useEffect(() => {
        if (!videos.length) return

        if (!publicId) {
            setActiveIndex(0)
            return
        }

        const index = videos.findIndex((v) => v.publicId === publicId)
        if (index >= 0) setActiveIndex(index)
    }, [videos, publicId])

    useEffect(() => {
        const active = videos[activeIndex]
        if (!active?.publicId) return
        navigate(`/portrait/${active.publicId}`, { replace: true })
    }, [activeIndex, videos, navigate])

    useEffect(() => {
        const el = videoRef.current
        if (!el) return

        el.currentTime = 0
        el.play().catch(() => undefined)
    }, [activeIndex])

    useEffect(() => {
        if (!activeVideo?.publicId) return
        void loadActions(activeVideo.publicId)
    }, [activeVideo?.publicId])

    useEffect(() => {
        setDescriptionExpanded(false)
        setVideoAspectRatio(null)
    }, [activeVideo?.publicId])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                showPlaylist &&
                playlistMenuRef.current &&
                !playlistMenuRef.current.contains(event.target as Node)
            ) {
                setShowPlaylist(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [showPlaylist])

    useEffect(() => {
        const loadPlaylists = async () => {
            try {
                const res = await api.get("/video-actions/playlists")
                setPlaylists(res.data || [])
            } catch (err) {
            }
        }

        loadPlaylists()
    }, [])

    useEffect(() => {
        if (shouldScroll && commentsRef.current) {
            commentsRef.current.scrollTop = commentsRef.current.scrollHeight
            setShouldScroll(false)
        }
    }, [comments, shouldScroll])

    const loadActions = async (pid: string) => {
        try {
            const res = await api.get(`/video-actions/video/${pid}`)
            setLikes(res.data.likes || 0)
            setDislikes(res.data.dislikes || 0)
            setViews(res.data.views || 0)
            setShares(res.data.shares || 0)
            setSubscribers(res.data.subscribers || 0)
            setSubscribed(Boolean(res.data.subscribed))
            setComments(res.data.comments || [])
            setLiked(res.data.userReaction === "LIKE")
            setDisliked(res.data.userReaction === "DISLIKE")
        } catch (err) {
        }
    }

    const goNext = () => {
        setActiveIndex((prev) => Math.min(prev + 1, videos.length - 1))
    }

    const goPrev = () => {
        setActiveIndex((prev) => Math.max(prev - 1, 0))
    }

    const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (wheelLockRef.current) return
        if (Math.abs(e.deltaY) < 10) return

        wheelLockRef.current = true
        if (e.deltaY > 0) goNext()
        else goPrev()

        window.setTimeout(() => {
            wheelLockRef.current = false
        }, 300)
    }

    const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        touchStartYRef.current = e.changedTouches[0]?.clientY ?? null
    }

    const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
        if (touchStartYRef.current === null) return

        const endY = e.changedTouches[0]?.clientY ?? touchStartYRef.current
        const deltaY = touchStartYRef.current - endY
        touchStartYRef.current = null

        if (Math.abs(deltaY) < 40) return
        if (deltaY > 0) goNext()
        else goPrev()
    }

    const timeAgo = (date?: string) => {
        if (!date) return "just now"

        const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
        const days = Math.floor(seconds / 86400)
        if (days > 0) return `${days} days ago`

        const hours = Math.floor(seconds / 3600)
        if (hours > 0) return `${hours} hours ago`

        const minutes = Math.floor(seconds / 60)
        if (minutes > 0) return `${minutes} minutes ago`

        return "just now"
    }

    const likeVideo = async () => {
        if (!activeVideo?.publicId) return

        await api.post("/video-actions/react", {
            publicId: activeVideo.publicId,
            type: "LIKE"
        })

        await loadActions(activeVideo.publicId)
    }

    const dislikeVideo = async () => {
        if (!activeVideo?.publicId) return

        await api.post("/video-actions/react", {
            publicId: activeVideo.publicId,
            type: "DISLIKE"
        })

        await loadActions(activeVideo.publicId)
    }

    const addVideoToPlaylist = async (playlistId: string) => {
        if (!activeVideo?.publicId) return

        await api.post("/video-actions/playlist", {
            publicId: activeVideo.publicId,
            playlistId
        })

        setShowPlaylist(false)
    }

    const createPlaylist = async () => {
        if (!newPlaylistName.trim()) return

        const res = await api.post("/video-actions/playlists", {
            name: newPlaylistName
        })

        setPlaylists([res.data, ...playlists])
        setNewPlaylistName("")
    }

    const submitComment = async () => {
        if (!activeVideo?.publicId || !commentInput.trim()) return

        await api.post("/video-actions/comment", {
            publicId: activeVideo.publicId,
            text: commentInput
        })

        setCommentInput("")
        setShouldScroll(true)

        await loadActions(activeVideo.publicId)
    }

    const shareVideo = async (method = "COPY_LINK", targetUrl?: string) => {
        if (!activeVideo?.publicId) return
        const videoLink = `${window.location.origin}/portrait/${activeVideo.publicId}`

        if (method === "COPY_LINK") {
            try {
                await navigator.clipboard.writeText(videoLink)
            } catch (error) {
            }
        } else if (method === "NATIVE" && "share" in navigator) {
            try {
                await navigator.share({
                    title: activeVideo.aiTitle || activeVideo.title,
                    url: videoLink
                })
            } catch (error) {
            }
        } else if (targetUrl) {
            window.open(targetUrl, "_blank", "noopener,noreferrer")
        }

        await api.post("/video-actions/share", {
            publicId: activeVideo.publicId,
            method
        })
        await loadActions(activeVideo.publicId)
        setShowSharePopup(false)
    }

    const toggleSubscribe = async () => {
        if (!activeVideo?.publicId) return
        await api.post("/video-actions/subscribe", { publicId: activeVideo.publicId })
        await loadActions(activeVideo.publicId)
    }

    useEffect(() => {
        if (!activeVideo?.publicId) return
        api.post("/video-actions/view", { publicId: activeVideo.publicId }).then((res) => {
            if (typeof res.data?.views === "number") setViews(res.data.views)
        }).catch(() => undefined)
    }, [activeVideo?.publicId])

    useEffect(() => {
        if (!activeVideo?.publicId) return

        const flushWatch = async (forceSeconds?: number) => {
            const watchedSeconds = Math.floor(forceSeconds ?? watchedBufferRef.current)
            if (!watchedSeconds) return
            watchedBufferRef.current = 0

            await api.post("/video-actions/watch-progress", {
                publicId: activeVideo.publicId,
                watchedSeconds,
                currentPositionSeconds: Math.floor(videoRef.current?.currentTime || 0)
            }).catch(() => undefined)
        }

        const startWatchTicker = () => {
            if (watchIntervalRef.current !== null) return
            watchIntervalRef.current = window.setInterval(() => {
                if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return
                watchedBufferRef.current += 1
                if (watchedBufferRef.current >= 5) {
                    void flushWatch()
                }
            }, 1000)
        }

        const stopWatchTicker = () => {
            if (watchIntervalRef.current !== null) {
                window.clearInterval(watchIntervalRef.current)
                watchIntervalRef.current = null
            }
            void flushWatch()
        }

        const el = videoRef.current
        if (!el) return

        el.addEventListener("play", startWatchTicker)
        el.addEventListener("pause", stopWatchTicker)
        el.addEventListener("ended", stopWatchTicker)

        return () => {
            el.removeEventListener("play", startWatchTicker)
            el.removeEventListener("pause", stopWatchTicker)
            el.removeEventListener("ended", stopWatchTicker)
            stopWatchTicker()
        }
    }, [activeVideo?.publicId])

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
                Loading...
            </div>
        )
    }

    if (!activeVideo) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
                No portrait videos found.
            </div>
        )
    }

    const title = activeVideo.aiTitle || activeVideo.title || "Untitled"
    const description = activeVideo.aiDescription?.trim() || "No description available."
    const fallbackAspectRatio =
        activeVideo.orientation === "SQUARE"
            ? 1
            : 9 / 16
    const resolvedAspectRatio = videoAspectRatio || fallbackAspectRatio

    useEffect(() => {
        const el = descriptionRef.current
        if (!el) return

        const updateOverflow = () => {
            setDescriptionOverflowing(el.scrollWidth > el.clientWidth + 1)
        }

        updateOverflow()
        window.addEventListener("resize", updateOverflow)
        return () => window.removeEventListener("resize", updateOverflow)
    }, [description, descriptionExpanded])

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-black text-white">
            <Topbar />
            <Sidebar />

            <main className="px-3 pt-[80px] pb-24 xl:px-6 2xl:px-8">
                <div className="grid w-full items-start gap-6 xl:gap-8 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)_120px]">
                    <section className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 space-y-5 h-fit shadow-lg">

                        {/* TITLE */}
                        <div className="space-y-2">
                            <h1 className="text-xl sm:text-2xl font-bold leading-tight text-white">
                                {title}
                            </h1>

                            <p className="text-xs text-gray-400">
                                {timeAgo(activeVideo.createdAt)} • {views.toLocaleString()} views
                            </p>
                        </div>

                        {/* CREATOR */}
                        <div className="flex items-center justify-between gap-3">

                            <div className="flex items-center gap-3">
                                <UserAvatar
                                    name={activeVideo.uploaderName || activeVideo.channel?.name}
                                    avatarUrl={activeVideo.uploaderAvatarUrl}
                                    avatarKey={activeVideo.uploaderAvatarKey}
                                    alt={activeVideo.channel?.name || "Uploader"}
                                />

                                <div>
                                    <p className="text-sm font-semibold text-white">
                                        {activeVideo.channel?.name || "Unknown channel"}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                        {subscribers > 0 ? `${subscribers} subscribers` : "New creator"}
                                    </p>
                                </div>
                            </div>

                            {/* SUBSCRIBE BUTTON */}
                            <button
                                onClick={toggleSubscribe}
                                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition shadow-sm ${subscribed
                                    ? "bg-white text-black"
                                    : "bg-purple-600 hover:bg-purple-500 text-white"
                                    }`}
                            >
                                {subscribed ? "Subscribed" : "Subscribe"}
                            </button>
                        </div>

                        {/* DESCRIPTION (COLLAPSIBLE READY) */}
                        <div className="space-y-1 text-sm text-gray-300">
                            <p
                                ref={descriptionRef}
                                className={`${descriptionExpanded ? "whitespace-pre-wrap" : "truncate"} leading-6`}
                            >
                                {description}
                            </p>
                            {descriptionOverflowing && (
                                <button
                                    onClick={() => setDescriptionExpanded((prev) => !prev)}
                                    className="text-xs font-medium text-purple-200 transition hover:text-white"
                                >
                                    {descriptionExpanded ? "See less" : "See more"}
                                </button>
                            )}
                        </div>

                        {/* ACTIONS */}
                        <div className="flex items-center gap-3 pt-2">

                            <button
                                onClick={() => setShowSharePopup(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border bg-white/10 border-white/10 hover:bg-white/20 transition"
                            >
                                ↗ Share
                                {shares > 0 && <span className="text-xs text-gray-300">{shares}</span>}
                            </button>

                        </div>

                    </section>

                    <section className="space-y-6">

                        {/* VIDEO PLAYER */}
                        <div
                            className="mx-auto w-full max-w-[640px]"
                            onWheel={onWheel}
                            onTouchStart={onTouchStart}
                            onTouchEnd={onTouchEnd}
                        >
                            <div className="rounded-[28px] border border-white/15 bg-gradient-to-br from-[#151028] via-[#0f0c1f] to-black p-3 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">

                                <div
                                    className="relative mx-auto overflow-hidden rounded-[22px] bg-black"
                                    style={{
                                        aspectRatio: resolvedAspectRatio,
                                        maxHeight: "80vh"
                                    }}
                                >
                                    <video
                                        key={activeVideo.publicId}
                                        ref={videoRef}
                                        src={activeVideo.signedUrl}
                                        controls
                                        autoPlay
                                        playsInline
                                        controlsList="nodownload"
                                        onEnded={goNext}
                                        onLoadedMetadata={(e) => {
                                            const el = e.currentTarget
                                            if (el.videoWidth && el.videoHeight) {
                                                setVideoAspectRatio(el.videoWidth / el.videoHeight)
                                            }
                                        }}
                                        className="w-full h-full object-contain bg-black"
                                    />

                                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40" />
                                </div>

                            </div>
                        </div>


                        {/* COMMENTS SECTION */}
                        <div className="w-full rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-5 shadow-lg backdrop-blur-xl">

                            {/* HEADER */}
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-white">Comments</h2>
                                <span className="text-xs text-gray-400">{comments.length} total</span>
                            </div>

                            {/* COMMENT LIST */}
                            <div
                                ref={commentsRef}
                                className="flex flex-col gap-3 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10"
                            >
                                {comments.map((c) => {
                                    const isMine = c.username === user?.username
                                    const commenterLabel = c.channelName || c.username || "Unknown"

                                    return (
                                        <div
                                            key={c.id}
                                            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                                        >
                                            <div
                                                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm shadow-md transition ${isMine
                                                    ? "bg-purple-600 text-white"
                                                    : "bg-black/40 border border-white/10"
                                                    }`}
                                            >

                                                {/* META */}
                                                <div className="text-[11px] text-gray-300 mb-1 flex gap-2 items-center">
                                                    <span className="font-medium">{commenterLabel}</span>
                                                    <span>•</span>
                                                    <span>{timeAgo(c.createdAt)}</span>
                                                </div>

                                                {/* TEXT */}
                                                <ExpandableCommentText text={c.commentText} />
                                            </div>
                                        </div>
                                    )
                                })}

                                {comments.length === 0 && (
                                    <p className="text-sm text-gray-400 text-center py-6">
                                        No comments yet. Start the conversation 👇
                                    </p>
                                )}
                            </div>

                            {/* INPUT */}
                            <div className="flex gap-2 mt-4 items-center">

                                <input
                                    value={commentInput}
                                    onChange={(e) => setCommentInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault()
                                            submitComment()
                                        }
                                    }}
                                    placeholder="Write a comment..."
                                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                                />

                                <button
                                    onClick={submitComment}
                                    className="bg-purple-600 hover:bg-purple-500 transition px-5 py-2.5 rounded-xl text-sm font-medium shadow-md active:scale-95"
                                >
                                    Send
                                </button>

                            </div>
                        </div>

                    </section>

                    <aside ref={playlistMenuRef} className="flex lg:flex-col items-center gap-4 lg:sticky lg:top-28">

                        {/* ACTION STACK */}
                        <div className="flex lg:flex-col gap-3 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-2 shadow-lg">

                            {/* LIKE */}
                            <button
                                onClick={likeVideo}
                                className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition ${liked
                                    ? "bg-green-600 text-white"
                                    : "bg-white/10 hover:bg-white/20"
                                    }`}
                            >
                                <span className="text-lg">👍</span>
                                <span className="text-[10px]">{likes}</span>
                            </button>

                            {/* DISLIKE */}
                            <button
                                onClick={dislikeVideo}
                                className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition ${disliked
                                    ? "bg-red-600 text-white"
                                    : "bg-white/10 hover:bg-white/20"
                                    }`}
                            >
                                <span className="text-lg">👎</span>
                                <span className="text-[10px]">{dislikes}</span>
                            </button>

                            {/* COMMENT */}
                            <button
                                onClick={() => {
                                    commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                                }}
                                className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-white/10 hover:bg-white/20 transition"
                            >
                                <span className="text-lg">💬</span>
                                <span className="text-[10px]">Comment</span>
                            </button>

                            {/* PLAYLIST */}
                            <button
                                onClick={() => setShowPlaylist(!showPlaylist)}
                                className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-purple-600 hover:bg-purple-500 transition text-white shadow-md"
                            >
                                <span className="text-lg">➕</span>
                                <span className="text-[10px]">Save</span>
                            </button>

                        </div>

                        {/* PLAYLIST POPUP */}
                        {showPlaylist && (
                            <div className="mt-2 lg:absolute lg:right-0 lg:top-[240px] w-[320px] overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-[#2d1f52] via-[#241a46] to-[#17122f] text-white shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                                <div className="border-b border-white/10 px-5 py-4">
                                    <p className="text-[15px] font-semibold">Save video to...</p>
                                </div>

                                <div className="max-h-56 overflow-y-auto">
                                    {playlists.length === 0 ? (
                                        <div className="px-5 py-4 text-sm text-purple-100/70">
                                            No playlist yet.
                                        </div>
                                    ) : (
                                        playlists.map((p) => (
                                            <button
                                                key={p.id}
                                                onClick={() => addVideoToPlaylist(p.id)}
                                                className="flex w-full items-center justify-between border-b border-white/6 px-5 py-4 text-left transition hover:bg-white/6"
                                            >
                                                <span className="text-sm font-medium">{p.name}</span>
                                                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-white/6 text-[11px] text-purple-100">
                                                    +
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </div>

                                <div className="border-t border-white/10 px-5 py-4">
                                    <div className="flex gap-2">
                                        <input
                                            value={newPlaylistName}
                                            onChange={(e) => setNewPlaylistName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault()
                                                    createPlaylist()
                                                }
                                            }}
                                            placeholder="New playlist"
                                            className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-purple-100/45 focus:border-purple-400"
                                        />

                                        <button
                                            onClick={createPlaylist}
                                            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-purple-100 transition hover:bg-white/16"
                                        >
                                            Create
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
            </main>
            <SharePopup
                open={showSharePopup}
                onClose={() => setShowSharePopup(false)}
                onShare={shareVideo}
                videoUrl={`${window.location.origin}/portrait/${activeVideo.publicId}`}
            />
        </div>
    )
}

const ExpandableCommentText = ({ text }: { text: string }) => {
    const [expanded, setExpanded] = useState(false)
    const [isOverflowing, setIsOverflowing] = useState(false)
    const textRef = useRef<HTMLParagraphElement | null>(null)

    useEffect(() => {
        const el = textRef.current
        if (!el) return
        setIsOverflowing(el.scrollHeight > el.clientHeight + 1)
    }, [text, expanded])

    return (
        <div className="space-y-1">
            <p
                ref={textRef}
                className="leading-relaxed whitespace-pre-wrap"
                style={
                    expanded
                        ? undefined
                        : {
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 2,
                            overflow: "hidden"
                        }
                }
            >
                {text}
            </p>
            {isOverflowing && (
                <button
                    onClick={() => setExpanded((prev) => !prev)}
                    className="text-xs font-medium text-purple-200 transition hover:text-white"
                >
                    {expanded ? "See less" : "See more"}
                </button>
            )}
        </div>
    )
}

export default PortraitPlayer
