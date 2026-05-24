import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { useEffect, useMemo, useRef } from "react"
import { motion } from "framer-motion"
import { ArrowRight, Clock3, Play, Sparkles } from "lucide-react"

interface Video {
    publicId: string
    title?: string
    aiTitle?: string
    aiDescription?: string
    thumbnailKey?: string
    videoKey?: string
    duration?: string
    year?: string
}

interface Props {
    video?: Video
    onPrev?: () => void
    onNext?: () => void
}

const getTags = (video?: Video) => {
    if (!video) return []
    const seed = `${video.publicId}${video.title || ""}`.length
    const variants = [
        ["Sci-Fi", "4K", "Immersive"],
        ["Drama", "Featured", "HD"],
        ["Action", "Trending", "Dolby"],
        ["Adventure", "Premium", "OTT"]
    ]
    return variants[seed % variants.length]
}

const HeroCard = ({ video, onPrev, onNext }: Props) => {
    const navigate = useNavigate()
    const videoRef = useRef<HTMLVideoElement | null>(null)

    const thumbnail = video?.thumbnailKey
        ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}`
        : "/placeholder.jpg"

    const videoUrl = video?.videoKey
        ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.videoKey}`
        : null

    const title =
        video?.aiTitle ||
        video?.title ||
        (video ? `Video #${video.publicId}` : "")

    const description = video?.aiDescription?.trim() || "A premium featured stream with cinematic motion, immersive depth, and modern entertainment-platform energy."
    const tags = useMemo(() => getTags(video), [video])

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.load()
        }
    }, [video?.publicId])

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft" && onPrev) onPrev()
            if (e.key === "ArrowRight" && onNext) onNext()
        }

        window.addEventListener("keydown", handleKey)
        return () => window.removeEventListener("keydown", handleKey)
    }, [onPrev, onNext])

    if (!video) return null

    return (
        <motion.div
            data-hero-id={video.publicId}
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative isolate overflow-hidden rounded-[36px] border border-white/10 bg-[#050816] shadow-[0_32px_100px_rgba(0,0,0,0.36)]"
        >
            <motion.div
                animate={{ scale: [1, 1.03, 1], x: [0, -14, 0], y: [0, -6, 0] }}
                transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0"
            >
                {videoUrl ? (
                    <video
                        ref={videoRef}
                        key={video.publicId}
                        src={videoUrl}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                ) : (
                    <img
                        key={video.publicId}
                        src={thumbnail}
                        alt={title}
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                )}
            </motion.div>

            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_30%,rgba(34,211,238,0.18),transparent_24%),radial-gradient(circle_at_82%_18%,rgba(168,85,247,0.24),transparent_22%),linear-gradient(90deg,rgba(4,8,20,0.96)_0%,rgba(4,8,20,0.75)_36%,rgba(4,8,20,0.18)_72%,rgba(4,8,20,0.68)_100%)]" />
            <motion.div
                animate={{ x: ["-20%", "120%"] }}
                transition={{ duration: 7.5, repeat: Infinity, ease: "linear", repeatDelay: 1.5 }}
                className="absolute top-0 h-full w-48 bg-gradient-to-r from-transparent via-white/10 to-transparent blur-2xl"
            />
            <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.03) 18%, transparent 40%)" }} />

            <div className="relative z-10 min-h-[26rem] px-5 py-6 sm:min-h-[30rem] sm:px-7 lg:min-h-[34rem] lg:px-10 lg:py-8">
                <div className="flex h-full flex-col justify-between">
                    <div className="flex items-start justify-between gap-4">
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-100">
                            <Sparkles className="h-3.5 w-3.5" />
                            Featured Stream
                        </div>

                        <div className="hidden items-center gap-2 sm:flex">
                            <HeroNavButton label="Prev" onClick={onPrev} />
                            <HeroNavButton label="Next" onClick={onNext} />
                        </div>
                    </div>

                    <div className="max-w-2xl space-y-5">
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.14, duration: 0.5 }}
                            className="space-y-4"
                        >
                            <div className="flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-purple-100/80 backdrop-blur-md"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            <h1 className="line-clamp-2 max-w-3xl bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-4xl font-black tracking-tight text-transparent drop-shadow-[0_10px_28px_rgba(96,165,250,0.18)] sm:text-5xl lg:text-6xl">
                                {title}
                            </h1>

                            <p className="line-clamp-2 max-w-xl text-sm leading-7 text-purple-100/72 sm:text-base">
                                {description}
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.24, duration: 0.5 }}
                            className="flex flex-wrap items-center gap-3"
                        >
                            <HeroActionButton
                                primary
                                icon={<Play className="h-4 w-4 fill-current" />}
                                label="Watch Now"
                                onClick={() => navigate(`/video/${video.publicId}`)}
                            />
                            <HeroActionButton
                                icon={<Clock3 className="h-4 w-4" />}
                                label="Continue Watching"
                                onClick={() => navigate(`/video/${video.publicId}`)}
                            />
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.32, duration: 0.5 }}
                            className="rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl"
                        >
                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-purple-100/58">
                                    <span>Continue session</span>
                                    <span>68% complete</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                    <motion.div
                                        initial={{ width: "0%" }}
                                        animate={{ width: "68%" }}
                                        transition={{ delay: 0.45, duration: 0.8, ease: "easeOut" }}
                                        className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-500 shadow-[0_0_18px_rgba(56,189,248,0.55)]"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-purple-100/60">
                                    <span>HD</span>
                                    <span>•</span>
                                    <span>{video.duration || "24m"}</span>
                                    <span>•</span>
                                    <span>{video.year || "2026"}</span>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-2 backdrop-blur-md sm:hidden">
                <HeroNavButton label="Prev" onClick={onPrev} compact />
                <HeroNavButton label="Next" onClick={onNext} compact />
            </div>
        </motion.div>
    )
}

const HeroActionButton = ({
    primary = false,
    icon,
    label,
    onClick
}: {
    primary?: boolean
    icon: ReactNode
    label: string
    onClick: () => void
}) => (
    <motion.button
        whileHover={{ y: -3, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
            primary
                ? "border border-cyan-300/18 bg-white text-black shadow-[0_18px_38px_rgba(255,255,255,0.14)]"
                : "border border-white/10 bg-white/8 text-white backdrop-blur-md hover:bg-white/14"
        }`}
    >
        {icon}
        {label}
        {primary ? <ArrowRight className="h-4 w-4" /> : null}
    </motion.button>
)

const HeroNavButton = ({
    label,
    onClick,
    compact = false
}: {
    label: string
    onClick?: () => void
    compact?: boolean
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`rounded-full border border-white/10 bg-white/8 text-xs font-medium text-white backdrop-blur-md transition hover:bg-white/14 ${
            compact ? "px-3 py-1.5" : "px-3.5 py-2"
        }`}
    >
        {label}
    </button>
)

export default HeroCard
