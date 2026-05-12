import { useNavigate } from "react-router-dom"
import { useEffect, useRef } from "react"

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

const clampTitleWords = (value: string, maxWords = 8) => {
    const words = value.trim().split(/\s+/).filter(Boolean)
    if (words.length <= maxWords) return value
    return `${words.slice(0, maxWords).join(" ")}...`
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
    const compactTitle = clampTitleWords(title, 8)

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
        <div
            data-hero-id={video.publicId}
            onClick={() => navigate(`/video/${video.publicId}`)}
            className="
                relative w-full
                h-56 sm:h-64 lg:h-72
                rounded-2xl overflow-hidden
                group cursor-pointer bg-black
                border border-white/10
                shadow-[0_20px_60px_rgba(0,0,0,0.28)]
            "
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
                    className="
                        absolute inset-0 w-full h-full object-cover
                        rounded-2xl
                        transition-transform duration-1200
                        group-hover:scale-105
                    "
                />
            ) : (
                <img
                    key={video.publicId}
                    src={thumbnail}
                    alt={title}
                    className="
                        absolute inset-0 w-full h-full object-cover
                        rounded-2xl
                        transition-transform duration-1200
                        group-hover:scale-105
                    "
                />
            )}
            <div className="absolute bottom-4 left-4 right-20 sm:bottom-5 sm:left-6 sm:right-24 lg:left-8">
                <h1 className="line-clamp-1 text-sm font-semibold text-white/92 drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)] sm:text-base lg:text-lg">
                    {compactTitle}
                </h1>
            </div>
        </div>
    )
}

export default HeroCard
