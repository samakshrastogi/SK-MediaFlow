import { useEffect, useState } from "react"
import AppLayout from "@/layouts/AppLayout"
import { api } from "@/api/axios"
import VideoCard from "@/components/VideoCard"
import { getCachedPageData, setCachedPageData } from "@/utils/pageCache"

interface Video {
    id: string
    publicId?: string
    title: string
    aiTitle?: string
    thumbnailKey?: string
    uploaderAvatarKey?: string
    uploaderAvatarUrl?: string
    uploaderName?: string
    createdAt?: string
    channel?: {
        name?: string
    }
}

const FavouritesPage = () => {
    const cachedVideos = getCachedPageData<Video[]>("page:favorites")

    const [videos, setVideos] = useState<Video[]>(cachedVideos || [])
    const [loading, setLoading] = useState(!cachedVideos)

    useEffect(() => {
        const fetchFavorites = async () => {
            try {
                const res = await api.get("/video-actions/favorites")
                setVideos(res.data)
                setCachedPageData("page:favorites", res.data, 120000)
            } catch (err) {
            } finally {
                setLoading(false)
            }
        }

        fetchFavorites()
    }, [])

    return (
        <AppLayout>
            <div className="w-full">
                <section className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#6d37a9]/45 via-[#463a92]/42 to-[#1f214b]/62 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                    <div className="border-b border-white/10 px-6 py-6 sm:px-8">
                        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            Favourite Videos
                        </h1>
                        <p className="mt-2 text-sm text-purple-100/65 sm:text-base">
                            Everything you liked, saved in one place for quick access.
                        </p>
                    </div>

                    <div className="px-6 py-6 sm:px-8">
                        {loading ? (
                            <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-5 text-sm text-purple-100/60">
                                Loading favourite videos...
                            </div>
                        ) : videos.length === 0 ? (
                            <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-6 text-center">
                                <p className="text-base font-medium text-white">No favorites yet</p>
                                <p className="mt-1 text-sm text-purple-100/55">
                                    Videos you like will show up here.
                                </p>
                            </div>
                        ) : (
                            <div
                                className="grid justify-start gap-6"
                                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 360px))" }}
                            >
                                {videos.map((video) => (
                                    <div key={video.id} className="w-full max-w-[360px]">
                                        <VideoCard video={video} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </AppLayout>
    )
}

export default FavouritesPage
