import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { io } from "socket.io-client"

import { api } from "@/api/axios"
import { SOCKET_URL } from "@/config/env"
import AppLayout from "@/layouts/AppLayout"
import SpritesheetPicker from "@/components/SpritesheetPicker"
import AIGenerateAction from "@/components/AIGenerateAction"
import { CheckCircle2, ChevronDown, Cloud, Database, FileVideo, UploadCloud } from "lucide-react"

interface Channel {
    id: string
    name: string
    username: string
    description?: string
}

interface Organization {
    id: string
    name: string
}

interface OrganizationMembership {
    status: string
    organization?: Organization
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

type VideoOrientation =
    | "PORTRAIT"
    | "LANDSCAPE"
    | "SQUARE"

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
    status?: string
}

interface ProcessingStatus {
    aiStatus?: string
    thumbnailStatus?: string
    aiProgress?: number
    thumbnailProgress?: number
    thumbnailKey?: string | null
}

interface UploadItem {
    file: File
    preview: string
    thumbnailPreview?: string
    thumbnailFile?: File
    thumbnailKey?: string
    spritesheet?: SpritesheetData
    isLoadingSpritesheet?: boolean
    spritesheetMessage?: string
    selectedSpriteFrameIndex?: number
    isSavingSpriteSelection?: boolean
    duration: number
    videoWidth: number
    videoHeight: number
    orientation: VideoOrientation

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
    generateAIOnUpload: boolean

    videoId?: string
    publicId?: string
}

const socket = io(SOCKET_URL, {
    path: "/socket.io",
    transports: ["websocket"]
})

const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))

const isWorkerFinished = (status: WorkerStatus) =>
    status === "completed" || status === "failed"

const isWorkerSettled = (status: WorkerStatus) =>
    status === "idle" || isWorkerFinished(status)

const normalizePolledWorkerStatus = (
    status: string | undefined,
    fallback: WorkerStatus
): WorkerStatus => {
    if (status === "completed" || status === "failed") return status
    if (status === "processing" || status === "pending") return "processing"
    return fallback
}

const syncProcessingState = (item: UploadItem): UploadItem => {
    if (
        item.status === "processing" &&
        isWorkerSettled(item.aiStatus) &&
        isWorkerSettled(item.thumbnailStatus)
    ) {
        return {
            ...item,
            status: "completed"
        }
    }

    return item
}

const getOrientationFromDimensions = (
    width: number,
    height: number
): VideoOrientation => {
    if (height > width) return "PORTRAIT"
    if (height === width) return "SQUARE"
    return "LANDSCAPE"
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
    const queueRef = useRef<UploadItem[]>([])
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState("")
    const [showUploadCompleteModal, setShowUploadCompleteModal] = useState(false)
    const [completedUploadCount, setCompletedUploadCount] = useState(0)
    const [globalVisibility, setGlobalVisibility] = useState<"PUBLIC" | "PRIVATE" | "ORGANIZATION">("PUBLIC")
    const [organizations, setOrganizations] = useState<Organization[]>([])
    const [selectedUploadOrganizationId, setSelectedUploadOrganizationId] = useState("")
    const [organizationDropdownOpen, setOrganizationDropdownOpen] = useState(false)

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

    const fetchSpritesheetMetadata = async (videoId: string): Promise<SpritesheetData | null> => {
        try {
            const res = await api.get(`/video/upload/${videoId}/spritesheet`, {
                validateStatus: (status) => (status >= 200 && status < 300) || status === 202
            })

            if (res.status === 202 || res.data?.ready === false) {
                return null
            }

            return res.data?.data as SpritesheetData
        } catch (err) {
            if (
                axios.isAxiosError(err) &&
                err.response?.status === 404 &&
                err.response.data?.message === "Spritesheet is not ready yet"
            ) {
                return null
            }

            throw err
        }
    }

    const fetchProcessingStatus = async (videoId: string): Promise<ProcessingStatus> => {
        const res = await api.get(`/video/upload/${videoId}/processing-status`)
        return res.data?.data as ProcessingStatus
    }

    useEffect(() => {
        queueRef.current = queue
    }, [queue])

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
                                ? {
                                    ...item,
                                    spritesheet: spritesheet || undefined,
                                    spritesheetMessage: spritesheet ? undefined : "Spritesheet is still being generated."
                                }
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

    useEffect(() => {
        let cancelled = false

        const pollProcessingStatus = async () => {
            const processingItems = queueRef.current.filter(
                (item) =>
                    item.videoId &&
                    item.status === "processing" &&
                    (!isWorkerSettled(item.aiStatus) ||
                        !isWorkerSettled(item.thumbnailStatus))
            )

            if (!processingItems.length) return

            const results = await Promise.all(
                processingItems.map(async (item) => {
                    try {
                        const status = await fetchProcessingStatus(item.videoId!)
                        let ai: AIMetadata | null = null
                        let spritesheet: SpritesheetData | null = null

                        if (
                            status.aiStatus === "completed" &&
                            item.aiStatus !== "completed"
                        ) {
                            try {
                                ai = await fetchAIMetadata(item.videoId!)
                            } catch {
                            }

                            try {
                                spritesheet = await fetchSpritesheetMetadata(item.videoId!)
                            } catch {
                            }
                        }

                        return {
                            videoId: item.videoId,
                            status,
                            ai,
                            spritesheet
                        }
                    } catch {
                        return null
                    }
                })
            )

            if (cancelled) return

            setQueue((prev) =>
                prev.map((item) => {
                    const result = results.find(
                        (entry) => entry?.videoId && String(entry.videoId) === String(item.videoId)
                    )

                    if (!result) return item

                    const aiStatus = normalizePolledWorkerStatus(
                        result.status.aiStatus,
                        item.aiStatus
                    )
                    const thumbnailStatus = normalizePolledWorkerStatus(
                        result.status.thumbnailStatus,
                        item.thumbnailStatus
                    )

                    return syncProcessingState({
                        ...item,
                        aiStatus,
                        thumbnailStatus,
                        aiProgress: Math.max(
                            item.aiProgress,
                            Number(result.status.aiProgress) || 0,
                            aiStatus === "completed" || aiStatus === "failed" ? 100 : 0
                        ),
                        thumbnailProgress: Math.max(
                            item.thumbnailProgress,
                            Number(result.status.thumbnailProgress) || 0,
                            thumbnailStatus === "completed" || thumbnailStatus === "failed" ? 100 : 0
                        ),
                        thumbnailKey: result.status.thumbnailKey || item.thumbnailKey,
                        spritesheet: result.spritesheet || item.spritesheet,
                        spritesheetMessage:
                            result.spritesheet ? undefined : item.spritesheetMessage,
                        title:
                            item.title.trim()
                                ? item.title
                                : result.ai?.title ?? item.title,
                        description:
                            item.description.trim()
                                ? item.description
                                : result.ai?.description ?? item.description,
                        tags: result.ai?.tags?.join(", ") ?? item.tags
                    })
                })
            )
        }

        const intervalId = window.setInterval(pollProcessingStatus, 15000)

        return () => {
            cancelled = true
            window.clearInterval(intervalId)
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

    useEffect(() => {
        const fetchOrganizations = async () => {
            try {
                const res = await api.get("/organization/my")
                const memberships = (res.data?.data?.memberships || []) as OrganizationMembership[]
                const approvedOrganizations = memberships
                    .filter((membership) => membership.status === "APPROVED" && membership.organization?.id)
                    .map((membership) => membership.organization!)

                setOrganizations(approvedOrganizations)

                const preferredOrganization =
                    approvedOrganizations.length === 1
                        ? approvedOrganizations[0]
                        : null

                if (preferredOrganization) {
                    setSelectedUploadOrganizationId(preferredOrganization.id)
                } else {
                    setSelectedUploadOrganizationId("")
                }
            } catch {
                setOrganizations([])
                setSelectedUploadOrganizationId("")
            }
        }

        fetchOrganizations()
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
                    isLoadingSpritesheet: false,
                    spritesheetMessage: undefined,
                    selectedSpriteFrameIndex: undefined,
                    isSavingSpriteSelection: false,
                    duration: video.duration,
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                    orientation: getOrientationFromDimensions(video.videoWidth, video.videoHeight),

                    uploadProgress: 0,
                    aiProgress: 0,
                    thumbnailProgress: 0,
                    aiStatus: "idle",
                    thumbnailStatus: "idle",

                    speed: 0,
                    status: "waiting",

                    title: "",
                    description: "",
                    tags: "",
                    generateAIOnUpload: false
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
        setUploadError("")
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
            updateItem(index, {
                isLoadingSpritesheet: true,
                spritesheetMessage: undefined
            })
            const spritesheet = await fetchSpritesheetMetadata(item.videoId)
            updateItem(index, {
                spritesheet: spritesheet || undefined,
                isLoadingSpritesheet: false,
                spritesheetMessage: spritesheet ? undefined : "Spritesheet is still being generated."
            })
        } catch (err) {
            updateItem(index, {
                isLoadingSpritesheet: false,
                spritesheetMessage: "Failed to check spritesheet. Try again in a moment."
            })
        }
    }



    /* ---------------- START QUEUE ---------------- */

    const startUploadQueue = async () => {

        if (!channel) return

        if (globalVisibility === "ORGANIZATION" && !selectedUploadOrganizationId) {
            setUploadError("Select an organization before uploading.")
            return
        }

        const missingThumbnail = queue.some(
            (item) => item.status === "waiting" && !item.thumbnailFile && !item.generateAIOnUpload
        )

        if (missingThumbnail) {
            setUploadError("Upload a thumbnail or choose Generate AI before uploading.")
            return
        }

        setUploadError("")
        setShowUploadCompleteModal(false)
        setCompletedUploadCount(0)
        setUploading(true)
        let successfulUploads = 0

        for (let i = 0; i < queue.length; i++) {

            if (queue[i].status !== "waiting") continue

            const uploaded = await uploadSingle(i)
            if (uploaded) successfulUploads += 1

        }

        if (successfulUploads > 0) {
            setCompletedUploadCount(successfulUploads)
            setShowUploadCompleteModal(true)
        }

        setUploading(false)

    }

    /* ---------------- SINGLE UPLOAD ---------------- */

    const uploadSingle = async (index: number) => {
        const item = queue[index];

        try {
            if (!item.thumbnailFile && !item.generateAIOnUpload) {
                setUploadError("Upload a thumbnail or choose Generate AI before uploading.")
                updateItem(index, { status: "error" })
                return false
            }

            updateItem(index, { status: "uploading" });

            /* ---------- 1. GET PRESIGNED URL ---------- */

            const uploadOrganizationId =
                globalVisibility === "ORGANIZATION" ? selectedUploadOrganizationId : undefined

            const presignRes = await api.post("/video/upload/presign", {
                fileName: item.file.name,
                fileType: item.file.type,
                organizationId: uploadOrganizationId,
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

            /* ---------- 2.5 REQUIRED CUSTOM THUMBNAIL ---------- */

            let thumbnailKey: string | undefined = undefined

            if (item.thumbnailFile) {
                const thumbPresignRes = await api.post("/video/upload/thumbnail-presign", {
                    fileName: item.thumbnailFile.name,
                    fileType: item.thumbnailFile.type,
                    organizationId: uploadOrganizationId
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
                videoWidth: item.videoWidth,
                videoHeight: item.videoHeight,
                orientation: item.orientation,
                size: item.file.size,
                visibility: globalVisibility, // ✅ IMPORTANT
                organizationId: uploadOrganizationId,
                thumbnailKey,
                generateAIAssets: item.generateAIOnUpload
            });

            const uploadedVideo = completeRes.data.data
            const videoId = uploadedVideo.id
            const publicId = uploadedVideo.publicId

            /* ---------- 4. FINAL STATE ---------- */

            setQueue(prev => {
                return prev.map((item, i) =>
                    i === index
                        ? {
                            ...item,
                            videoId,
                            publicId,
                            thumbnailKey: thumbnailKey ?? item.thumbnailKey,
                            thumbnailProgress: item.generateAIOnUpload && !thumbnailKey ? 5 : 0,
                            aiStatus: item.generateAIOnUpload ? "processing" : "idle",
                            thumbnailStatus: item.generateAIOnUpload && !thumbnailKey ? "processing" : "idle",
                            status: item.generateAIOnUpload ? "processing" : "completed",
                            uploadProgress: 100,
                        }
                        : item
                );
            });

            return true

        } catch (err) {
            updateItem(index, {
                status: "error",
            });
            return false
        }
    };

    const handleUploadContinue = () => {
        setShowUploadCompleteModal(false)
        navigate("/home")
    }

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

    const hasMissingThumbnail = queue.some(
        (item) => item.status === "waiting" && !item.thumbnailFile && !item.generateAIOnUpload
    )
    const hasWaitingUpload = queue.some((item) => item.status === "waiting")
    const selectedUploadOrganizationName =
        organizations.length > 1
            ? organizations.find((organization) => organization.id === selectedUploadOrganizationId)?.name || "Organization"
            : "Organization"

    return (

        <AppLayout>

            <div className="w-full min-w-0 px-1 py-4 sm:px-4 sm:py-8 lg:px-6 lg:py-10 space-y-6 sm:space-y-10">

                {/* HEADER */}

                <section className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.055] p-3 shadow-[0_14px_42px_rgba(4,7,20,0.22)] backdrop-blur-2xl sm:p-4">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_42%)]" />
                    <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/18 bg-cyan-400/12 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                                <UploadCloud size={18} />
                            </div>

                            <div className="min-w-0">
                                <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-cyan-300/16 bg-cyan-400/10 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-100/86 sm:text-[10px]">
                                    Upload Studio
                                </div>
                                <h1 className="break-words text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
                                    {channel?.name}
                                </h1>

                                <p className="mt-0.5 max-w-full truncate text-xs font-medium text-cyan-100/68 sm:text-sm">
                                    @{channel?.username}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => navigate("/s3-import")}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_12px_28px_rgba(34,211,238,0.22)] transition hover:bg-cyan-300 sm:w-auto sm:px-5"
                        >
                            <Database size={17} />
                            S3 Import
                        </button>
                    </div>
                </section>

                {/* DROPZONE */}

                {queue.length === 0 && (
                    <label
                        htmlFor="fileInput"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault()
                            handleFiles(event.dataTransfer.files)
                        }}
                        className="group relative block cursor-pointer overflow-hidden rounded-[30px] border border-dashed border-cyan-200/28 bg-white/[0.035] p-6 text-center transition hover:border-cyan-300/50 hover:bg-white/[0.055] sm:p-12"
                    >
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_32%),linear-gradient(135deg,rgba(168,85,247,0.08),transparent_45%)] opacity-80" />
                        <input
                            id="fileInput"
                            type="file"
                            accept="video/*"
                            multiple
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                            aria-label="Choose video files"
                            onChange={(event) => {
                                handleFiles(event.target.files)
                                event.target.value = ""
                            }}
                        />
                        <div className="pointer-events-none relative mx-auto flex max-w-xl flex-col items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.08] text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition group-hover:scale-105 group-hover:bg-cyan-400/12">
                                <FileVideo size={28} />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-white sm:text-2xl">
                                    Drop videos here
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-gray-400">
                                    Tap to browse, or drag video files into this area to build your upload queue.
                                </p>
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-medium text-slate-200/80">
                                <Cloud size={14} />
                                MP4, MOV, and common video files
                            </div>
                        </div>
                    </label>
                )}

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

                {showUploadCompleteModal && (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_28%),rgba(5,3,14,0.82)] px-3 py-4 backdrop-blur-sm sm:px-4">
                        <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(20,18,39,0.98),rgba(11,10,28,0.98))] p-6 text-center shadow-[0_28px_80px_rgba(0,0,0,0.45)] sm:p-8">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/12 text-emerald-100">
                                <CheckCircle2 size={32} />
                            </div>

                            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-white">
                                {completedUploadCount > 1 ? "Your videos are uploaded." : "Your video is uploaded."}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-slate-300/72">
                                Continue to the home page to view your uploaded content.
                            </p>

                            <button
                                type="button"
                                onClick={handleUploadContinue}
                                className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                )}

                {/* VISIBILITY TOGGLE */}

                {queue.length > 0 && (

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-3 shadow-[0_18px_50px_rgba(4,7,20,0.22)] backdrop-blur-xl sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-4">
                        <p className="mb-3 text-sm font-medium text-slate-300 sm:mb-0">
                            Select visibility
                        </p>

                        <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-3">

                            <button
                                onClick={() => {
                                    setGlobalVisibility("PUBLIC")
                                    setOrganizationDropdownOpen(false)
                                }}
                                className={`rounded-xl px-3 py-2 text-xs font-medium sm:px-4 sm:text-sm ${globalVisibility === "PUBLIC"
                                    ? "bg-cyan-400 text-slate-950"
                                    : "bg-white/10 text-slate-300"
                                    }`}
                            >
                                Public
                            </button>

                            <button
                                onClick={() => {
                                    setGlobalVisibility("PRIVATE")
                                    setOrganizationDropdownOpen(false)
                                }}
                                className={`rounded-xl px-3 py-2 text-xs font-medium sm:px-4 sm:text-sm ${globalVisibility === "PRIVATE"
                                    ? "bg-cyan-400 text-slate-950"
                                    : "bg-white/10 text-slate-300"
                                    }`}
                            >
                                Private
                            </button>

                            <div className="relative min-w-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setGlobalVisibility("ORGANIZATION")
                                        setOrganizationDropdownOpen((open) =>
                                            globalVisibility === "ORGANIZATION" && organizations.length !== 1
                                                ? !open
                                                : organizations.length !== 1
                                        )
                                    }}
                                    className={`flex w-full min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium sm:px-4 sm:text-sm ${globalVisibility === "ORGANIZATION"
                                        ? "bg-cyan-400 text-slate-950"
                                        : "bg-white/10 text-slate-300"
                                        }`}
                                >
                                    <span className="truncate">{selectedUploadOrganizationName}</span>
                                    {organizations.length > 1 ? (
                                        <ChevronDown
                                            size={14}
                                            className={`transition ${organizationDropdownOpen ? "rotate-180" : ""}`}
                                        />
                                    ) : null}
                                </button>

                                {globalVisibility === "ORGANIZATION" && organizationDropdownOpen && organizations.length !== 1 && (
                                    <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-full min-w-full overflow-hidden rounded-xl border border-white/10 bg-[#100d24] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                                        {organizations.length > 1 ? (
                                            <div className="max-h-56 overflow-y-auto p-1.5">
                                                {organizations.map((organization) => (
                                                    <button
                                                        key={organization.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedUploadOrganizationId(organization.id)
                                                            setUploadError("")
                                                            setOrganizationDropdownOpen(false)
                                                        }}
                                                        title={organization.name}
                                                        className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition ${selectedUploadOrganizationId === organization.id
                                                            ? "bg-cyan-400 text-slate-950"
                                                            : "text-white hover:bg-white/10"
                                                            }`}
                                                    >
                                                        {organization.name}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="px-3 py-2 text-sm text-amber-100">
                                                No approved organization found
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                        </div>

                        {globalVisibility === "ORGANIZATION" && organizations.length === 0 && !organizationDropdownOpen && (
                            <div className="mt-3 rounded-xl border border-amber-300/18 bg-amber-400/10 px-3 py-2 text-sm text-amber-100 sm:mt-0">
                                No approved organization found
                            </div>
                        )}

                    </div>

                )}
                

                {/* QUEUE */}

                <div className="space-y-6 sm:space-y-10">

                    {queue.map((item, index) => (

                        <div
                            key={index}
                            className="space-y-5 rounded-[24px] border border-white/10 bg-transparent p-4 sm:space-y-6 sm:rounded-[28px] sm:p-8"
                        >

                            <div className="space-y-6">

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
                                        placeholder="Optional title"
                                        aria-label="Video title"
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-white focus:border-cyan-400 outline-none disabled:opacity-70"
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
                                        placeholder="Optional description"
                                        aria-label="Video description"
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-white focus:border-cyan-400 outline-none disabled:opacity-70"
                                    />
                                </div>

                                {/* THUMBNAIL */}
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-400">
                                        Thumbnail <span className="text-red-300">*</span>
                                    </label>

                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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

                                            {item.thumbnailFile ? (
                                                <span
                                                    title={item.thumbnailFile.name}
                                                    className="max-w-full truncate rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-100 sm:max-w-64"
                                                >
                                                    {item.thumbnailFile.name}
                                                </span>
                                            ) : null}
                                        </div>

                                        {(item.status === "waiting" || item.status === "completed") ? (
                                            <AIGenerateAction
                                                publicId={item.publicId}
                                                title={item.title || item.file.name}
                                                includeThumbnail={!item.thumbnailKey}
                                                selected={item.generateAIOnUpload}
                                                onConfirm={() => {
                                                    setUploadError("")
                                                    updateItem(index, {
                                                        generateAIOnUpload: true
                                                    })
                                                }}
                                                onStarted={() =>
                                                    item.publicId
                                                        ? updateItem(index, {
                                                            aiStatus: "processing",
                                                            aiProgress: Math.max(item.aiProgress, 5),
                                                            spritesheetMessage: "AI generation started. Spritesheet is being prepared."
                                                        })
                                                        : updateItem(index, {
                                                            generateAIOnUpload: true
                                                        })
                                                }
                                            />
                                        ) : null}
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

                                <div className="space-y-2">
                                    <label className="text-sm text-slate-400">
                                        Video
                                    </label>
                                    <video
                                        src={item.preview}
                                        className="h-44 w-full rounded-xl object-cover sm:h-56"
                                    />
                                </div>

                                {index === queue.length - 1 && (
                                    <div className="space-y-3">
                                        {uploadError ? (
                                            <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                                {uploadError}
                                            </div>
                                        ) : null}

                                        <button
                                            type="button"
                                            onClick={startUploadQueue}
                                            disabled={uploading || hasMissingThumbnail || !hasWaitingUpload}
                                            className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                                        >
                                            {uploading ? "Uploading..." : "Start Uploading"}
                                        </button>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <p className="mb-2 text-sm text-slate-400">
                                            Upload {item.uploadProgress}% • {item.speed.toFixed(2)} MB/s
                                        </p>

                                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700/40">
                                            <div
                                                className="h-2 bg-cyan-500 transition-all"
                                                style={{ width: `${item.uploadProgress}%` }}
                                            />
                                        </div>
                                    </div>

                                    {(item.status === "processing" || item.aiStatus !== "idle" || item.thumbnailStatus !== "idle") && (
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div>
                                                <p className="mb-1 text-sm text-slate-400">
                                                    AI Worker {item.aiProgress}% {item.aiStatus === "completed" ? "• Done" : item.aiStatus === "failed" ? "• Failed" : "• Live"}
                                                </p>

                                                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700/40">
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

                                                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700/40">
                                                    <div
                                                        className="h-2 bg-amber-400 transition-all"
                                                        style={{ width: `${item.thumbnailProgress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
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

                                {item.status === "completed" && item.generateAIOnUpload && (
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
                                                    {item.spritesheetMessage || "Spritesheet is not ready yet."}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => loadSpritesheetForItem(index)}
                                                    disabled={item.isLoadingSpritesheet}
                                                    className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/16"
                                                >
                                                    {item.isLoadingSpritesheet ? "Checking..." : "Retry load spritesheet"}
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
