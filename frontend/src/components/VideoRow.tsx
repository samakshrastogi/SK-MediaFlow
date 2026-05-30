import { useMemo } from "react"
import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Play, Sparkles } from "lucide-react"
import UserAvatar from "@/components/UserAvatar"

export interface Video {
    publicId?: string
    id?: string
    title?: string
    aiTitle?: string
    aiDescription?: string
    thumbnailKey?: string
    progress?: number
    uploaderAvatarKey?: string
    uploaderAvatarUrl?: string
    uploaderName?: string
    createdAt?: string
    signedUrl?: string
    orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
    channel?: {
        name?: string
        username?: string
    }
    visibility?: "PUBLIC" | "PRIVATE" | "ORGANIZATION"
    duration?: string
}

interface Props {
    title: string
    videos: Video[]
    rightSlot?: ReactNode
    subtitle?: string
    eyebrow?: string
    accent?: "cyan" | "violet" | "fuchsia" | "blue" | "amber" | "emerald" | "rose"
}

const accentStyles = {
    cyan: "from-cyan-400/18 to-blue-500/10",
    violet: "from-violet-400/18 to-fuchsia-500/10",
    fuchsia: "from-fuchsia-400/18 to-violet-500/10",
    blue: "from-blue-400/18 to-cyan-500/10",
    amber: "from-amber-400/18 to-orange-500/10",
    emerald: "from-emerald-400/18 to-cyan-500/10",
    rose: "from-rose-400/18 to-fuchsia-500/10"
} as const

const VideoRow = ({
    title,
    videos,
    rightSlot,
    subtitle,
    eyebrow,
    accent = "cyan"
}: Props) => {
    const isPortraitRow = useMemo(
        () => videos.every((video) => video.orientation === "PORTRAIT"),
        [videos]
    )

    if (!videos.length) {
        return null
    }

    return (
        <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="space-y-5"
        >
            <div className="flex flex-col gap-4 px-1 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                    {eyebrow ? (
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-purple-100/72">
                            <Sparkles className="h-3.5 w-3.5 text-cyan-100" />
                            {eyebrow}
                        </div>
                    ) : null}
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black tracking-tight text-white sm:text-[2rem]">
                            {title}
                        </h2>
                        <div className={`h-1.5 w-32 rounded-full bg-gradient-to-r ${accentStyles[accent]}`} />
                        {subtitle ? (
                            <p className="max-w-2xl text-sm leading-6 text-purple-100/58">
                                {subtitle}
                            </p>
                        ) : null}
                    </div>
                </div>
                {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
            </div>

            <div className="grid gap-4 md:flex md:overflow-x-auto md:pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {videos.map((video, index) => {
                    const key = video.publicId || `missing-${index}`

                    return (
                        <div
                            key={key}
                            className={`min-w-0 w-full md:shrink-0 ${
                                isPortraitRow ? "md:w-[220px] lg:w-[240px]" : "md:w-[300px] lg:w-[340px]"
                            }`}
                        >
                            <HomeVideoCard video={video} index={index} accent={accent} portrait={isPortraitRow} />
                        </div>
                    )
                })}
            </div>
        </motion.section>
    )
}

const HomeVideoCard = ({
    video,
    index,
    accent,
    portrait
}: {
    video: Video
    index: number
    accent: keyof typeof accentStyles
    portrait: boolean
}) => {
    const navigate = useNavigate()
    const targetId = video.publicId ?? String(video.id ?? "")
    const title = video.title?.trim() || video.aiTitle?.trim() || "Untitled"
    const thumbnail = video.thumbnailKey
        ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}`
        : "/placeholder.jpg"
    const progress = typeof video.progress === "number" ? Math.max(4, Math.min(100, video.progress)) : undefined
    const timeAgo = getTimeAgoLabel(video.createdAt)
    const channelName = video.channel?.name || video.uploaderName || "SK-MediaFlow Channel"

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.04, 0.28), duration: 0.45 }}
            whileHover={{ y: -10 }}
            className="group relative [perspective:1200px]"
        >
            <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 220, damping: 20 }}
                onClick={() => {
                    if (!targetId) return
                    navigate(video.orientation === "PORTRAIT" ? `/portrait/${targetId}` : `/video/${targetId}`, { state: { video } })
                }}
                className={`relative block h-full w-full appearance-none overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(8,12,34,0.84),rgba(15,16,41,0.58))] p-0 text-left shadow-[0_22px_60px_rgba(0,0,0,0.26)] ${
                    portrait ? "min-h-[430px]" : "min-h-[372px]"
                }`}
            >
                <div className={`relative overflow-hidden bg-transparent ${portrait ? "aspect-[4/5]" : "aspect-video"}`}>
                    <img
                        src={thumbnail}
                        alt={title}
                        onError={(e) => {
                            ;(e.currentTarget as HTMLImageElement).src = "/placeholder.jpg"
                        }}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                    />
                    <div className={`absolute inset-0 bg-gradient-to-br ${accentStyles[accent]} opacity-75`} />

                    <div className="absolute right-3 top-3 rounded-full border border-white/35 bg-black/72 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[0_10px_28px_rgba(0,0,0,0.45)] backdrop-blur-md [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
                        {timeAgo}
                    </div>

                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/16 bg-white/14 text-white shadow-[0_20px_40px_rgba(8,12,32,0.45)] backdrop-blur-xl">
                            <Play className="ml-1 h-6 w-6 fill-current" />
                        </div>
                    </div>

                    {progress ? (
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30">
                            <div
                                className="h-full rounded-r-full bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 shadow-[0_0_16px_rgba(56,189,248,0.6)]"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    ) : null}
                </div>

                <div className="flex min-h-[132px] flex-col justify-between space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="line-clamp-2 min-h-[3rem] text-lg font-semibold leading-6 text-white">
                                {title}
                            </p>
                            <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-purple-100/58">
                                {video.aiDescription?.trim() || "Cinematic streaming surface with immersive playback energy and premium discovery motion."}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-purple-100/48">
                        <div className="flex min-w-0 items-center gap-2">
                            <UserAvatar
                                name={channelName}
                                avatarUrl={video.uploaderAvatarUrl}
                                avatarKey={video.uploaderAvatarKey}
                                alt={channelName}
                                className="h-6 w-6 text-[10px]"
                            />
                            <span className="truncate">{channelName}</span>
                        </div>
                    </div>
                </div>
            </motion.button>
        </motion.div>
    )
}

const getTimeAgoLabel = (date?: string) => {
    if (!date) return "Recently"
    const diffInSeconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000))
    if (diffInSeconds < 60) return "Now"
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

export default VideoRow
