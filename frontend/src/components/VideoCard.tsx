import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Play } from "lucide-react"
import UserAvatar from "@/components/UserAvatar"

/* ---------------- TYPES ---------------- */

export interface Video {
    publicId?: string
    id?: string
    title?: string
    aiTitle?: string
    thumbnailKey?: string
    progress?: number
    uploaderAvatarKey?: string
    uploaderAvatarUrl?: string
    uploaderName?: string
    createdAt?: string
    orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
    channel?: {
        name?: string
    }
}

interface Props {
    video: Video
}

/* ---------------- COMPONENT ---------------- */

const VideoCard = ({ video }: Props) => {

    const navigate = useNavigate()
    const [renderedAt] = useState(() => Date.now())
    const targetId = video.publicId ?? String(video.id ?? "")
    const isPortrait = video.orientation === "PORTRAIT"

    /* ---------------- DATA ---------------- */

    const thumbnail = video.thumbnailKey
        ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}`
        : "/placeholder.jpg"

    const title =
        video.title?.trim() ||
        video.aiTitle?.trim() ||
        "Untitled"

    const channelName = video.channel?.name || "Unknown channel"
    const displayName = video.uploaderName?.trim() || channelName

    const getTimeAgo = (date?: string) => {
        if (!date) return "just now"

        const diffInSeconds = Math.max(
            0,
            Math.floor((renderedAt - new Date(date).getTime()) / 1000)
        )

        if (diffInSeconds < 60) return "just now"

        const units = [
            { label: "year", value: 60 * 60 * 24 * 365 },
            { label: "month", value: 60 * 60 * 24 * 30 },
            { label: "week", value: 60 * 60 * 24 * 7 },
            { label: "day", value: 60 * 60 * 24 },
            { label: "hour", value: 60 * 60 },
            { label: "minute", value: 60 }
        ]

        for (const unit of units) {
            const amount = Math.floor(diffInSeconds / unit.value)
            if (amount > 0) {
                return `${amount} ${unit.label}${amount > 1 ? "s" : ""} ago`
            }
        }

        return "just now"
    }

    const getTitleLines = (rawTitle: string) => {
        const words = rawTitle.trim().split(/\s+/).filter(Boolean)
        const maxWords = 8
        const wordsPerLine = 4

        const limitedWords = words.slice(0, maxWords)
        const truncated = words.length > maxWords

        const line1 = limitedWords.slice(0, wordsPerLine).join(" ")
        const line2 = limitedWords.slice(wordsPerLine, maxWords).join(" ")

        return { line1, line2, truncated }
    }

    const { line1, line2, truncated } = getTitleLines(title)
    const firstLine = !line2 && truncated ? `${line1} ...` : line1
    const secondLine = line2 ? `${line2}${truncated ? " ..." : ""}` : ""

    /* ---------------- UI ---------------- */

    return (
        <div
            onClick={() => {
                if (!targetId) return
                navigate(isPortrait ? `/portrait/${targetId}` : `/video/${targetId}`)
            }}
            className="
                group relative
                rounded-xl overflow-hidden
                cursor-pointer
                bg-white/5

                transition-all duration-300
                hover:scale-[1.06]
                hover:-translate-y-1
                hover:shadow-2xl
            "
        >

            {/* 🎬 THUMBNAIL */}
            <div className="relative overflow-hidden">

                <img
                    src={thumbnail}
                    alt={title}
                    onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = "/placeholder.jpg"
                    }}
                    className={`w-full object-cover transition-transform duration-500 group-hover:scale-110 ${isPortrait ? "h-56" : "h-32"}`}
                />

                {/* 🌑 GRADIENT OVERLAY */}
                <div className="
                    absolute inset-0
                    bg-gradient-to-t from-black/60 via-black/20 to-transparent
                    opacity-0 group-hover:opacity-100
                    transition
                " />

                {/* ▶ PLAY BUTTON */}
                <div className="
                    absolute inset-0
                    flex items-center justify-center
                    opacity-0 group-hover:opacity-100
                    transition
                ">
                    <div className="
                        bg-white/90 text-black
                        p-2 rounded-full
                        shadow-lg
                        scale-90 group-hover:scale-100
                        transition
                    ">
                        <Play size={18} />
                    </div>
                </div>

                {/* 📊 PROGRESS BAR */}
                {typeof video.progress === "number" && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                        <div
                            className="h-full bg-red-500 transition-all duration-500"
                            style={{ width: `${video.progress}%` }}
                        />
                    </div>
                )}

            </div>

            {/* 📄 CONTENT */}
            <div className="p-3">

                <div className="flex items-start gap-3">
                    <UserAvatar
                        name={displayName}
                        avatarUrl={video.uploaderAvatarUrl}
                        avatarKey={video.uploaderAvatarKey}
                        alt={channelName}
                        className="mt-0.5 h-9 w-9 text-sm"
                    />

                    <div className="min-w-0">
                        <p className="
                            text-sm font-medium
                            text-gray-200 group-hover:text-white
                            transition
                            leading-5
                        ">
                            <span className="block truncate">{firstLine}</span>
                            {secondLine && (
                                <span className="block truncate">{secondLine}</span>
                            )}
                        </p>

                        <p className="text-xs text-gray-400 mt-1 truncate">
                            {channelName} • {getTimeAgo(video.createdAt)}
                        </p>
                    </div>
                </div>

            </div>

        </div>
    )
}

export default VideoCard
