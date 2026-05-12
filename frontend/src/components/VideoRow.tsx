import { useRef } from "react"
import type { ReactNode } from "react"
import VideoCard, { Video } from "./VideoCard"

interface Props {
    title: string
    videos: Video[]
    rightSlot?: ReactNode
}

const VideoRow = ({ title, videos, rightSlot }: Props) => {
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const isPortraitRow = videos.every((video) => video.orientation === "PORTRAIT")
    const desktopGridClass = isPortraitRow
        ? "grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
        : "grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5"

    /* ---------------- UI ---------------- */

    if (!videos.length) {
        return null
    }

    return (
        <div className="space-y-4 group">

            {/* HEADER */}
            <div className="flex items-center justify-between px-1">
                <h2 className="text-base sm:text-xl font-semibold tracking-wide">
                    {title}
                </h2>
                {rightSlot ? <div>{rightSlot}</div> : null}
            </div>

            {/* MOBILE */}
            <div className="flex flex-col gap-3 sm:hidden px-1">
                {videos.map((video, index) => {
                    const key = video.publicId || `missing-${index}`

                    return (
                        <div key={key}>
                            <VideoCard video={video} />
                        </div>
                    )
                })}
            </div>

            {/* DESKTOP */}
            <div className="relative hidden sm:block">
                <div
                    ref={scrollRef}
                    className={`grid justify-start gap-4 pb-2 ${desktopGridClass}`}
                >
                    {videos.map((video, index) => {
                        const key = video.publicId || `missing-${index}`

                        return (
                            <div
                                key={key}
                                className="w-full min-w-0 transition-transform duration-300 hover:scale-[1.02]"
                            >
                                <VideoCard video={video} />
                            </div>
                        )
                    })}
                </div>
            </div>

        </div>
    )
}

export default VideoRow
