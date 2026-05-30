import { useEffect, useRef, useState } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { api } from "@/api/axios"
import AppLayout from "@/layouts/AppLayout"
import { useAuth } from "@/context/AuthContext"
import UserAvatar from "@/components/UserAvatar"
import SharePopup from "@/components/SharePopup"
import type { Video as VideoCardVideo } from "@/components/VideoCard"
import { prefetchMedia } from "@/utils/media"

interface VideoDetail {
    id: string
    publicId?: string
    title: string
    aiTitle?: string
    aiDescription?: string
    signedUrl: string
    thumbnailKey?: string
    channel: {
        name: string
        username: string
    }
    uploaderAvatarKey?: string
    uploaderAvatarUrl?: string
    uploaderName?: string
    createdAt: string
    orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
}

interface RelatedVideo {
    publicId: string
    title?: string
    aiTitle?: string
    aiDescription?: string
    thumbnailKey?: string
    signedUrl?: string
    uploaderAvatarKey?: string
    uploaderAvatarUrl?: string
    channel?: {
        name?: string
        username?: string
    }
    uploaderName?: string
    createdAt?: string
    orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
    visibility?: "PUBLIC" | "PRIVATE" | "ORGANIZATION"
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

const toVideoDetail = (video?: VideoCardVideo | null): VideoDetail | null => {
    if (!video?.publicId || !video.signedUrl) return null

    return {
        id: video.id ?? "",
        publicId: video.publicId,
        title: video.title || "Untitled",
        aiTitle: video.aiTitle ?? undefined,
        aiDescription: video.aiDescription ?? undefined,
        signedUrl: video.signedUrl,
        thumbnailKey: video.thumbnailKey,
        channel: {
            name: video.channel?.name || "Unknown channel",
            username: video.channel?.username || ""
        },
        uploaderAvatarKey: video.uploaderAvatarKey ?? undefined,
        uploaderAvatarUrl: video.uploaderAvatarUrl ?? undefined,
        uploaderName: video.uploaderName ?? undefined,
        createdAt: video.createdAt || new Date().toISOString(),
        orientation: video.orientation ?? null
    }
}

const VideoPlayer = () => {
    const { publicId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()

    const videoRef = useRef<HTMLVideoElement | null>(null)
    const commentsRef = useRef<HTMLDivElement | null>(null)
    const playlistMenuRef = useRef<HTMLDivElement | null>(null)
    const navigationVideo = (location.state as { video?: VideoCardVideo } | null)?.video

    const { user } = useAuth()
    const currentUsername = user?.username
    const requireLogin = () => {
        if (user) return true
        navigate("/login", { state: { from: `${location.pathname}${location.search}` } })
        return false
    }

    const [video, setVideo] = useState<VideoDetail | null>(() => toVideoDetail(navigationVideo))
    const [related, setRelated] = useState<RelatedVideo[]>([])
    const [likes, setLikes] = useState(0)
    const [dislikes, setDislikes] = useState(0)
    const [views, setViews] = useState(0)
    const [shares, setShares] = useState(0)
    const [subscribers, setSubscribers] = useState(0)
    const [subscribed, setSubscribed] = useState(false)
    const [comments, setComments] = useState<Comment[]>([])
    const [commentInput, setCommentInput] = useState("")
    const [liked, setLiked] = useState(false)
    const [disliked, setDisliked] = useState(false)
    const [reactionPending, setReactionPending] = useState(false)

    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [showPlaylist, setShowPlaylist] = useState(false)
    const [newPlaylistName, setNewPlaylistName] = useState("")
    const [playlistMessage, setPlaylistMessage] = useState("")
    const [showSharePopup, setShowSharePopup] = useState(false)
    const [descriptionExpanded, setDescriptionExpanded] = useState(false)
    const [descriptionOverflowing, setDescriptionOverflowing] = useState(false)
    const [shouldScroll, setShouldScroll] = useState(false)
    const watchedBufferRef = useRef(0)
    const watchIntervalRef = useRef<number | null>(null)
    const descriptionRef = useRef<HTMLParagraphElement | null>(null)

    useEffect(() => {
        if (!publicId || navigationVideo?.publicId !== publicId) return

        const nextVideo = toVideoDetail(navigationVideo)
        if (!nextVideo) return

        setVideo((current) => current?.publicId === publicId ? current : nextVideo)
    }, [navigationVideo, publicId])

    const loadVideo = async () => {
        try {
            const res = await api.get(`/video/${publicId}`)

            if (!res.data?.success) return

            const videoData = res.data.data
            if (videoData?.orientation === "PORTRAIT") {
                navigate(`/portrait/${publicId}`, { replace: true })
                return
            }

            setVideo((current) => {
                const currentSignedUrl =
                    current && current.publicId === publicId ? current.signedUrl : undefined
                if (currentSignedUrl) {
                    return {
                        ...videoData,
                        signedUrl: currentSignedUrl
                    }
                }

                return videoData
            })

            void api.get("/video").then((relatedRes) => {
                const allVideos = (relatedRes.data?.data || []) as RelatedVideo[]
                setRelated(allVideos.filter((v) => v.publicId !== publicId))
            }).catch(() => {
            })
        } catch (error) {
        }
    }

    const loadActions = async () => {
        const res = await api.get(`/video-actions/video/${publicId}`)

        setLikes(res.data.likes)
        setDislikes(res.data.dislikes)
        setViews(res.data.views || 0)
        setShares(res.data.shares || 0)
        setSubscribers(res.data.subscribers || 0)
        setSubscribed(Boolean(res.data.subscribed))
        setComments(res.data.comments)

        setLiked(res.data.userReaction === "LIKE")
        setDisliked(res.data.userReaction === "DISLIKE")
    }

    const loadPlaylists = async () => {
        if (!user) {
            setPlaylists([])
            return
        }
        const res = await api.get("/video-actions/playlists")
        setPlaylists(res.data)
    }

    const likeVideo = async () => {
        if (reactionPending) return
        if (!requireLogin()) return
        if (!publicId) return

        setReactionPending(true)
        try {
            const res = await api.post("/video-actions/react", {
                publicId,
                type: "LIKE"
            })

            if (typeof res.data?.likes === "number" && typeof res.data?.dislikes === "number") {
                setLikes(res.data.likes)
                setDislikes(res.data.dislikes)
                setLiked(res.data.userReaction === "LIKE")
                setDisliked(res.data.userReaction === "DISLIKE")
            } else {
                await loadActions()
            }
        } finally {
            setReactionPending(false)
        }
    }

    const dislikeVideo = async () => {
        if (reactionPending) return
        if (!requireLogin()) return
        if (!publicId) return

        setReactionPending(true)
        try {
            const res = await api.post("/video-actions/react", {
                publicId,
                type: "DISLIKE"
            })

            if (typeof res.data?.likes === "number" && typeof res.data?.dislikes === "number") {
                setLikes(res.data.likes)
                setDislikes(res.data.dislikes)
                setLiked(res.data.userReaction === "LIKE")
                setDisliked(res.data.userReaction === "DISLIKE")
            } else {
                await loadActions()
            }
        } finally {
            setReactionPending(false)
        }
    }

    const addVideoToPlaylist = async (playlistId: string) => {
        if (!requireLogin()) return
        try {
            await api.post("/video-actions/playlist", {
                publicId,
                playlistId
            })
            setPlaylistMessage("Video added to playlist.")
        } catch (error) {
            setPlaylistMessage(error instanceof Error ? error.message : "Failed to add video to playlist.")
        } finally {
            setShowPlaylist(false)
        }
    }

    const createPlaylist = async () => {
        if (!requireLogin()) return
        if (!newPlaylistName.trim()) return

        const res = await api.post("/video-actions/playlists", {
            name: newPlaylistName
        })

        setPlaylists([res.data, ...playlists])
        setNewPlaylistName("")
    }

    const submitComment = async () => {
        if (!requireLogin()) return
        if (!commentInput.trim()) return

        await api.post("/video-actions/comment", {
            publicId,
            text: commentInput
        })

        setCommentInput("")
        setShouldScroll(true)

        loadActions()
    }

    const shareVideo = async (method = "COPY_LINK", targetUrl?: string) => {
        if (!publicId || !video) return
        if (!requireLogin()) return

        const videoLink = `${window.location.origin}/video/${publicId}`

        if (method === "COPY_LINK") {
            try {
                await navigator.clipboard.writeText(videoLink)
            } catch (error) {
            }
        } else if (method === "NATIVE" && "share" in navigator) {
            try {
                await navigator.share({
                    title: video.aiTitle || video.title,
                    url: videoLink
                })
            } catch (error) {
            }
        } else if (targetUrl) {
            window.open(targetUrl, "_blank", "noopener,noreferrer")
        }

        await api.post("/video-actions/share", { publicId, method })
        loadActions()
        setShowSharePopup(false)
    }

    const toggleSubscribe = async () => {
        if (!requireLogin()) return
        if (!publicId) return

        await api.post("/video-actions/subscribe", { publicId })
        loadActions()
    }

    const handleEnded = () => {
        if (related.length > 0) {
            navigate(`/video/${related[0].publicId}`)
        }
    }

    const timeAgo = (date: string) => {
        const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)

        const days = Math.floor(seconds / 86400)
        if (days > 0) return `${days} days ago`

        const hours = Math.floor(seconds / 3600)
        if (hours > 0) return `${hours} hours ago`

        const minutes = Math.floor(seconds / 60)
        if (minutes > 0) return `${minutes} minutes ago`

        return "just now"
    }

    useEffect(() => {
        if (!publicId) return
        if (navigationVideo?.publicId !== publicId) {
            setVideo((current) => current?.publicId === publicId ? current : null)
        }
        loadVideo()
        loadActions()
        loadPlaylists()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [publicId, navigationVideo?.publicId])

    useEffect(() => {
        if (shouldScroll && commentsRef.current) {
            commentsRef.current.scrollTop = commentsRef.current.scrollHeight
            setShouldScroll(false)
        }
    }, [comments, shouldScroll])

    useEffect(() => {
        if (!publicId) return
        api.post("/video-actions/view", { publicId }).then((res) => {
            if (typeof res.data?.views === "number") setViews(res.data.views)
        }).catch(() => undefined)
    }, [publicId])

    useEffect(() => {
        if (!publicId || !user) return

        const flushWatch = async (forceSeconds?: number) => {
            const watchedSeconds = Math.floor(forceSeconds ?? watchedBufferRef.current)
            if (!watchedSeconds) return
            watchedBufferRef.current = 0

            await api.post("/video-actions/watch-progress", {
                publicId,
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
    }, [publicId])

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
        related.slice(0, 3).forEach((item) => {
            prefetchMedia(item.signedUrl)
        })
    }, [related])

    useEffect(() => {
        setDescriptionExpanded(false)
    }, [video?.publicId])

    useEffect(() => {
        if (!playlistMessage) return

        const timer = window.setTimeout(() => {
            setPlaylistMessage("")
        }, 2200)

        return () => window.clearTimeout(timer)
    }, [playlistMessage])

    const description = video?.aiDescription?.trim() || "No description available."
    const upNext = related.slice(0, 8)
    const recommended = related.slice(8, 16)
    const posterUrl = video?.thumbnailKey
        ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}`
        : undefined

    useEffect(() => {
        const el = descriptionRef.current
        if (!el) return

        const updateOverflow = () => {
            setDescriptionOverflowing(
                el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
            )
        }

        updateOverflow()
        window.addEventListener("resize", updateOverflow)
        return () => window.removeEventListener("resize", updateOverflow)
    }, [description, descriptionExpanded])
    const contentWidthClass = "w-full"

    return (
        <AppLayout>
            {!video ? (
                <div className="grid min-w-0 w-full items-start gap-4 sm:gap-6 xl:gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px] animate-pulse">
                    <div className="min-w-0 space-y-4 sm:space-y-5">
                        <div className={`${contentWidthClass} aspect-video rounded-[1.25rem] border border-white/10 bg-black/50 sm:rounded-2xl`} />
                        <div className={`${contentWidthClass} rounded-[1.25rem] border border-white/10 bg-white/5 p-4 space-y-4 sm:rounded-2xl sm:p-5`}>
                            <div className="h-8 w-2/3 rounded bg-white/10" />
                            <div className="h-4 w-full rounded bg-white/10" />
                            <div className="h-4 w-5/6 rounded bg-white/10" />
                        </div>
                        <div className={`${contentWidthClass} rounded-[1.25rem] border border-white/10 bg-white/5 p-4 space-y-3 sm:rounded-2xl sm:p-5`}>
                            <div className="h-6 w-32 rounded bg-white/10" />
                            <div className="h-16 rounded-xl bg-white/10" />
                            <div className="h-16 rounded-xl bg-white/10" />
                        </div>
                    </div>
                    <aside className="min-w-0 space-y-4 lg:w-[300px] xl:w-[340px]">
                        <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-3.5 space-y-3 sm:rounded-2xl">
                            <div className="h-6 w-28 rounded bg-white/10" />
                            <div className="h-24 rounded-xl bg-white/10" />
                            <div className="h-24 rounded-xl bg-white/10" />
                        </div>
                    </aside>
                </div>
            ) : (
            <div className="grid min-w-0 w-full items-start gap-4 sm:gap-6 xl:gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-4 sm:space-y-5">
                    <div
                        className={`${contentWidthClass} overflow-hidden rounded-[1.25rem] border border-white/10 bg-black shadow-xl sm:rounded-2xl`}
                    >
                        <video
                            ref={videoRef}
                            src={video.signedUrl}
                            poster={posterUrl}
                            controls
                            playsInline
                            preload="auto"
                            controlsList="nodownload"
                            onEnded={handleEnded}
                            className="block aspect-video max-h-[78vh] w-full bg-black object-contain"
                        />
                    </div>

                    <div className={`${contentWidthClass} min-w-0 rounded-[1.25rem] border border-white/10 bg-white/5 p-4 space-y-4 sm:rounded-2xl sm:p-5`}>
                        <h1 className="break-words text-lg font-semibold leading-tight sm:text-xl md:text-2xl">
                            {video.aiTitle || video.title}
                        </h1>

                        <div className="space-y-1 text-sm text-gray-300">
                            <p
                                ref={descriptionRef}
                                className={`${descriptionExpanded ? "whitespace-pre-wrap" : "line-clamp-2"} break-words text-sm leading-6 sm:text-[15px]`}
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

                        <div className="min-w-0 flex flex-col gap-4 pt-1 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-center justify-between gap-3 lg:flex-1 lg:justify-start">
                                <div className="flex min-w-0 items-center gap-3">
                                    <UserAvatar
                                        name={video.uploaderName || video.channel.name}
                                        avatarUrl={video.uploaderAvatarUrl}
                                        avatarKey={video.uploaderAvatarKey}
                                        alt={video.channel.name}
                                    />

                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold sm:text-[15px]">{video.channel.name}</p>
                                        <p className="text-xs text-gray-400 sm:text-sm">
                                            {timeAgo(video.createdAt)} • {views.toLocaleString()} views
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={toggleSubscribe}
                                    className={`inline-flex shrink-0 items-center justify-center rounded-full border px-4 py-2 text-xs font-medium transition sm:py-1.5 ${
                                        subscribed
                                            ? "border-white bg-white text-black"
                                            : "border-purple-500 bg-purple-600 text-white"
                                    }`}
                                >
                                    {subscribed ? "Subscribed" : "Subscribe"} {subscribers > 0 ? subscribers : ""}
                                </button>
                            </div>

                            <div className="grid min-w-0 grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center lg:justify-end">
                                <button
                                    onClick={likeVideo}
                                    disabled={reactionPending}
                                    className={`inline-flex min-w-0 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:gap-2 sm:px-4 sm:text-sm ${
                                        liked
                                            ? "bg-green-600 border-green-500 text-white"
                                            : "bg-white/10 border-white/10 hover:bg-white/15"
                                    }`}
                                >
                                    👍 {likes}
                                </button>

                                <button
                                    onClick={dislikeVideo}
                                    disabled={reactionPending}
                                    className={`inline-flex min-w-0 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:gap-2 sm:px-4 sm:text-sm ${
                                        disliked
                                            ? "bg-red-600 border-red-500 text-white"
                                            : "bg-white/10 border-white/10 hover:bg-white/15"
                                    }`}
                                >
                                    👎 {dislikes}
                                </button>

                                <button
                                    onClick={() => setShowSharePopup(true)}
                                    className="inline-flex min-w-0 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/10 px-2 py-2 text-xs transition hover:bg-white/15 sm:w-auto sm:gap-2 sm:px-4 sm:text-sm"
                                >
                                    <span>↗</span>
                                    <span className="min-w-0 truncate">Share</span>
                                    {shares > 0 ? <span>{shares}</span> : null}
                                </button>

                                <div ref={playlistMenuRef} className="relative min-w-0 sm:w-auto">
                                    <button
                                        onClick={() => setShowPlaylist(!showPlaylist)}
                                        className="inline-flex min-w-0 w-full items-center justify-center gap-1 rounded-xl bg-purple-600 px-2 py-2 text-xs transition hover:bg-purple-700 sm:w-auto sm:gap-2 sm:px-4 sm:text-sm"
                                    >
                                        <span className="min-w-0 truncate text-center">Playlist</span>
                                    </button>

                                    {showPlaylist && (
                                        <div className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-[#2d1f52] via-[#241a46] to-[#17122f] text-white shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:w-[320px] lg:left-full lg:right-auto lg:top-1/2 lg:mt-0 lg:ml-3 lg:-translate-y-1/2">
                                            <div className="border-b border-white/10 px-5 py-4">
                                                <p className="text-[15px] font-semibold">Playlist</p>
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
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={`${contentWidthClass} rounded-[1.25rem] border border-white/10 bg-white/5 p-4 pb-6 sm:rounded-2xl sm:p-5 sm:pb-5`}>
                        <h2 className="mb-4 text-lg font-semibold">Comments</h2>

                        <div
                            ref={commentsRef}
                            className="flex flex-col gap-3 max-h-[320px] overflow-y-auto pr-1"
                        >
                            {comments.map((c) => {
                                const isMine = c.username === currentUsername
                                const commenterLabel = c.channelName || c.username || "Unknown channel"

                                return (
                                    <div
                                        key={c.id}
                                        className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                                    >
                                        <div
                                            className={`max-w-[92%] rounded-xl px-3 py-2.5 text-sm shadow-sm sm:max-w-[82%] ${
                                                isMine ? "bg-purple-600 text-white" : "bg-black/40"
                                            }`}
                                        >
                                            <div className="text-xs text-gray-300 mb-1 flex gap-2 items-center">
                                                <span className="font-medium">{commenterLabel}</span>
                                                <span>•</span>
                                                <span>{timeAgo(c.createdAt)}</span>
                                            </div>
                                            <ExpandableCommentText text={c.commentText} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="mt-4 flex items-center gap-2">
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
                                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-purple-500"
                            />

                            <button
                                onClick={submitComment}
                                className="shrink-0 rounded-xl bg-purple-600 px-3 py-2.5 text-sm transition hover:bg-purple-700 sm:px-4"
                            >
                                Comment
                            </button>
                        </div>
                    </div>
                </div>

                <aside className="min-w-0 h-fit space-y-4 lg:w-[300px] xl:sticky xl:top-24 xl:w-[340px] 2xl:w-[380px]">
                    <RightRailSection
                        title="Up Next"
                        videos={upNext}
                        onOpen={(item) => navigate(`/video/${item.publicId}`, { state: { video: item } })}
                    />

                    <RightRailSection
                        title="Recommended"
                        videos={recommended}
                        onOpen={(item) => navigate(`/video/${item.publicId}`, { state: { video: item } })}
                    />
                </aside>
            </div>
            )}
            {playlistMessage ? (
                <div className="pointer-events-none fixed left-1/2 top-24 z-[90] w-[calc(100vw-2rem)] max-w-xs -translate-x-1/2 rounded-2xl border border-emerald-300/25 bg-emerald-500/16 px-4 py-3 text-center text-sm font-semibold text-emerald-50 shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                    {playlistMessage}
                </div>
            ) : null}
            <SharePopup
                open={showSharePopup}
                onClose={() => setShowSharePopup(false)}
                onShare={shareVideo}
                videoUrl={`${window.location.origin}/video/${publicId}`}
            />
        </AppLayout>
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

const RightRailSection = ({
    title,
    videos,
    onOpen
}: {
    title: string
    videos: RelatedVideo[]
    onOpen: (video: RelatedVideo) => void
}) => {
    return (
        <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-3.5 sm:rounded-2xl">
            <h2 className="mb-3 text-base font-semibold">{title}</h2>

            <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1 lg:max-h-[360px]">
                {videos.map((item) => {
                    const thumb = item.thumbnailKey
                        ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${item.thumbnailKey}`
                        : "/placeholder-thumbnail.png"
                    const name = item.channel?.name || item.uploaderName || "Unknown channel"

                    return (
                        <button
                            key={item.publicId}
                            onMouseEnter={() => prefetchMedia(item.signedUrl)}
                            onTouchStart={() => prefetchMedia(item.signedUrl)}
                            onClick={() => {
                                prefetchMedia(item.signedUrl)
                                onOpen(item)
                            }}
                            className="flex w-full min-w-0 gap-3 rounded-xl p-2.5 text-left transition hover:bg-black/35"
                        >
                            <img
                                src={thumb}
                                alt={item.aiTitle || item.title || "Video thumbnail"}
                                className="h-[76px] w-[136px] shrink-0 rounded-lg border border-white/10 object-cover"
                                onError={(e) => {
                                    ;(e.currentTarget as HTMLImageElement).src = "/placeholder-thumbnail.png"
                                }}
                            />

                            <div className="min-w-0 flex-1 pt-0.5">
                                <p className="text-sm font-medium leading-5 line-clamp-2">
                                    {item.aiTitle || item.title || "Untitled"}
                                </p>
                                <p className="mt-1 truncate text-xs text-gray-400">{name}</p>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export default VideoPlayer
