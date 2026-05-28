import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { io } from "socket.io-client"

import { api } from "@/api/axios"
import { SOCKET_URL } from "@/config/env"
import AppLayout from "@/layouts/AppLayout"
import SpritesheetPicker from "@/components/SpritesheetPicker"

interface Channel {
    id: string
    name: string
    username: string
    description?: string
}

type UploadStatus =
    | "waiting"
    | "uploading"
    | "processing"
    | "completed"
    | "error"

type WorkerStatus =
    | "idle"
    | "processing"
    | "completed"
    | "failed"

interface SpritesheetData {
    spritesheetUrl: string
    frameWidth: number
    frameHeight: number
    cols: number
    rows: number
    totalFrames: number
    intervalSec: number
}

interface AIMetadata {
    title?: string | null
    description?: string | null
    keywords?: string[]
    tags?: string[]
}

interface UploadItem {
    file: File
    preview: string
    thumbnailPreview?: string
    thumbnailFile?: File
    thumbnailKey?: string
    spritesheet?: SpritesheetData
    selectedSpriteFrameIndex?: number
    isSavingSpriteSelection?: boolean
    duration: number

    uploadProgress: number
    aiProgress: number
    thumbnailProgress: number
    aiStatus: WorkerStatus
    thumbnailStatus: WorkerStatus

    speed: number
    status: UploadStatus

    title: string
    description: string
    tags: string

    videoId?: string
}

const socket = io(SOCKET_URL, {
    path: "/socket.io",
    transports: ["websocket"]
})

const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))

const isWorkerFinished = (status: WorkerStatus) =>
    status === "completed" || status === "failed"

const syncProcessingState = (item: UploadItem): UploadItem => {
    if (
        item.status === "processing" &&
        isWorkerFinished(item.aiStatus) &&
        isWorkerFinished(item.thumbnailStatus)
    ) {
        return {
            ...item,
            status: "completed"
        }
    }

    return item
}

const Upload = () => {

    const navigate = useNavigate()

    const [channel, setChannel] = useState<Channel | null>(null)
    const [loadingChannel, setLoadingChannel] = useState(true)
    const [creatingChannel, setCreatingChannel] = useState(false)
    const [channelNameInput, setChannelNameInput] = useState("")
    const [channelDescriptionInput, setChannelDescriptionInput] = useState("")
    const [channelError, setChannelError] = useState("")
    const [channelSuggestions, setChannelSuggestions] = useState<string[]>([])

    const [queue, setQueue] = useState<UploadItem[]>([])
    const [uploading, setUploading] = useState(false)
    const [globalVisibility, setGlobalVisibility] = useState<"PUBLIC" | "PRIVATE" | "ORGANIZATION">("PUBLIC")

    const fetchAIMetadata = async (videoId: string) => {
        let lastError: unknown = null

        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const res = await api.get(`/ai/video/${videoId}`)
                const payload = (res.data?.data ?? res.data) as AIMetadata
                return payload
            } catch (err) {
                lastError = err
                await wait(1200)
            }
        }

        throw lastError
    }

    const fetchSpritesheetMetadata = async (videoId: string) => {
        let lastError: unknown = null

        for (let attempt = 0; attempt < 20; attempt++) {
            try {
                const res = await api.get(`/video/upload/${videoId}/spritesheet`)
                return res.data?.data as SpritesheetData
            } catch (err) {
                lastError = err
                await wait(1000)
            }
        }

        throw lastError
    }

    /* ---------------- SOCKET EVENTS ---------------- */

    useEffect(() => {

        socket.on("connect", () => {
        })

        socket.on("connect_error", () => {
        })

        socket.on("ai-progress", ({ videoId, progress }) => {
            setQueue(prev =>
                prev.map(item =>
                    String(item.videoId) === String(videoId)
                        ? syncProcessingState({
                            ...item,
                            aiProgress: Number(progress) || 0,
                            aiStatus: "processing",
                            status: "processing"
                        })
                        : item
                )
            )
        })
        socket.on("ai-completed", async ({ videoId }) => {

            if (!videoId) return

            try {
                const ai = await fetchAIMetadata(videoId)

                setQueue(prev =>
                    prev.map(item =>
                        String(item.videoId) === String(videoId)
                            ? syncProcessingState({
                                ...item,
                                aiProgress: 100,
                                aiStatus: "completed",
                                status: "processing",

                                title: item.title.trim() ? item.title : (ai.title ?? ""),
                                description: item.description.trim()
                                    ? item.description
                                    : (ai.description ?? ""),
                                tags: ai.tags?.join(", ") ?? ""
                            })
                            : item
                    )
                )

                try {
                    const spritesheet = await fetchSpritesheetMetadata(videoId)
                    setQueue(prev =>
                        prev.map(item =>
                            String(item.videoId) === String(videoId)
                                ? { ...item, spritesheet }
                                : item
                        )
                    )
                } catch (spriteErr) {
                }

            } catch (err) {
                setQueue(prev =>
                    prev.map(item =>
                        String(item.videoId) === String(videoId)
                            ? syncProcessingState({
                                ...item,
                                aiProgress: 100,
                                aiStatus: "completed",
                                status: "processing"
                            })
                            : item
                    )
                )
            }

        })
        socket.on("ai-failed", ({ videoId }) => {

            setQueue(prev =>
                prev.map(item =>
                    String(item.videoId) === String(videoId)
                        ? syncProcessingState({
                            ...item,
                            aiProgress: 100,
                            aiStatus: "failed",
                            status: "processing"
                        })
                        : item
                )
            )

        })

        socket.on("thumbnail-progress", ({ videoId, progress }) => {
            setQueue(prev =>
                prev.map(item =>
                    String(item.videoId) === String(videoId)
                        ? syncProcessingState({
                            ...item,
                            thumbnailProgress: Number(progress) || 0,
                            thumbnailStatus: "processing",
                            status: "processing"
                        })
                        : item
                )
            )
        })

        socket.on("thumbnail-completed", ({ videoId, thumbnailKey }) => {
            setQueue(prev =>
                prev.map(item =>
                    String(item.videoId) === String(videoId)
                        ? syncProcessingState({
                            ...item,
                            thumbnailKey: thumbnailKey || item.thumbnailKey,
                            thumbnailProgress: 100,
                            thumbnailStatus: "completed",
                            status: "processing"
                        })
                        : item
                )
            )
        })

        socket.on("thumbnail-failed", ({ videoId }) => {
            setQueue(prev =>
                prev.map(item =>
                    String(item.videoId) === String(videoId)
                        ? syncProcessingState({
                            ...item,
                            thumbnailProgress: 100,
                            thumbnailStatus: "failed",
                            status: "processing"
                        })
                        : item
                )
            )
        })

        return () => {
            socket.off("connect")
            socket.off("connect_error")
            socket.off("ai-progress")
            socket.off("ai-completed")
            socket.off("ai-failed")
            socket.off("thumbnail-progress")
            socket.off("thumbnail-completed")
            socket.off("thumbnail-failed")
        }

    }, [])

    /* ---------------- FETCH CHANNEL ---------------- */

    useEffect(() => {

        const fetchChannel = async () => {

            try {

                const res = await api.get("/channel/me")
                setChannel(res.data.data)

            } finally {

                setLoadingChannel(false)

            }

        }

        fetchChannel()

    }, [])

    /* ---------------- HANDLE FILES ---------------- */

    const handleFiles = (files: FileList | null) => {

        if (!files) return

        Array.from(files).forEach(file => {

            const preview = URL.createObjectURL(file)
            const video = document.createElement("video")

            video.preload = "metadata"
            video.src = preview

            video.onloadedmetadata = () => {

                const newItem: UploadItem = {

                    file,
                    preview,
                    thumbnailPreview: undefined,
                    thumbnailFile: undefined,
                    thumbnailKey: undefined,
                    spritesheet: undefined,
                    selectedSpriteFrameIndex: undefined,
                    isSavingSpriteSelection: false,
                    duration: video.duration,

                    uploadProgress: 0,
                    aiProgress: 0,
                    thumbnailProgress: 0,
                    aiStatus: "idle",
                    thumbnailStatus: "idle",

                    speed: 0,
                    status: "waiting",

                    title: "",
                    description: "",
                    tags: ""
                }

                setQueue(prev => [...prev, newItem])

            }

        })

    }

    /* ---------------- UPDATE ITEM ---------------- */

    const updateItem = (index: number, updates: Partial<UploadItem>) => {

        setQueue(prev =>
            prev.map((item, i) =>
                i === index ? { ...item, ...updates } : item
            )
        )

    }

    const setThumbnailForItem = (index: number, file?: File) => {
        if (!file) return

        const preview = URL.createObjectURL(file)
        updateItem(index, {
            thumbnailFile: file,
            thumbnailPreview: preview
        })
    }

    const selectSpriteFrame = (index: number, frameIndex: number) => {
        updateItem(index, { selectedSpriteFrameIndex: frameIndex })
    }

    const saveSpriteFrameAsThumbnail = async (index: number) => {
        const item = queue[index]
        if (!item.videoId || item.selectedSpriteFrameIndex === undefined) return

        try {
            updateItem(index, { isSavingSpriteSelection: true })

            const res = await api.post(
                `/video/upload/${item.videoId}/spritesheet/select-thumbnail`,
                { frameIndex: item.selectedSpriteFrameIndex }
            )

            const data = res.data?.data

            updateItem(index, {
                thumbnailKey: data?.thumbnailKey,
                thumbnailPreview: data?.thumbnailUrl || item.thumbnailPreview,
                isSavingSpriteSelection: false
            })
        } catch (err) {
            updateItem(index, { isSavingSpriteSelection: false })
        }
    }

    const loadSpritesheetForItem = async (index: number) => {
        const item = queue[index]
        if (!item.videoId) return

        try {
            const spritesheet = await fetchSpritesheetMetadata(item.videoId)
            updateItem(index, { spritesheet })
        } catch (err) {
        }
    }



    /* ---------------- START QUEUE ---------------- */

    const startUploadQueue = async () => {

        if (!channel) return

        setUploading(true)

        for (let i = 0; i < queue.length; i++) {

            if (queue[i].status !== "waiting") continue

            await uploadSingle(i)

        }

        setUploading(false)

    }

    /* ---------------- SINGLE UPLOAD ---------------- */

    const uploadSingle = async (index: number) => {
        const item = queue[index];

        try {
            updateItem(index, { status: "uploading" });

            /* ---------- 1. GET PRESIGNED URL ---------- */

            const presignRes = await api.post("/video/upload/presign", {
                fileName: item.file.name,
                fileType: item.file.type,
            });

            const { uploadUrl, key } = presignRes.data.data;

            /* ---------- 2. UPLOAD FILE ---------- */

            const startTime = Date.now();

            await axios.put(uploadUrl, item.file, {
                headers: { "Content-Type": item.file.type },

                onUploadProgress: (event) => {
                    if (!event.total) return;

                    const percent = Math.round(
                        (event.loaded * 100) / event.total
                    );

                    const elapsed = Math.max(
                        (Date.now() - startTime) / 1000,
                        1
                    );

                    const speed =
                        event.loaded / 1024 / 1024 / elapsed;

                    updateItem(index, {
                        uploadProgress: percent,
                        speed,
                    });
                },
            });

            /* ---------- 2.5 OPTIONAL CUSTOM THUMBNAIL ---------- */

            let thumbnailKey: string | undefined = undefined

            if (item.thumbnailFile) {
                const thumbPresignRes = await api.post("/video/upload/thumbnail-presign", {
                    fileName: item.thumbnailFile.name,
                    fileType: item.thumbnailFile.type
                })

                const {
                    uploadUrl: thumbnailUploadUrl,
                    key: uploadedThumbnailKey
                } = thumbPresignRes.data.data

                await axios.put(thumbnailUploadUrl, item.thumbnailFile, {
                    headers: { "Content-Type": item.thumbnailFile.type }
                })

                thumbnailKey = uploadedThumbnailKey
            }

            /* ---------- 3. COMPLETE UPLOAD ---------- */

            const completeRes = await api.post("/video/upload/complete", {
                key,
                title: item.title,
                description: item.description,
                tags: item.tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                duration: item.duration,
                size: item.file.size,
                visibility: globalVisibility, // ✅ IMPORTANT
                thumbnailKey
            });

            const videoId = completeRes.data.data.id;

            /* ---------- 4. FINAL STATE ---------- */

            setQueue(prev => {
                return prev.map((item, i) =>
                    i === index
                        ? syncProcessingState({
                            ...item,
                            videoId,
                            thumbnailKey: thumbnailKey ?? item.thumbnailKey,
                            thumbnailProgress: thumbnailKey ? 100 : Math.max(item.thumbnailProgress, 5),
                            aiStatus: "processing",
                            thumbnailStatus: thumbnailKey ? "completed" : "processing",
                            status: "processing",
                            uploadProgress: 100,
                        })
                        : item
                );
            });

        } catch (err) {
            updateItem(index, {
                status: "error",
            });
        }
    };

    const createChannelFirstTime = async () => {
        const trimmedName = channelNameInput.trim()
        if (!trimmedName) {
            setChannelError("Channel name is required.")
            return
        }

        try {
            setCreatingChannel(true)
            setChannelError("")
            setChannelSuggestions([])

            const res = await api.post("/channel", {
                name: trimmedName,
                description: channelDescriptionInput.trim() || undefined
            })

            setChannel(res.data?.data || null)
        } catch (err: unknown) {
            const responseData = axios.isAxiosError(err) ? err.response?.data : undefined
            const msg =
                responseData?.message || "Failed to create channel."
            setChannelError(msg)
            setChannelSuggestions(Array.isArray(responseData?.suggestions) ? responseData.suggestions : [])
        } finally {
            setCreatingChannel(false)
        }
    }
    /* ---------------- LOADING ---------------- */

    if (loadingChannel) {

        return (
            <div className="min-h-screen flex items-center justify-center text-white">
                Loading...
            </div>
        )

    }

    /* ---------------- UI ---------------- */

    return (

        <AppLayout>

            <div className="w-full px-3 sm:px-4 lg:px-6 py-6 sm:py-8 lg:py-10 space-y-8 sm:space-y-10">

                {/* HEADER */}

                <div className="flex justify-between items-center">

                    <div>
                        <h1 className="text-3xl font-bold">
                            {channel?.name}
                        </h1>

                        <p className="text-gray-400 text-sm">
                            @{channel?.username}
                        </p>
                    </div>

                    <button
                        onClick={() => navigate("/s3-import")}
                        className="rounded-xl bg-cyan-500 px-6 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
                    >
                        S3 Import
                    </button>

                </div>

                {/* DROPZONE */}

                <div
                    onClick={() => document.getElementById("fileInput")?.click()}
                    className="
                    border-2 border-dashed border-white/20
                    hover:border-purple-500
                    transition
                    rounded-[28px]
                    p-16
                    text-center
                    cursor-pointer
                    bg-[linear-gradient(145deg,rgba(16,24,44,0.94),rgba(10,15,30,0.98))]
                    backdrop-blur-xl
                    "
                >
                    <p className="text-gray-300">
                        Drag & drop videos here or click to upload
                    </p>
                </div>

                <input
                    id="fileInput"
                    type="file"
                    accept="video/*"
                    multiple
                    hidden
                    onChange={(e) => handleFiles(e.target.files)}
                />

                {!channel && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.16),_transparent_28%),rgba(5,3,14,0.82)] px-3 py-4 backdrop-blur-sm sm:px-4">
                        <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(20,18,39,0.98),rgba(11,10,28,0.98))] shadow-[0_28px_80px_rgba(0,0,0,0.45)] sm:rounded-[30px]">
                            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6 sm:py-5">
                                <div className="max-w-lg">
                                    <div className="mb-3 inline-flex rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
                                        Channel Setup
                                    </div>
                                    <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                                        Create Your Channel
                                    </h2>
                                    <p className="mt-2 text-sm leading-6 text-gray-400">
                                        Your upload workspace needs a channel first. Add a strong name and a short description so your videos have a proper home.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => navigate("/profile")}
                                    aria-label="Close and return to profile"
                                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
                                >
                                    ×
                                </button>
                            </div>

                            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                                <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
                                    <div className="space-y-5">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-200">Channel Name *</label>
                                            <input
                                                value={channelNameInput}
                                                onChange={(e) => setChannelNameInput(e.target.value)}
                                                placeholder="Enter channel name"
                                                className="w-full rounded-2xl border border-white/10 bg-[#0b1120] px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                                            />
                                            <p className="text-xs text-gray-500">
                                                Pick a name viewers will recognize easily.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-200">Channel Description</label>
                                            <textarea
                                                rows={4}
                                                value={channelDescriptionInput}
                                                onChange={(e) => setChannelDescriptionInput(e.target.value)}
                                                placeholder="Tell viewers what your channel is about"
                                                className="w-full rounded-2xl border border-white/10 bg-[#0b1120] px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                                            />
                                            <p className="text-xs text-gray-500">
                                                A short summary helps organize your first uploads.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="rounded-3xl border border-white/8 bg-white/[0.04] p-4">
                                        <h3 className="text-sm font-semibold text-white">Before you continue</h3>
                                        <div className="mt-3 space-y-3 text-sm text-gray-400">
                                            <p>1. Create one channel identity for your uploads.</p>
                                            <p>2. Add a simple description so your profile looks complete.</p>
                                            <p>3. After channel setup, you can upload videos or import from S3.</p>
                                        </div>
                                    </div>
                                </div>

                                {channelError && (
                                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                        {channelError}
                                    </div>
                                )}

                                {channelSuggestions.length > 0 && (
                                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
                                            Suggested Names
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {channelSuggestions.map((suggestion) => (
                                                <button
                                                    key={suggestion}
                                                    type="button"
                                                    onClick={() => setChannelNameInput(suggestion)}
                                                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                                                >
                                                    {suggestion}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                            </div>
                            <div className="shrink-0 border-t border-white/8 bg-[#0c0b1e]/95 px-5 py-4 backdrop-blur-xl sm:px-6">
                                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => navigate("/profile")}
                                        className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                                    >
                                        Back to Profile
                                    </button>

                                    <button
                                        type="button"
                                        onClick={createChannelFirstTime}
                                        disabled={creatingChannel}
                                        className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
                                    >
                                        {creatingChannel ? "Creating..." : "Create Channel"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* START BUTTON */}

                {queue.length > 0 && (

                    <div className="flex items-center justify-between gap-4">

                        <button
                            onClick={startUploadQueue}
                            disabled={uploading}
                            className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
                        >
                            {uploading ? "Uploading..." : "Start Uploading"}
                        </button>

                        {/* VISIBILITY TOGGLE */}

                        <div className="flex gap-4">

                            <button
                                onClick={() => setGlobalVisibility("PUBLIC")}
                                className={`px-4 py-2 rounded-lg text-sm ${globalVisibility === "PUBLIC"
                                    ? "bg-cyan-500 text-slate-950"
                                    : "bg-white/10 text-slate-300"
                                    }`}
                            >
                                Public
                            </button>

                            <button
                                onClick={() => setGlobalVisibility("PRIVATE")}
                                className={`px-4 py-2 rounded-lg text-sm ${globalVisibility === "PRIVATE"
                                    ? "bg-cyan-500 text-slate-950"
                                    : "bg-white/10 text-slate-300"
                                    }`}
                            >
                                Private
                            </button>

                            <button
                                onClick={() => setGlobalVisibility("ORGANIZATION")}
                                className={`px-4 py-2 rounded-lg text-sm ${globalVisibility === "ORGANIZATION"
                                    ? "bg-cyan-500 text-slate-950"
                                    : "bg-white/10 text-slate-300"
                                    }`}
                            >
                                Organization
                            </button>

                        </div>

                    </div>

                )}
                

                {/* QUEUE */}

                <div className="space-y-10">

                    {queue.map((item, index) => (

                        <div
                            key={index}
                            className="rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(18,28,49,0.62),rgba(10,15,28,0.78))] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-2xl space-y-6"
                        >

                            {/* VIDEO + PROGRESS */}
                            

                            <div className="flex gap-6 items-start">

                                {item.thumbnailPreview ? (
                                    <img
                                        src={item.thumbnailPreview}
                                        alt="Thumbnail preview"
                                        className="w-56 h-32 object-cover rounded-xl"
                                    />
                                ) : (
                                    <video
                                        src={item.preview}
                                        className="w-56 h-32 object-cover rounded-xl"
                                    />
                                )}

                                <div className="flex-1">

                                    <p className="mb-2 text-sm text-slate-400">
                                        Upload {item.uploadProgress}% • {item.speed.toFixed(2)} MB/s
                                    </p>

                                    <div className="w-full bg-gray-700/40 h-2 rounded-full overflow-hidden">

                                        <div
                                            className="h-2 bg-cyan-500 transition-all"
                                            style={{ width: `${item.uploadProgress}%` }}
                                        />

                                    </div>

                                    {(item.status === "processing" || item.aiStatus !== "idle" || item.thumbnailStatus !== "idle") && (

                                        <div className="mt-4 grid gap-4 md:grid-cols-2">

                                            <div>
                                                <p className="mb-1 text-sm text-slate-400">
                                                    AI Worker {item.aiProgress}% {item.aiStatus === "completed" ? "• Done" : item.aiStatus === "failed" ? "• Failed" : "• Live"}
                                                </p>

                                                <div className="w-full bg-gray-700/40 h-2 rounded-full overflow-hidden">

                                                    <div
                                                        className="h-2 bg-cyan-400 transition-all"
                                                        style={{ width: `${item.aiProgress}%` }}
                                                    />

                                                </div>
                                            </div>

                                            <div>
                                                <p className="mb-1 text-sm text-slate-400">
                                                    Thumbnail Worker {item.thumbnailProgress}% {item.thumbnailStatus === "completed" ? "• Done" : item.thumbnailStatus === "failed" ? "• Failed" : "• Live"}
                                                </p>

                                                <div className="w-full bg-gray-700/40 h-2 rounded-full overflow-hidden">

                                                    <div
                                                        className="h-2 bg-amber-400 transition-all"
                                                        style={{ width: `${item.thumbnailProgress}%` }}
                                                    />

                                                </div>
                                            </div>

                                        </div>

                                    )}

                                </div>

                            </div>

                            <div className="space-y-6">

                                {/* THUMBNAIL */}
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-400">
                                        Thumbnail
                                    </label>

                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            disabled={item.status !== "waiting"}
                                            onClick={() =>
                                                document
                                                    .getElementById(`thumbInput-${index}`)
                                                    ?.click()
                                            }
                                            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs text-white disabled:opacity-60"
                                        >
                                            Upload Thumbnail
                                        </button>

                                        <p className="text-xs text-slate-400">
                                            Leave empty to use auto-generated thumbnail
                                        </p>
                                    </div>

                                    <input
                                        id={`thumbInput-${index}`}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        disabled={item.status !== "waiting"}
                                        onChange={(e) =>
                                            setThumbnailForItem(index, e.target.files?.[0])
                                        }
                                    />
                                </div>

                                {/* TITLE */}
                                <div className="space-y-1">
                                    <label className="text-sm text-slate-400">
                                        Title
                                    </label>
                                    <input
                                        value={item.title}
                                        onChange={(e) =>
                                            updateItem(index, { title: e.target.value })
                                        }
                                        disabled={item.status !== "waiting"}
                                        placeholder="Leave empty to use autogenerated title"
                                        aria-label="Video title"
                                        className="w-full rounded-lg border border-white/10 bg-[#0b1120] px-4 py-2 text-white focus:border-cyan-400 outline-none disabled:opacity-70"
                                    />
                                </div>

                                {/* DESCRIPTION */}
                                <div className="space-y-1">
                                    <label className="text-sm text-slate-400">
                                        Description
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={item.description}
                                        onChange={(e) =>
                                            updateItem(index, { description: e.target.value })
                                        }
                                        disabled={item.status !== "waiting"}
                                        placeholder="Leave empty to use autogenerated description"
                                        aria-label="Video description"
                                        className="w-full rounded-lg border border-white/10 bg-[#0b1120] px-4 py-2 text-white focus:border-cyan-400 outline-none disabled:opacity-70"
                                    />
                                </div>

                                {item.status === "completed" && (
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-400">
                                            Keywords
                                        </label>

                                        <div className="flex flex-wrap gap-2">
                                            {item.tags
                                                .split(",")
                                                .filter(tag => tag.trim())
                                                .map((tag, i) => (
                                                    <span
                                                        key={i}
                                                        className="rounded-full bg-cyan-400/12 px-3 py-1 text-xs text-cyan-100"
                                                    >
                                                        {tag.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                    </div>
                                )}

                                {item.status === "completed" && (
                                    <div className="space-y-3">
                                        <label className="text-sm text-slate-400">
                                            Pick thumbnail from spritesheet
                                        </label>

                                        {item.spritesheet ? (
                                            <SpritesheetPicker
                                                spritesheet={item.spritesheet}
                                                selectedFrameIndex={item.selectedSpriteFrameIndex}
                                                onSelectFrame={(frameIndex) => selectSpriteFrame(index, frameIndex)}
                                                onReset={() =>
                                                    updateItem(index, {
                                                        selectedSpriteFrameIndex: undefined
                                                    })
                                                }
                                                onSave={() => saveSpriteFrameAsThumbnail(index)}
                                                saving={item.isSavingSpriteSelection}
                                                saveLabel="Save Thumbnail"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <p className="text-xs text-slate-400">
                                                    Spritesheet is not ready yet.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => loadSpritesheetForItem(index)}
                                                    className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/16"
                                                >
                                                    Retry load spritesheet
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                        </div>

                    ))}

                </div>

            </div>

        </AppLayout>

    )

}

export default Upload
