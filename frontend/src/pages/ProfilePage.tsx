import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"

import AppLayout from "@/layouts/AppLayout"
import { api } from "@/api/axios"
import VideoCard from "@/components/VideoCard"
import { useAuth } from "@/context/AuthContext"
import UserAvatar from "@/components/UserAvatar"
import SpritesheetPicker from "@/components/SpritesheetPicker"
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
    channel?: {
        name?: string
    }
}

interface RawVideo {
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
    channel?: {
        name?: string
    }
}

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

    const [activeTab, setActiveTab] = useState<"history" | "uploads">("history")
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
    const [hiddenUploadIds, setHiddenUploadIds] = useState<string[]>(() => {
        const key = authUser?.id ? `profile:hidden-videos:${authUser.id}` : "profile:hidden-videos:guest"
        try {
            const stored = localStorage.getItem(key)
            return stored ? JSON.parse(stored) : []
        } catch {
            return []
        }
    })

    const normalizeVideos = (arr: RawVideo[]): Video[] => {
        if (!Array.isArray(arr)) return []

        return arr.map(v => ({
            id: v.id,
            publicId: v.publicId,
            title: v.title || v.aiTitle || "Untitled",
            aiTitle: v.aiTitle ?? undefined,
            aiDescription: v.aiDescription ?? undefined,
            thumbnailKey: v.thumbnailKey,
            uploaderAvatarKey: v.uploaderAvatarKey ?? undefined,
            uploaderAvatarUrl: v.uploaderAvatarUrl ?? undefined,
            uploaderName: v.uploaderName ?? undefined,
            createdAt: v.createdAt ?? undefined,
            channel: v.channel ?? undefined
        }))
    }

    const fetchProfile = useCallback(async () => {
        try {
            const res = await api.get("/user/me")
            const data = res.data?.data || {}

            setUser(data.user || null)
            if (data.user) {
                updateUser(data.user)
            }

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
            }

            setName(data.user?.name || "")
            setChannelName(data.channel?.name || "")
            setDescription(data.channel?.description || "")

        } catch (err) {
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
        setCachedPageData<ProfilePageCache>("page:profile", {
            user,
            stats,
            publicVideos,
            privateVideos,
            organizationVideos,
            history,
            name,
            channelName,
            description
        }, 120000)
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
        } catch (err) {
            setMessage("Failed to update profile.")
        }
    }

    const uploadAvatar = async (file: File) => {
        try {
            const uploadRes = await api.post("/user/avatar-upload-url", {
                fileType: file.type
            })

            const { uploadUrl, key } = uploadRes.data

            await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file
            })

            await api.post("/user/avatar", { key })
            await fetchProfile()
            setMessage("Avatar updated.")
        } catch (err) {
            setMessage("Failed to update avatar.")
        }
    }

    const uploadCover = async (file: File) => {
        try {
            const uploadRes = await api.post("/user/cover-upload-url", {
                fileType: file.type
            })

            const { uploadUrl, key } = uploadRes.data

            await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file
            })

            await api.post("/user/cover", { key })
            await fetchProfile()
            setMessage("Cover photo updated.")
        } catch (err) {
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
        } catch (err) {
            setVideoSpritesheet(null)
            if (axios.isAxiosError(err) && err.response?.status === 404) {
                setSpritesheetError("Spritesheet is being generated. It will appear here automatically.")
            } else {
                setSpritesheetError("Failed to load spritesheet thumbnail frames.")
            }
            return false
        } finally {
            setLoadingSpritesheet(false)
        }
    }, [])

    const openVideoEditor = async (video: Video) => {
        setEditingVideo(video)
        setVideoTitle(video.title || "")
        setVideoDescription(video.aiDescription || "")
        setVideoThumbnailKey(video.thumbnailKey)
        setVideoThumbnailPreview(
            video.thumbnailKey
                ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}`
                : undefined
        )
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
            if (timeoutId) {
                clearTimeout(timeoutId)
            }
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
        } catch (err) {
            setMessage("Failed to upload thumbnail.")
        }
    }

    const saveSpriteSelectionAsThumbnail = async () => {
        if (!editingVideo?.id || selectedSpriteFrameIndex === null) return

        try {
            setSavingSprite(true)
            const res = await api.post(
                `/video/upload/${editingVideo.id}/spritesheet/select-thumbnail`,
                { frameIndex: selectedSpriteFrameIndex }
            )

            const data = res.data?.data
            setVideoThumbnailKey(data?.thumbnailKey)
            if (data?.thumbnailUrl) {
                setVideoThumbnailPreview(data.thumbnailUrl)
            }
        } catch (err) {
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
        } catch (err) {
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
            setMessage("")
        } catch (err) {
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

    const ownUploadCount = useMemo(
        () => visiblePublicVideos.length + visiblePrivateVideos.length + visibleOrganizationVideos.length,
        [visiblePublicVideos.length, visiblePrivateVideos.length, visibleOrganizationVideos.length]
    )

    const availableUploadTabs = useMemo(() => {
        const tabs: { key: "public" | "private" | "organization"; label: string }[] = []
        if (visiblePublicVideos.length > 0) tabs.push({ key: "public", label: "Public" })
        if (visiblePrivateVideos.length > 0) tabs.push({ key: "private", label: "Private" })
        if (visibleOrganizationVideos.length > 0) tabs.push({ key: "organization", label: "Organization" })
        if (tabs.length === 0) tabs.push({ key: "public", label: "Public" })
        return tabs
    }, [visiblePublicVideos.length, visiblePrivateVideos.length, visibleOrganizationVideos.length])

    useEffect(() => {
        if (!availableUploadTabs.find((t) => t.key === uploadVisibility)) {
            setUploadVisibility(availableUploadTabs[0].key)
        }
    }, [availableUploadTabs, uploadVisibility])

    if (loading) {
        return (
            <AppLayout>
                <div className="animate-pulse h-40 bg-gray-800 rounded-xl" />
            </AppLayout>
        )
    }

    const joinedYear = user?.createdAt ? new Date(user.createdAt).getFullYear() : "—"

    return (
        <AppLayout>
            <div className="space-y-6 pb-8">

                {/* HERO SECTION */}
                <div className="relative">

                    {/* COVER */}
                    <div className="relative h-32 sm:h-40 md:h-52 rounded-2xl overflow-hidden">
                        <img
                            src={user?.coverUrl || "https://i.pinimg.com/originals/4f/de/0e/4fde0ed05a14d7f6c1a0b19daec5a731.jpg"}
                            alt="Profile banner"
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    </div>

                    {/* PROFILE INFO */}
                    <div className="relative z-10 px-4 sm:px-6 -mt-12 sm:-mt-16">

                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">

                            {/* LEFT */}
                            <div className="flex items-end gap-3">

                                {/* AVATAR */}
                                <label className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-black bg-black/40 shadow-xl sm:h-28 sm:w-28 md:h-32 md:w-32">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        aria-label="profile photo"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) uploadAvatar(file)
                                        }}
                                    />

                                    <UserAvatar
                                        name={user?.name}
                                        avatarUrl={user?.avatarUrl}
                                        avatarKey={user?.avatarKey}
                                        alt={user?.name || "User avatar"}
                                        className="w-full h-full text-3xl sm:text-4xl"
                                    />

                                    <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition flex items-center justify-center text-xs">
                                        Edit
                                    </div>
                                </label>

                                {/* NAME */}
                                <div className="pb-1">
                                    <h1 className="text-lg font-bold text-white sm:text-2xl md:text-3xl">
                                        {user?.name || "User"}
                                    </h1>
                                    <p className="text-sm text-gray-400">
                                        Member since {joinedYear}
                                    </p>
                                </div>
                            </div>

                            {/* EDIT BUTTON */}
                            <button
                                onClick={() => setEditOpen(true)}
                                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black shadow transition hover:scale-[1.03]"
                            >
                                Edit Profile
                            </button>
                        </div>

                        {/* STATS */}
                        <div className="mt-4">
                            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-2.5">
                                <InlineStat label="Uploads" value={ownUploadCount} />
                                <InlineStat label="Favorites" value={stats?.favorites || 0} />
                                <InlineStat label="Playlists" value={stats?.playlists || 0} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* MESSAGE */}
                {message && (
                    <div className="px-4 sm:px-6">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2 text-sm text-emerald-300">
                            {message}
                        </div>
                    </div>
                )}

                {/* TABS + ACTIONS */}
                <div className="px-4 sm:px-6">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <Pill
                            label="Continue Watching"
                            active={activeTab === "history"}
                            onClick={() => setActiveTab("history")}
                        />

                        <Pill
                            label="Uploads"
                            active={activeTab === "uploads"}
                            onClick={() => setActiveTab("uploads")}
                        />

                        <QuickNavPill
                            label="Organization"
                            onClick={() => navigate("/organization")}
                        />

                        {(user?.email === "samakshrastogi885@gmail.com" || user?.platformAdmin) && (
                            <QuickNavPill
                                label="Admin"
                                onClick={() => navigate("/admin")}
                            />
                        )}

                    </div>
                </div>

                {/* UPLOAD FILTER */}
                {activeTab === "uploads" && (
                    <div className="px-4 sm:px-6">
                        <div className="flex flex-wrap items-center gap-3 sm:justify-between">
                            <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-1.5 shadow-sm backdrop-blur">
                                {availableUploadTabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setUploadVisibility(tab.key)}
                                        className={`rounded-xl px-3.5 py-2 text-xs font-medium transition ${uploadVisibility === tab.key
                                            ? "bg-white text-black shadow-sm"
                                            : "text-gray-300 hover:bg-white/10"
                                            }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => navigate("/upload")}
                                className="sm:ml-auto inline-flex items-center rounded-full border border-fuchsia-300/20 bg-gradient-to-r from-fuchsia-600 via-violet-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(139,92,246,0.28)] transition hover:scale-[1.02] hover:brightness-110"
                            >
                                + Upload Video
                            </button>
                        </div>
                    </div>
                )}

                {/* CONTENT */}
                <div className="px-4 sm:px-6">
                    {activeTab === "history" ? (
                        <VideoGrid videos={history} />
                    ) : (
                        <EditableVideoGrid videos={uploadVideos} onEdit={openVideoEditor} />
                    )}
                </div>
            </div>

            {editOpen && (
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
            )}

            {editingVideo && (
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
                    onClose={() => setEditingVideo(null)}
                    onSave={saveVideoEdit}
                    onDelete={deleteVideo}
                />
            )}
        </AppLayout>
    )
}

const InlineStat = ({
    label,
    value
}: {
    label: string
    value: number
}) => (
    <div className="inline-flex min-w-0 w-full items-center gap-2 rounded-full border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] px-3 py-2 sm:min-w-[124px] sm:w-auto sm:gap-3 sm:px-4 sm:py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur">
        <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white/10 px-2 text-base font-bold tracking-tight text-white sm:h-9 sm:min-w-9 sm:text-lg">
            {value}
        </div>
        <div className="leading-tight">
            <span className="block text-[9px] font-medium uppercase tracking-[0.16em] text-purple-100/45 sm:text-[10px] sm:tracking-[0.22em]">
                Total
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-purple-100/75 sm:text-xs sm:tracking-[0.18em]">
                {label}
            </span>
        </div>
    </div>
)

const QuickNavPill = ({
    label,
    count,
    onClick
}: {
    label: string
    count?: number
    onClick: () => void
}) => (
    <button
        onClick={onClick}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-medium text-purple-100/85 transition hover:bg-white/[0.09] hover:text-white"
    >
        {typeof count === "number" ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white">
                {count}
            </span>
        ) : null}
        <span>{label}</span>
    </button>
)

const VideoGrid = ({ videos }: { videos: Video[] }) => {

    if (!videos.length) {
        return (
            <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent px-6 py-14 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur">
                <p className="text-xl font-semibold text-white">Nothing to continue yet</p>
                <p className="mt-2 text-sm text-purple-100/55">
                    Videos you watch will appear here for quick return access.
                </p>
            </div>
        )
    }

    return (
        <div
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >

            {videos.map((v) => (
                <div
                    key={v.publicId}
                    className="w-full min-w-0 transform transition duration-200 hover:scale-[1.04]"
                >
                    <VideoCard video={v} />
                </div>
            ))}

        </div>
    )
}

const EditableVideoGrid = ({
    videos,
    onEdit
}: {
    videos: Video[]
    onEdit: (video: Video) => void
}) => {

    if (!videos.length) {
        return (
            <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent px-6 py-14 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur">
                <p className="text-xl font-semibold text-white">No uploads yet</p>
                <p className="mt-2 text-sm text-purple-100/55">
                    Upload videos to start managing your content from this profile.
                </p>
            </div>
        )
    }

    return (
        <div
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >

            {videos.map((v) => (
                <div
                    key={v.publicId}
                    className="group relative w-full min-w-0 transition duration-200 hover:scale-[1.04]"
                >
                    <VideoCard video={v} />

                    {/* EDIT BUTTON */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onEdit(v)
                        }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition bg-black/70 backdrop-blur border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white hover:bg-purple-600"
                    >
                        ✏ Edit
                    </button>

                    {/* OPTIONAL OVERLAY (HOVER EFFECT) */}
                    <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/10 transition pointer-events-none" />
                </div>
            ))}

        </div>
    )
}

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
    onClose,
    onSave,
    onDelete
}: EditVideoModalProps) => {
    const [confirmDelete, setConfirmDelete] = useState(false)

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.24),transparent_32%),rgba(8,10,20,0.62)] px-4 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-white/12 bg-[linear-gradient(145deg,rgba(41,30,78,0.96),rgba(22,22,38,0.97)_44%,rgba(14,16,28,0.98))] shadow-[0_32px_90px_rgba(0,0,0,0.42)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                    <div>
                        <h2 className="text-2xl font-semibold text-white">Edit Video</h2>
                        <p className="mt-1 text-sm text-purple-100/60">
                            Update the title, description, and thumbnail for{" "}
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

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                    <div className="space-y-5">
                    {confirmDelete && (
                        <div className="rounded-2xl border border-red-500/22 bg-red-500/10 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-red-200">
                                        Are you sure you want to delete this video?
                                    </p>
                                    <p className="mt-1 text-xs text-red-100/75">
                                        This action will delete the video.
                                    </p>
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
                    )}

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium uppercase tracking-[0.16em] text-purple-100/45">Title</label>
                                <input
                                    value={videoTitle}
                                    onChange={(e) => setVideoTitle(e.target.value)}
                                    aria-label="video title"
                                    className="w-full rounded-2xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-white placeholder:text-purple-100/28 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium uppercase tracking-[0.16em] text-purple-100/45">Description</label>
                                <textarea
                                    value={videoDescription}
                                    onChange={(e) => setVideoDescription(e.target.value)}
                                    rows={5}
                                    aria-label="video description"
                                    className="w-full rounded-2xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-white placeholder:text-purple-100/28 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
                                />
                            </div>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                            <div>
                                <p className="text-xs font-medium uppercase tracking-[0.16em] text-purple-100/45">
                                    Thumbnail
                                </p>
                                <p className="mt-1 text-xs text-purple-100/55">
                                    Upload a custom frame or keep the current preview.
                                </p>
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
                                    onChange={(e) => handleUploadVideoThumbnail(e.target.files?.[0])}
                                />
                            </label>
                        </div>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <label className="text-xs font-medium uppercase tracking-[0.16em] text-purple-100/45">
                                    Spritesheet Thumbnail
                                </label>
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

                <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <button
                        onClick={() => setConfirmDelete(true)}
                        className="rounded-xl border border-red-500/22 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-200 transition hover:bg-red-500/18"
                    >
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
        </div>
    )
}

const Pill = ({
    label,
    active,
    onClick
}: {
    label: string
    active: boolean
    onClick: () => void
}) => (
    <button
        onClick={onClick}
        className={`inline-flex items-center rounded-full border px-3.5 py-2 text-xs font-medium transition-all duration-200 ${
            active
                ? "border-white/15 bg-white text-black shadow-[0_8px_18px_rgba(255,255,255,0.12)]"
                : "border-white/10 bg-white/[0.05] text-purple-100/85 hover:bg-white/[0.09] hover:text-white"
        }`}
    >
        {label}
    </button>
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
    <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.28),transparent_32%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.16),transparent_28%),rgba(10,11,20,0.46)] px-4 backdrop-blur-lg"
        onClick={onClose}
    >
        <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/14 bg-[linear-gradient(145deg,rgba(92,60,168,0.92),rgba(46,37,96,0.94)_42%,rgba(24,24,45,0.96))] p-4 sm:p-6 shadow-[0_24px_80px_rgba(6,8,20,0.34)]"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="space-y-6">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                    <div>
                        <h2 className="text-2xl font-semibold text-white">
                            Edit Profile
                        </h2>
                        <p className="mt-1 text-sm text-purple-100/65">
                            Refresh your public profile, visuals, and channel identity.
                        </p>
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
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-purple-100/52">
                            Profile Photo
                        </p>
                        <p className="mt-1 text-sm text-purple-100/58">
                            Update the face viewers see across your channel.
                        </p>

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
                                    aria-label="profile photo"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) onAvatarChange(file)
                                    }}
                                />
                            </label>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-purple-100/52">
                            Cover Photo
                        </p>
                        <p className="mt-1 text-sm text-purple-100/58">
                            Choose a banner that gives your page more energy.
                        </p>

                        <div className="mt-4 flex items-center gap-4">
                            <img
                                src={coverUrl || "https://i.pinimg.com/originals/4f/de/0e/4fde0ed05a14d7f6c1a0b19daec5a731.jpg"}
                                alt="Cover preview"
                                className="h-18 w-32 rounded-xl border border-white/12 object-cover shadow-lg"
                            />

                            <label className="cursor-pointer rounded-xl border border-white/10 bg-white/14 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20">
                                Change
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    aria-label="cover photo"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) onCoverChange(file)
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium uppercase tracking-[0.14em] text-purple-100/52">Name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter your name"
                            title="Name"
                            aria-label="name"
                            className="w-full rounded-2xl border border-white/10 bg-black/12 px-4 py-3 text-sm text-white placeholder:text-purple-100/30 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium uppercase tracking-[0.14em] text-purple-100/52">Channel Title</label>
                        <input
                            value={channelName}
                            onChange={(e) => setChannelName(e.target.value)}
                            placeholder="Enter channel title"
                            title="Channel Title"
                            aria-label="channel title"
                            className="w-full rounded-2xl border border-white/10 bg-black/12 px-4 py-3 text-sm text-white placeholder:text-purple-100/30 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium uppercase tracking-[0.14em] text-purple-100/52">Channel Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Tell something about your channel"
                            rows={4}
                            className="w-full rounded-2xl border border-white/10 bg-black/12 px-4 py-3 text-sm text-white placeholder:text-purple-100/30 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/70"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-white/10 pt-5">
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
        </div>
    </div>
)
export default ProfilePage
