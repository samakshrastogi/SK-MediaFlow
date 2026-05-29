import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { AnimatePresence, motion } from "framer-motion"
import {
    CheckCircle2,
    Eye,
    Heart,
    ListVideo,
    PencilLine,
    Play,
    Settings2,
    Shield,
    Sparkles,
    Trash2,
    UploadCloud
} from "lucide-react"

import AppLayout from "@/layouts/AppLayout"
import { api } from "@/api/axios"
import UserAvatar from "@/components/UserAvatar"
import SpritesheetPicker from "@/components/SpritesheetPicker"
import { useAuth } from "@/context/AuthContext"
import { getCachedPageData, setCachedPageData } from "@/utils/pageCache"

interface User {
    id: string
    name?: string
    avatarUrl?: string
    avatarKey?: string
    coverUrl?: string
    coverKey?: string
    email?: string
    platformAdmin?: boolean
    createdAt?: string
}

interface Stats {
    videos: number
    playlists: number
    favorites: number
}

interface Video {
    id?: string
    publicId: string
    title?: string
    aiTitle?: string
    aiDescription?: string
    thumbnailKey?: string
    uploaderAvatarKey?: string
    uploaderAvatarUrl?: string
    uploaderName?: string
    createdAt?: string
    progress?: number
    signedUrl?: string
    orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
    visibility?: "PUBLIC" | "PRIVATE" | "ORGANIZATION"
    channel?: {
        name?: string
        username?: string
    }
}

interface RawVideo extends Video {}

interface SpritesheetData {
    spritesheetUrl: string
    frameWidth: number
    frameHeight: number
    cols: number
    rows: number
    totalFrames: number
    intervalSec: number
}

interface EditModalProps {
    userName?: string
    avatarUrl?: string
    avatarKey?: string
    coverUrl?: string
    name: string
    setName: (v: string) => void
    channelName: string
    setChannelName: (v: string) => void
    description: string
    setDescription: (v: string) => void
    onAvatarChange: (file: File) => void
    onCoverChange: (file: File) => void
    onClose: () => void
    onSave: () => void
}

interface EditVideoModalProps {
    video: Video
    videoTitle: string
    setVideoTitle: (value: string) => void
    videoDescription: string
    setVideoDescription: (value: string) => void
    videoThumbnailPreview?: string
    videoSpritesheet: SpritesheetData | null
    loadingSpritesheet: boolean
    spritesheetError?: string
    selectedSpriteFrameIndex: number | null
    setSelectedSpriteFrameIndex: (value: number | null) => void
    handleUploadVideoThumbnail: (file?: File) => void
    loadVideoSpritesheet: () => void
    saveSpriteSelectionAsThumbnail: () => void
    savingSprite: boolean
    savingVideo: boolean
    onClose: () => void
    onSave: () => void
    onDelete: () => void
}

interface ProfilePageCache {
    user: User | null
    stats: Stats | null
    publicVideos: Video[]
    privateVideos: Video[]
    organizationVideos: Video[]
    history: Video[]
    name: string
    channelName: string
    description: string
}

const stableHash = (value?: string) =>
    Array.from(String(value ?? "")).reduce((total, char) => total + char.charCodeAt(0), 0)

const getTitle = (video: Video) => video.title?.trim() || video.aiTitle?.trim() || "Untitled"
const getChannel = (video: Video) => video.channel?.name?.trim() || video.uploaderName?.trim() || "Unknown channel"
const getThumb = (video: Video) =>
    video.thumbnailKey ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}` : "/placeholder.jpg"

const getTimeAgoLabel = (date?: string) => {
    if (!date) return "Recently"
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

    return "Recently"
}

const getDurationLabel = (video: Video) => {
    const seed = stableHash(`${video.publicId || video.id}${getTitle(video)}`)
    const minutes = (seed % 58) + 2
    const seconds = (seed * 5) % 60
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

const getProgressValue = (video: Video) => {
    if (typeof video.progress === "number") return Math.max(8, Math.min(100, video.progress))
    return (stableHash(video.publicId || video.id || getTitle(video)) % 64) + 18
}

const getMemberSince = (date?: string) => {
    if (!date) return "Member"
    return `Member since ${new Date(date).getFullYear()}`
}

const normalizeComparableText = (value?: string) => value?.trim().toLowerCase() || ""

const ProfilePage = () => {
    const navigate = useNavigate()
    const { user: authUser, updateUser } = useAuth()
    const cached = getCachedPageData<ProfilePageCache>("page:profile")

    const [user, setUser] = useState<User | null>(cached?.user || null)
    const [stats, setStats] = useState<Stats | null>(cached?.stats || null)
    const [publicVideos, setPublicVideos] = useState<Video[]>(cached?.publicVideos || [])
    const [privateVideos, setPrivateVideos] = useState<Video[]>(cached?.privateVideos || [])
    const [organizationVideos, setOrganizationVideos] = useState<Video[]>(cached?.organizationVideos || [])
    const [history, setHistory] = useState<Video[]>(cached?.history || [])
    const [loading, setLoading] = useState(!cached)
    const [editOpen, setEditOpen] = useState(false)
    const [activePanel, setActivePanel] = useState<"history" | "uploads">("history")
    const [uploadVisibility, setUploadVisibility] = useState<"public" | "private" | "organization">("public")
    const [name, setName] = useState(cached?.name || "")
    const [channelName, setChannelName] = useState(cached?.channelName || "")
    const [description, setDescription] = useState(cached?.description || "")
    const [message, setMessage] = useState("")

    const [editingVideo, setEditingVideo] = useState<Video | null>(null)
    const [videoTitle, setVideoTitle] = useState("")
    const [videoDescription, setVideoDescription] = useState("")
    const [videoThumbnailKey, setVideoThumbnailKey] = useState<string | undefined>(undefined)
    const [videoThumbnailPreview, setVideoThumbnailPreview] = useState<string | undefined>(undefined)
    const [videoSpritesheet, setVideoSpritesheet] = useState<SpritesheetData | null>(null)
    const [loadingSpritesheet, setLoadingSpritesheet] = useState(false)
    const [spritesheetError, setSpritesheetError] = useState("")
    const [selectedSpriteFrameIndex, setSelectedSpriteFrameIndex] = useState<number | null>(null)
    const [savingVideo, setSavingVideo] = useState(false)
    const [savingSprite, setSavingSprite] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [hiddenUploadIds, setHiddenUploadIds] = useState<string[]>(() => {
        const key = authUser?.id ? `profile:hidden-videos:${authUser.id}` : "profile:hidden-videos:guest"
        try {
            const stored = localStorage.getItem(key)
            return stored ? JSON.parse(stored) : []
        } catch {
            return []
        }
    })

    const normalizeVideos = (rows: RawVideo[]): Video[] => {
        if (!Array.isArray(rows)) return []
        return rows.map((video) => ({
            id: video.id,
            publicId: video.publicId,
            title: video.title || video.aiTitle || "Untitled",
            aiTitle: video.aiTitle ?? undefined,
            aiDescription: video.aiDescription ?? undefined,
            thumbnailKey: video.thumbnailKey,
            uploaderAvatarKey: video.uploaderAvatarKey ?? undefined,
            uploaderAvatarUrl: video.uploaderAvatarUrl ?? undefined,
            uploaderName: video.uploaderName ?? undefined,
            createdAt: video.createdAt ?? undefined,
            progress: video.progress ?? undefined,
            signedUrl: video.signedUrl ?? undefined,
            orientation: video.orientation ?? null,
            visibility: video.visibility,
            channel: video.channel ?? undefined
        }))
    }

    const fetchProfile = useCallback(async () => {
        try {
            const res = await api.get("/user/me")
            const data = res.data?.data || {}

            setUser(data.user || null)
            if (data.user) updateUser(data.user)
            setStats(data.stats || null)
            setHistory(normalizeVideos(data.history))

            if (data.channel?.id) {
                const [publicRes, privateRes, orgRes] = await Promise.all([
                    api.get(`/video/channel/${data.channel.id}/public`),
                    api.get(`/video/channel/${data.channel.id}/private`),
                    api.get(`/video/channel/${data.channel.id}/organization`)
                ])

                setPublicVideos(normalizeVideos(publicRes.data.data))
                setPrivateVideos(normalizeVideos(privateRes.data.data))
                setOrganizationVideos(normalizeVideos(orgRes.data.data))
            } else {
                setPublicVideos([])
                setPrivateVideos([])
                setOrganizationVideos([])
            }

            setName(data.user?.name || "")
            setChannelName(data.channel?.name || "")
            setDescription(data.channel?.description || "")
        } catch {
            // ignore
        } finally {
            setLoading(false)
        }
    }, [updateUser])

    useEffect(() => {
        void fetchProfile()
    }, [fetchProfile])

    useEffect(() => {
        const key = authUser?.id ? `profile:hidden-videos:${authUser.id}` : "profile:hidden-videos:guest"
        try {
            const stored = localStorage.getItem(key)
            setHiddenUploadIds(stored ? JSON.parse(stored) : [])
        } catch {
            setHiddenUploadIds([])
        }
    }, [authUser?.id])

    useEffect(() => {
        const key = authUser?.id ? `profile:hidden-videos:${authUser.id}` : "profile:hidden-videos:guest"
        localStorage.setItem(key, JSON.stringify(hiddenUploadIds))
    }, [authUser?.id, hiddenUploadIds])

    useEffect(() => {
        setCachedPageData<ProfilePageCache>(
            "page:profile",
            {
                user,
                stats,
                publicVideos,
                privateVideos,
                organizationVideos,
                history,
                name,
                channelName,
                description
            },
            120000
        )
    }, [user, stats, publicVideos, privateVideos, organizationVideos, history, name, channelName, description])

    const saveProfile = async () => {
        try {
            await api.patch("/user/profile", {
                name,
                channelName,
                channelTitle: channelName,
                description,
                channelDescription: description
            })

            await fetchProfile()
            setEditOpen(false)
            setMessage("Profile updated.")
        } catch {
            setMessage("Failed to update profile.")
        }
    }

    const uploadAvatar = async (file: File) => {
        try {
            const uploadRes = await api.post("/user/avatar-upload-url", { fileType: file.type })
            const { uploadUrl, key } = uploadRes.data

            await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file
            })

            await api.post("/user/avatar", { key })
            await fetchProfile()
            setMessage("Avatar updated.")
        } catch {
            setMessage("Failed to update avatar.")
        }
    }

    const uploadCover = async (file: File) => {
        try {
            const uploadRes = await api.post("/user/cover-upload-url", { fileType: file.type })
            const { uploadUrl, key } = uploadRes.data

            await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file
            })

            await api.post("/user/cover", { key })
            await fetchProfile()
            setMessage("Cover photo updated.")
        } catch {
            setMessage("Failed to update cover photo.")
        }
    }

    const loadVideoSpritesheet = useCallback(async (videoId?: string) => {
        if (!videoId) {
            setVideoSpritesheet(null)
            setSpritesheetError("Spritesheet is unavailable for this video.")
            return false
        }

        try {
            setLoadingSpritesheet(true)
            setSpritesheetError("")
            const res = await api.get(`/video/upload/${videoId}/spritesheet`)
            setVideoSpritesheet(res.data?.data || null)
            return true
        } catch (error) {
            setVideoSpritesheet(null)
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                setSpritesheetError("Spritesheet is being generated. It will appear here automatically.")
            } else {
                setSpritesheetError("Failed to load spritesheet thumbnail frames.")
            }
            return false
        } finally {
            setLoadingSpritesheet(false)
        }
    }, [])

    const openVideoEditor = (video: Video) => {
        setEditingVideo(video)
        setConfirmDelete(false)
        setVideoTitle(video.title || "")
        setVideoDescription(video.aiDescription || "")
        setVideoThumbnailKey(video.thumbnailKey)
        setVideoThumbnailPreview(video.thumbnailKey ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}` : undefined)
        setVideoSpritesheet(null)
        setSpritesheetError("")
        setSelectedSpriteFrameIndex(null)
    }

    useEffect(() => {
        if (!editingVideo?.id || videoSpritesheet) return

        let cancelled = false
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        const pollSpritesheet = async () => {
            const loaded = await loadVideoSpritesheet(editingVideo.id)
            if (!loaded && !cancelled) {
                timeoutId = setTimeout(pollSpritesheet, 4000)
            }
        }

        void pollSpritesheet()

        return () => {
            cancelled = true
            if (timeoutId) clearTimeout(timeoutId)
        }
    }, [editingVideo?.id, videoSpritesheet, loadVideoSpritesheet])

    const handleUploadVideoThumbnail = async (file?: File) => {
        if (!file) return

        try {
            const thumbPresignRes = await api.post("/video/upload/thumbnail-presign", {
                fileName: file.name,
                fileType: file.type
            })
            const { uploadUrl, key } = thumbPresignRes.data.data

            await axios.put(uploadUrl, file, {
                headers: { "Content-Type": file.type }
            })

            setVideoThumbnailKey(key)
            setVideoThumbnailPreview(URL.createObjectURL(file))
        } catch {
            setMessage("Failed to upload thumbnail.")
        }
    }

    const saveSpriteSelectionAsThumbnail = async () => {
        if (!editingVideo?.id || selectedSpriteFrameIndex === null) return

        try {
            setSavingSprite(true)
            const res = await api.post(`/video/upload/${editingVideo.id}/spritesheet/select-thumbnail`, {
                frameIndex: selectedSpriteFrameIndex
            })

            const data = res.data?.data
            setVideoThumbnailKey(data?.thumbnailKey)
            if (data?.thumbnailUrl) {
                setVideoThumbnailPreview(data.thumbnailUrl)
            }
        } catch {
            setMessage("Failed to save spritesheet thumbnail.")
        } finally {
            setSavingSprite(false)
        }
    }

    const saveVideoEdit = async () => {
        if (!editingVideo?.publicId) return

        try {
            setSavingVideo(true)
            await api.patch(`/video/${editingVideo.publicId}`, {
                title: videoTitle,
                description: videoDescription,
                thumbnailKey: videoThumbnailKey
            })

            await fetchProfile()
            setEditingVideo(null)
            setMessage("Video updated.")
        } catch {
            setMessage("Failed to update video.")
        } finally {
            setSavingVideo(false)
        }
    }

    const deleteVideo = async () => {
        if (!editingVideo?.publicId) return

        try {
            setSavingVideo(true)
            await api.delete(`/video/${editingVideo.publicId}`)
            await fetchProfile()
            setEditingVideo(null)
            setMessage("Video deleted.")
        } catch {
            setMessage("Failed to delete video.")
        } finally {
            setSavingVideo(false)
        }
    }

    const visiblePublicVideos = useMemo(
        () => publicVideos.filter((video) => !hiddenUploadIds.includes(video.publicId)),
        [publicVideos, hiddenUploadIds]
    )
    const visiblePrivateVideos = useMemo(
        () => privateVideos.filter((video) => !hiddenUploadIds.includes(video.publicId)),
        [privateVideos, hiddenUploadIds]
    )
    const visibleOrganizationVideos = useMemo(
        () => organizationVideos.filter((video) => !hiddenUploadIds.includes(video.publicId)),
        [organizationVideos, hiddenUploadIds]
    )

    const uploadVideos = useMemo(() => {
        if (uploadVisibility === "private") return visiblePrivateVideos
        if (uploadVisibility === "organization") return visibleOrganizationVideos
        return visiblePublicVideos
    }, [uploadVisibility, visiblePublicVideos, visiblePrivateVideos, visibleOrganizationVideos])
    const displayName = user?.name || authUser?.name || "SK-MediaFlow Creator"
    const showChannelPill = Boolean(channelName) && normalizeComparableText(channelName) !== normalizeComparableText(displayName)

    const availableUploadTabs = useMemo(() => {
        const tabs: { key: "public" | "private" | "organization"; label: string }[] = []
        if (visiblePublicVideos.length > 0) tabs.push({ key: "public", label: "Uploads" })
        if (visiblePrivateVideos.length > 0) tabs.push({ key: "private", label: "Private" })
        if (visibleOrganizationVideos.length > 0) tabs.push({ key: "organization", label: "Organization" })
        if (tabs.length === 0) tabs.push({ key: "public", label: "Uploads" })
        return tabs
    }, [visiblePublicVideos.length, visiblePrivateVideos.length, visibleOrganizationVideos.length])

    useEffect(() => {
        if (!availableUploadTabs.find((tab) => tab.key === uploadVisibility)) {
            setUploadVisibility(availableUploadTabs[0].key)
        }
    }, [availableUploadTabs, uploadVisibility])

    const statCards = [
        { label: "Uploads", value: stats?.videos ?? publicVideos.length + privateVideos.length + organizationVideos.length, icon: UploadCloud },
        { label: "Favorites", value: stats?.favorites ?? 0, icon: Heart },
        { label: "Playlists", value: stats?.playlists ?? 0, icon: ListVideo }
    ]

    const handleUploadHeaderButtonClick = (tabKey: "public" | "private" | "organization") => {
        if (tabKey === "public" && visiblePublicVideos.length === 0) {
            navigate("/upload")
            return
        }

        setUploadVisibility(tabKey)
    }

    if (loading) {
        return (
            <AppLayout>
                <div className="space-y-6">
                    <div className="h-[26rem] animate-pulse rounded-[28px] border border-white/10 bg-white/6 sm:h-[34rem] sm:rounded-[36px]" />
                    <div className="grid grid-cols-3 gap-2 sm:gap-4">
                        <div className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/6 sm:h-40 sm:rounded-[28px]" />
                        <div className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/6 sm:h-40 sm:rounded-[28px]" />
                        <div className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/6 sm:h-40 sm:rounded-[28px]" />
                    </div>
                </div>
            </AppLayout>
        )
    }

    return (
        <AppLayout>
            <div className="relative isolate min-w-0 space-y-5 pb-8 sm:space-y-8">
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="relative overflow-hidden rounded-[28px] sm:rounded-[36px]"
                >
                    <motion.div
                        animate={{ scale: [1.02, 1.06, 1.02], x: [0, 8, 0], y: [0, -6, 0] }}
                        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0"
                    >
                        <img
                            src={user?.coverUrl || "/placeholder.jpg"}
                            alt="Profile cover"
                            className="h-full w-full object-cover opacity-52"
                            onError={(event) => {
                                event.currentTarget.src = "/placeholder.jpg"
                            }}
                        />
                    </motion.div>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,11,26,0.06),rgba(7,10,24,0.46)_58%,rgba(7,9,18,0.72))]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.16),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(192,132,252,0.14),transparent_26%)]" />

                    <div className="relative z-10 px-4 py-5 sm:px-8 sm:py-10 xl:px-10 xl:py-12">
                        <div className="space-y-5 sm:space-y-6">
                            <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
                                    <motion.div
                                        animate={{ y: [0, -4, 0] }}
                                        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
                                        className="relative self-start sm:self-auto"
                                    >
                                        <div className="absolute inset-[-8px] rounded-[2rem] bg-[conic-gradient(from_0deg,rgba(34,211,238,0.72),rgba(168,85,247,0.78),rgba(56,189,248,0.76),rgba(34,211,238,0.72))] opacity-80 blur-sm sm:inset-[-12px] sm:rounded-full" />
                                        <div className="absolute inset-[-3px] rounded-[1.8rem] border border-white/24 sm:inset-[-4px] sm:rounded-full" />
                                        <div className="relative rounded-full bg-slate-950/70 p-[6px] shadow-[0_18px_45px_rgba(5,8,25,0.52)] backdrop-blur-xl">
                                            <UserAvatar
                                                name={user?.name || authUser?.name || "User"}
                                                avatarUrl={user?.avatarUrl}
                                                avatarKey={user?.avatarKey}
                                                className="h-20 w-20 border-2 border-white/18 text-2xl sm:h-32 sm:w-32 sm:text-3xl"
                                            />
                                        </div>
                                        <span className="absolute bottom-1 right-1 flex h-4 w-4 rounded-full border-2 border-slate-950 bg-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.8)] sm:bottom-2 sm:right-2 sm:h-5 sm:w-5" />
                                    </motion.div>

                                    <div className="min-w-0 space-y-3 sm:space-y-4">
                                        <motion.h1
                                            initial={{ opacity: 0, y: 16 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.16, duration: 0.7 }}
                                            className="max-w-4xl break-words text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl xl:text-[3.8rem]"
                                        >
                                            <span className="bg-[linear-gradient(135deg,#ffffff_0%,#e0f2fe_28%,#f5d0fe_100%)] bg-clip-text text-transparent">
                                                {displayName}
                                            </span>
                                        </motion.h1>
                                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-200/74 sm:gap-3">
                                            <Pill>{getMemberSince(user?.createdAt)}</Pill>
                                            {showChannelPill ? (
                                                <Pill icon={<Sparkles size={14} />}>{channelName}</Pill>
                                            ) : null}
                                            <Pill icon={<Sparkles size={14} />}>Organization</Pill>
                                            {user?.platformAdmin ? <Pill icon={<Shield size={14} />}>Admin</Pill> : null}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3 lg:max-w-sm lg:justify-end">
                                    <HeroActionButton icon={<Settings2 size={18} />} onClick={() => navigate("/settings")}>
                                        Settings
                                    </HeroActionButton>
                                    <HeroActionButton icon={<PencilLine size={18} />} onClick={() => setEditOpen(true)}>
                                        Edit Profile
                                    </HeroActionButton>
                                </div>
                            </div>

                        </div>
                    </div>
                </motion.section>

                <div className="flex flex-nowrap items-center justify-center gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] sm:gap-2 sm:px-2 [&::-webkit-scrollbar]:hidden">
                    {statCards.map((card, index) => (
                        <StatCard key={card.label} index={index} label={card.label} value={card.value} />
                    ))}
                </div>

                {message ? (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 backdrop-blur-xl"
                    >
                        <CheckCircle2 size={18} />
                        <span>{message}</span>
                    </motion.div>
                ) : null}

                <div className="flex flex-wrap gap-2 px-1 py-2 sm:gap-3 sm:px-2">
                    <SectionSwitchButton icon={<Play size={16} />} active={activePanel === "history"} onClick={() => setActivePanel("history")}>
                        Continue Watching
                    </SectionSwitchButton>
                    <SectionSwitchButton icon={<UploadCloud size={16} />} active={activePanel === "uploads"} onClick={() => {
                        setActivePanel("uploads")
                        setUploadVisibility("public")
                    }}>
                        Uploads
                    </SectionSwitchButton>
                    <span className="basis-full sm:hidden" aria-hidden="true" />
                    <SectionSwitchButton icon={<ListVideo size={16} />} onClick={() => navigate("/playlists")}>
                        Playlists
                    </SectionSwitchButton>
                    <SectionSwitchButton icon={<Heart size={16} />} onClick={() => navigate("/favorites")}>
                        Favourites
                    </SectionSwitchButton>
                    {user?.platformAdmin ? (
                        <SectionSwitchButton icon={<Shield size={16} />} onClick={() => navigate("/admin")}>
                            Admin
                        </SectionSwitchButton>
                    ) : null}
                </div>

                {activePanel === "history" ? (
                    <SectionShell
                        title="Continue Watching"
                    >
                        {history.length > 0 ? (
                            <>
                                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                                    {history.map((video, index) => (
                                        <ShowcaseVideoCard
                                            key={`${video.publicId || video.id || "history"}-${index}`}
                                            video={video}
                                            badge="Resume"
                                            secondaryActionLabel=""
                                        />
                                    ))}
                                </div>
                            </>
                        ) : (
                            <EmptyState
                                icon={<Play size={22} />}
                                title="No recent watching yet"
                                description="Start a video and your recent playback lane will appear here for quick resume access."
                                actionLabel="Go Home"
                                onAction={() => navigate("/")}
                            />
                        )}
                    </SectionShell>
                ) : (
                    <SectionShell
                        eyebrow="Creator vault"
                        title="Your Uploads"
                        subtitle="Manage public, private, and organization content inside a premium media showcase."
                        rightContent={
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                                {availableUploadTabs.some((tab) => tab.key !== "public") ? (
                                    <div className="flex flex-wrap gap-2">
                                        {availableUploadTabs.map((tab) => (
                                            <button
                                                key={tab.key}
                                                onClick={() => handleUploadHeaderButtonClick(tab.key)}
                                                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                                                    uploadVisibility === tab.key
                                                        ? "border-cyan-300/18 bg-cyan-400/12 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_10px_28px_rgba(14,165,233,0.14)]"
                                                        : "border-white/10 bg-white/[0.05] text-slate-300/78 hover:bg-white/[0.08] hover:text-white"
                                                }`}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                                <button
                                    onClick={() => navigate("/upload")}
                                    className="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                                >
                                    <UploadCloud size={15} />
                                    Upload Video
                                </button>
                            </div>
                        }
                    >
                        {uploadVideos.length > 0 ? (
                            <>
                                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                                    {uploadVideos.map((video, index) => (
                                        <ShowcaseVideoCard
                                            key={`${video.publicId}-${index}`}
                                            video={video}
                                            badge={uploadVisibility === "organization" ? "Organization" : uploadVisibility === "private" ? "Private" : "Published"}
                                            onEdit={() => openVideoEditor(video)}
                                            secondaryActionLabel="Edit"
                                        />
                                    ))}
                                </div>
                                <div className="mt-4 flex flex-wrap gap-3">
                                    <Pill icon={<UploadCloud size={14} />}>{uploadVideos.length} visible in this lane</Pill>
                                    <Pill icon={<Eye size={14} />}>{uploadVisibility} showcase active</Pill>
                                </div>
                            </>
                        ) : (
                            <EmptyState
                                icon={<UploadCloud size={22} />}
                                title="Build your creator vault"
                                description="Upload a video or change visibility lanes to populate this cinematic showcase."
                                actionLabel="Go to Upload"
                                onAction={() => navigate("/upload")}
                            />
                        )}
                    </SectionShell>
                )}
            </div>

            <AnimatePresence>
                {editOpen ? (
                    <EditModal
                        userName={user?.name}
                        avatarUrl={user?.avatarUrl}
                        avatarKey={user?.avatarKey}
                        coverUrl={user?.coverUrl}
                        name={name}
                        setName={setName}
                        channelName={channelName}
                        setChannelName={setChannelName}
                        description={description}
                        setDescription={setDescription}
                        onAvatarChange={uploadAvatar}
                        onCoverChange={uploadCover}
                        onClose={() => setEditOpen(false)}
                        onSave={saveProfile}
                    />
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
                {editingVideo ? (
                    <EditVideoModal
                        video={editingVideo}
                        videoTitle={videoTitle}
                        setVideoTitle={setVideoTitle}
                        videoDescription={videoDescription}
                        setVideoDescription={setVideoDescription}
                        videoThumbnailPreview={videoThumbnailPreview}
                        videoSpritesheet={videoSpritesheet}
                        loadingSpritesheet={loadingSpritesheet}
                        spritesheetError={spritesheetError}
                        selectedSpriteFrameIndex={selectedSpriteFrameIndex}
                        setSelectedSpriteFrameIndex={setSelectedSpriteFrameIndex}
                        handleUploadVideoThumbnail={handleUploadVideoThumbnail}
                        loadVideoSpritesheet={() => void loadVideoSpritesheet(editingVideo.id)}
                        saveSpriteSelectionAsThumbnail={saveSpriteSelectionAsThumbnail}
                        savingSprite={savingSprite}
                        savingVideo={savingVideo}
                        confirmDelete={confirmDelete}
                        setConfirmDelete={setConfirmDelete}
                        onClose={() => setEditingVideo(null)}
                        onSave={saveVideoEdit}
                        onDelete={deleteVideo}
                    />
                ) : null}
            </AnimatePresence>
        </AppLayout>
    )
}

const SectionShell = ({
    children,
    eyebrow,
    title,
    subtitle,
    rightContent,
    sectionRef
}: {
    children: ReactNode
    eyebrow?: string
    title: string
    subtitle?: string
    rightContent?: ReactNode
    sectionRef?: React.RefObject<HTMLDivElement | null>
}) => (
    <motion.section
        ref={sectionRef}
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6 }}
        className="px-1 py-3 sm:px-2 sm:py-5"
    >
        <div className="mb-5 flex flex-col gap-4 pb-3 sm:mb-7 sm:pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
                {eyebrow ? (
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/54 sm:text-xs sm:tracking-[0.28em]">{eyebrow}</p>
                ) : null}
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-[2.15rem]">{title}</h2>
                {subtitle ? (
                    <p className="max-w-3xl text-sm leading-6 text-slate-300/68 sm:text-base sm:leading-7">{subtitle}</p>
                ) : null}
            </div>
            {rightContent}
        </div>
        {children}
    </motion.section>
)

const Badge = ({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "teal" }) => (
    <span
        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-xl sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.28em] ${
            tone === "teal"
                ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100/84"
                : "border-white/12 bg-white/8 text-slate-200/74"
        }`}
    >
        {children}
    </span>
)

const Pill = ({ children, icon }: { children: ReactNode; icon?: ReactNode }) => (
    <span className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 text-xs text-slate-100/86 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:rounded-full sm:px-4 sm:text-sm">
        {icon}
        {children}
    </span>
)

const HeroActionButton = ({
    children,
    icon,
    primary,
    onClick
}: {
    children: ReactNode
    icon: ReactNode
    primary?: boolean
    onClick: () => void
}) => (
    <motion.button
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={onClick}
        className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition sm:gap-3 sm:rounded-full sm:px-5 sm:py-3 ${
            primary
                ? "border border-cyan-300/24 bg-[linear-gradient(135deg,rgba(56,189,248,0.95),rgba(168,85,247,0.92))] text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.34)]"
                : "border border-white/12 bg-white/[0.08] text-white shadow-[0_12px_34px_rgba(5,8,22,0.24)] backdrop-blur-xl hover:bg-white/[0.12]"
        }`}
    >
        {icon}
        {children}
    </motion.button>
)

const SectionSwitchButton = ({
    children,
    icon,
    onClick,
    active
}: {
    children: ReactNode
    icon: ReactNode
    onClick: () => void
    active?: boolean
}) => (
    <motion.button
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        onClick={onClick}
        className={`inline-flex min-w-fit shrink-0 items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-xs font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition sm:gap-2 sm:rounded-full sm:px-4 sm:text-sm ${
            active
                ? "border-cyan-300/18 bg-cyan-400/12 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_10px_28px_rgba(14,165,233,0.14)]"
                : "border-white/12 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14]"
        }`}
    >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 text-center leading-tight">{children}</span>
    </motion.button>
)

const StatCard = ({
    label,
    value,
    index
}: {
    label: string
    value: number
    index: number
}) => (
    <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 * index, duration: 0.55 }}
        whileHover={{ y: -2 }}
        className="group shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 backdrop-blur-xl transition hover:border-cyan-200/22 hover:bg-white/[0.085] sm:px-3 sm:py-2"
    >
        <div className="flex items-center justify-center gap-1.5 sm:gap-2">
            <p className="whitespace-nowrap text-[0.56rem] font-semibold uppercase tracking-[0.12em] text-cyan-100/62 sm:text-[0.62rem] sm:tracking-[0.16em]">{label}</p>
            <span className="h-1 w-1 shrink-0 rounded-full bg-cyan-200/60" />
            <p className="text-base font-black leading-none tracking-tight text-white sm:text-lg">{value}</p>
        </div>
    </motion.div>
)

const ShowcaseVideoCard = ({
    video,
    badge,
    onEdit,
    secondaryActionLabel
}: {
    video: Video
    badge: string
    onEdit?: () => void
    secondaryActionLabel?: string
}) => {
    const navigate = useNavigate()
    const targetId = video.publicId ?? String(video.id ?? "")
    const isPortrait = video.orientation === "PORTRAIT"
    const openVideo = () => {
        if (!targetId) return
        navigate(isPortrait ? `/portrait/${targetId}` : `/video/${targetId}`, { state: { video } })
    }

    return (
        <motion.article
            whileHover={{ y: -8, rotateX: 1.5, rotateY: -1.5 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            onClick={openVideo}
            className="group cursor-pointer overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_22px_65px_rgba(5,8,20,0.24)] sm:rounded-[30px]"
            style={{ transformStyle: "preserve-3d", perspective: "1400px" }}
        >
            <div className="relative overflow-hidden">
                <img
                    src={getThumb(video)}
                    alt={getTitle(video)}
                    onError={(event) => {
                        event.currentTarget.src = "/placeholder.jpg"
                    }}
                    className={`w-full object-cover transition-transform duration-700 group-hover:scale-105 ${isPortrait ? "h-72 sm:h-[28rem]" : "h-52 sm:h-72"}`}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,8,20,0.04),rgba(6,8,20,0.22)_40%,rgba(5,7,18,0.86))]" />
                <div className="absolute left-3 right-3 top-3 flex items-center justify-between gap-2 sm:left-4 sm:right-4 sm:top-4 sm:gap-3">
                    <Badge tone="teal">{badge}</Badge>
                    <Badge>{getDurationLabel(video)}</Badge>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgba(5,7,18,0.94))]" />
            </div>

            <div className="space-y-3 px-4 py-4 sm:space-y-4 sm:px-5 sm:py-5">
                <div className="space-y-2">
                    <div className="flex items-start gap-3">
                        <h3 className="line-clamp-2 min-w-0 flex-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">{getTitle(video)}</h3>
                        {onEdit ? (
                            <button
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onEdit()
                                }}
                                aria-label={secondaryActionLabel || "Edit video"}
                                title={secondaryActionLabel || "Edit video"}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/[0.1]"
                            >
                                <PencilLine size={16} />
                            </button>
                        ) : null}
                    </div>
                    <p className="truncate text-sm text-slate-300/72 sm:text-base">{getChannel(video)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300/66">
                    <span>{getTimeAgoLabel(video.createdAt)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#67e8f9,#60a5fa,#c084fc)]"
                        style={{ width: `${getProgressValue(video)}%` }}
                    />
                </div>
            </div>
        </motion.article>
    )
}

const EmptyState = ({
    icon,
    title,
    description,
    actionLabel,
    onAction
}: {
    icon: ReactNode
    title: string
    description: string
    actionLabel: string
    onAction: () => void
}) => (
    <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-4 py-8 text-center sm:min-h-[18rem] sm:rounded-[28px] sm:px-6 sm:py-10">
        <div className="mb-5 rounded-full border border-white/10 bg-white/[0.07] p-4 text-cyan-100 shadow-[0_0_28px_rgba(56,189,248,0.16)]">
            {icon}
        </div>
        <h3 className="text-xl font-semibold text-white sm:text-2xl">{title}</h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300/68 sm:text-base sm:leading-7">{description}</p>
        <button
            onClick={onAction}
            className="mt-6 rounded-full border border-cyan-300/16 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/16"
        >
            {actionLabel}
        </button>
    </div>
)

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <label className="block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-purple-100/50">{label}</span>
        {children}
    </label>
)

const EditModal = ({
    userName,
    avatarUrl,
    avatarKey,
    coverUrl,
    name,
    setName,
    channelName,
    setChannelName,
    description,
    setDescription,
    onAvatarChange,
    onCoverChange,
    onClose,
    onSave
}: EditModalProps) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.28),transparent_32%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.16),transparent_28%),rgba(10,11,20,0.46)] px-3 py-4 backdrop-blur-lg sm:px-4"
        onClick={onClose}
    >
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white/14 bg-[linear-gradient(145deg,rgba(92,60,168,0.92),rgba(46,37,96,0.94)_42%,rgba(24,24,45,0.96))] p-4 shadow-[0_24px_80px_rgba(6,8,20,0.34)] sm:rounded-[28px] sm:p-6"
            onClick={(event) => event.stopPropagation()}
        >
            <div className="space-y-6">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                    <div>
                        <h2 className="text-2xl font-semibold text-white">Edit Profile</h2>
                        <p className="mt-1 text-sm text-purple-100/65">Refresh your public profile, visuals, and channel identity.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/10 text-purple-100/80 transition hover:bg-white/16 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-purple-100/52">Profile Photo</p>
                        <p className="mt-1 text-sm text-purple-100/58">Update the face viewers see across your channel.</p>
                        <div className="mt-4 flex items-center gap-4">
                            <UserAvatar
                                name={userName || name}
                                avatarUrl={avatarUrl}
                                avatarKey={avatarKey}
                                className="h-18 w-18 border-2 border-white/20 text-lg shadow-lg"
                            />
                            <label className="cursor-pointer rounded-xl border border-white/10 bg-white/14 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20">
                                Change
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0]
                                        if (file) onAvatarChange(file)
                                    }}
                                />
                            </label>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-purple-100/52">Cover Photo</p>
                        <p className="mt-1 text-sm text-purple-100/58">Choose a banner that gives your page more energy.</p>
                        <div className="mt-4 flex items-center gap-4">
                            <img
                                src={coverUrl || "/placeholder.jpg"}
                                alt="Cover preview"
                                className="h-18 w-32 rounded-xl border border-white/12 object-cover shadow-lg"
                            />
                            <label className="cursor-pointer rounded-xl border border-white/10 bg-white/14 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20">
                                Change
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0]
                                        if (file) onCoverChange(file)
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <Field label="Name">
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black/12 px-4 py-3 text-sm text-white placeholder:text-purple-100/30 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
                        />
                    </Field>
                    <Field label="Channel Title">
                        <input
                            value={channelName}
                            onChange={(event) => setChannelName(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-black/12 px-4 py-3 text-sm text-white placeholder:text-purple-100/30 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
                        />
                    </Field>
                    <Field label="Channel Description">
                        <textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            rows={4}
                            className="w-full rounded-2xl border border-white/10 bg-black/12 px-4 py-3 text-sm text-white placeholder:text-purple-100/30 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
                        />
                    </Field>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
                    <button
                        onClick={onClose}
                        className="rounded-xl border border-white/10 bg-white/12 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/18"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        className="rounded-xl bg-linear-to-r from-violet-500 via-purple-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(168,85,247,0.34)] transition hover:brightness-110"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </motion.div>
    </motion.div>
)

const EditVideoModal = ({
    video,
    videoTitle,
    setVideoTitle,
    videoDescription,
    setVideoDescription,
    videoThumbnailPreview,
    videoSpritesheet,
    loadingSpritesheet,
    spritesheetError,
    selectedSpriteFrameIndex,
    setSelectedSpriteFrameIndex,
    handleUploadVideoThumbnail,
    loadVideoSpritesheet,
    saveSpriteSelectionAsThumbnail,
    savingSprite,
    savingVideo,
    confirmDelete,
    setConfirmDelete,
    onClose,
    onSave,
    onDelete
}: EditVideoModalProps & {
    confirmDelete: boolean
    setConfirmDelete: (value: boolean) => void
}) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.28),transparent_32%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.16),transparent_28%),rgba(10,11,20,0.46)] px-3 py-4 backdrop-blur-lg sm:px-4"
        onClick={onClose}
    >
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[24px] border border-white/14 bg-[linear-gradient(145deg,rgba(62,37,120,0.94),rgba(26,24,55,0.96)_42%,rgba(15,18,38,0.98))] shadow-[0_26px_90px_rgba(6,8,20,0.4)] sm:rounded-[30px]"
            onClick={(event) => event.stopPropagation()}
        >
            <div className="flex flex-col">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
                    <div>
                        <h2 className="text-2xl font-semibold text-white">Edit Video</h2>
                        <p className="mt-1 text-sm text-purple-100/65">
                            Fine-tune title, description, and thumbnail for{" "}
                            <span className="font-medium text-white">{video.title || video.aiTitle || "this video"}</span>.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-gray-300 transition hover:bg-white/14 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
                    <div className="space-y-5">
                        {confirmDelete ? (
                            <div className="rounded-2xl border border-red-500/22 bg-red-500/10 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-red-200">Are you sure you want to delete this video?</p>
                                        <p className="mt-1 text-xs text-red-100/75">This action will permanently remove the video.</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setConfirmDelete(false)}
                                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/16"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={onDelete}
                                            className="rounded-xl bg-red-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-red-500"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <Field label="Title">
                                    <input
                                        value={videoTitle}
                                        onChange={(event) => setVideoTitle(event.target.value)}
                                        aria-label="video title"
                                        className="w-full rounded-2xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-white placeholder:text-purple-100/28 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
                                    />
                                </Field>

                                <Field label="Description">
                                    <textarea
                                        value={videoDescription}
                                        onChange={(event) => setVideoDescription(event.target.value)}
                                        rows={5}
                                        aria-label="video description"
                                        className="w-full rounded-2xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-white placeholder:text-purple-100/28 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
                                    />
                                </Field>
                            </div>

                            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-purple-100/45">Thumbnail</p>
                                    <p className="mt-1 text-xs text-purple-100/55">Upload a custom frame or keep the current preview.</p>
                                </div>

                                {videoThumbnailPreview ? (
                                    <img
                                        src={videoThumbnailPreview}
                                        alt="Thumbnail preview"
                                        className="h-44 w-full rounded-2xl border border-white/10 object-cover shadow-lg"
                                    />
                                ) : (
                                    <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-white/14 bg-black/20 text-sm text-purple-100/45">
                                        No thumbnail preview yet
                                    </div>
                                )}

                                <label className="flex cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/12 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/18">
                                    Upload Thumbnail
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        aria-label="upload thumbnail"
                                        onChange={(event) => handleUploadVideoThumbnail(event.target.files?.[0])}
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <label className="text-xs font-medium uppercase tracking-[0.16em] text-purple-100/45">Spritesheet Thumbnail</label>
                                    <p className="mt-1 text-xs text-purple-100/55">
                                        Select a frame from the generated spritesheet once it finishes loading automatically.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={loadVideoSpritesheet}
                                    disabled={loadingSpritesheet}
                                    className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loadingSpritesheet ? "Loading..." : videoSpritesheet ? "Reload Spritesheet" : "Retry Now"}
                                </button>
                            </div>

                            {videoSpritesheet ? (
                                <SpritesheetPicker
                                    spritesheet={videoSpritesheet}
                                    selectedFrameIndex={selectedSpriteFrameIndex}
                                    onSelectFrame={(frameIndex) => setSelectedSpriteFrameIndex(frameIndex)}
                                    onReset={() => setSelectedSpriteFrameIndex(null)}
                                    onSave={saveSpriteSelectionAsThumbnail}
                                    saving={savingSprite}
                                    saveLabel="Use Selected Frame As Thumbnail"
                                />
                            ) : (
                                <div className="rounded-2xl border border-dashed border-white/10 bg-black/18 px-4 py-5 text-sm text-purple-100/60">
                                    {loadingSpritesheet
                                        ? "Loading thumbnail frames from the spritesheet..."
                                        : spritesheetError || "Spritesheet frames will appear here automatically."}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
                    <button
                        onClick={() => setConfirmDelete(true)}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-500/22 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-200 transition hover:bg-red-500/18"
                    >
                        <Trash2 size={16} />
                        Delete Video
                    </button>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/16"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onSave}
                            disabled={savingVideo}
                            className="rounded-xl bg-linear-to-r from-violet-500 via-purple-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(168,85,247,0.35)] transition hover:brightness-110 disabled:opacity-60"
                        >
                            {savingVideo ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    </motion.div>
)

export default ProfilePage
