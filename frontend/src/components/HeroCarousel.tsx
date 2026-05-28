import { useEffect, useRef, useState, useMemo } from "react"
import { motion } from "framer-motion"
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
        <div className="relative hidden space-y-4 md:block">
            <HeroCard
                key={randomVideos[safeIndex].publicId}
                video={randomVideos[safeIndex]}
                onNext={handleNext}
                onPrev={handlePrev}
            />

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22, duration: 0.5 }}
                className="absolute bottom-4 left-4 hidden items-center gap-2 rounded-full border border-white/10 bg-black/28 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-purple-100/75 backdrop-blur-md md:flex"
            >
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.75)]" />
                Live Feature Rotation
            </motion.div>

            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2.5 py-2 shadow-[0_18px_38px_rgba(0,0,0,0.2)] backdrop-blur-md">
                {randomVideos.map((_, index) => (
                    <motion.div
                        key={index}
                        className={`
                            h-1.5 rounded-full transition-all duration-300
                            ${index === safeIndex
                                ? "w-7 bg-white shadow-[0_0_16px_rgba(255,255,255,0.4)]"
                                : "w-1.5 bg-white/35"}
                        `}
                        animate={index === safeIndex ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                        transition={{ duration: 1.4, repeat: index === safeIndex ? Infinity : 0, ease: "easeInOut" }}
                    />
                ))}
            </div>

        </div>
    )
}

export default HeroCarousel
