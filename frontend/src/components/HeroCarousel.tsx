import { useEffect, useRef, useState, useMemo } from "react"
import HeroCard from "./HeroCard"

/* ---------------- TYPES ---------------- */

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
    videos: Video[]
}

/* ---------------- UTILS ---------------- */

const getRandomVideos = (videos: Video[], count: number) => {
    const shuffled = [...videos].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, Math.min(count, videos.length))
}

/* ---------------- COMPONENT ---------------- */

const HeroCarousel = ({ videos }: Props) => {

    const [currentIndex, setCurrentIndex] = useState(0)
    const intervalRef = useRef<number | null>(null)

    /* ✅ DERIVED RANDOM VIDEOS */
    const randomVideos = useMemo(() => {
        if (!videos || videos.length === 0) return []
        return getRandomVideos(videos, 5)
    }, [videos])

    /* ✅ SAFE INDEX (NO RESET EFFECT NEEDED) */
    const safeIndex =
        randomVideos.length === 0
            ? 0
            : currentIndex % randomVideos.length

    /* ---------------- AUTO SLIDE ---------------- */

    useEffect(() => {
        if (randomVideos.length === 0) return

        if (intervalRef.current) {
            clearInterval(intervalRef.current)
        }

        intervalRef.current = window.setInterval(() => {
            setCurrentIndex(prev =>
                (prev + 1) % randomVideos.length
            )
        }, 5000)

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
        }
    }, [randomVideos.length])

    /* ---------------- MANUAL NAV ---------------- */

    const resetTimer = () => {
        if (intervalRef.current) clearInterval(intervalRef.current)

        intervalRef.current = window.setInterval(() => {
            setCurrentIndex(prev =>
                (prev + 1) % randomVideos.length
            )
        }, 5000)
    }

    const handleNext = () => {
        setCurrentIndex(prev =>
            (prev + 1) % randomVideos.length
        )
        resetTimer()
    }

    const handlePrev = () => {
        setCurrentIndex(prev =>
            prev === 0
                ? randomVideos.length - 1
                : prev - 1
        )
        resetTimer()
    }

    if (!randomVideos.length) return null

    return (
        <div className="relative">
            <HeroCard
                key={randomVideos[safeIndex].publicId}
                video={randomVideos[safeIndex]}
                onNext={handleNext}
                onPrev={handlePrev}
            />

            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2.5 py-2 backdrop-blur-sm">
                {randomVideos.map((_, index) => (
                    <div
                        key={index}
                        className={`
                            h-1.5 rounded-full transition-all duration-300
                            ${index === safeIndex
                                ? "w-5 bg-white"
                                : "w-1.5 bg-white/35"}
                        `}
                    />
                ))}
            </div>

        </div>
    )
}

export default HeroCarousel
