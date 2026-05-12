import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import AppLayout from "@/layouts/AppLayout"
import { api } from "@/api/axios"
import { getCachedPageData, setCachedPageData } from "@/utils/pageCache"

interface Video {
    id: string
    publicId?: string
    title?: string
    aiTitle?: string
    aiDescription?: string
    thumbnailKey?: string
    uploaderName?: string
    channel?: {
        name?: string
    }
}

interface Playlist {
    id: string
    name: string
    videos: Video[]
}

const PlaylistPage = () => {
    const navigate = useNavigate()
    const cachedPlaylists = getCachedPageData<Playlist[]>("page:playlists")

    const [playlists, setPlaylists] = useState<Playlist[]>(cachedPlaylists || [])
    const [loading, setLoading] = useState(!cachedPlaylists)

    useEffect(() => {
        const fetchPlaylists = async () => {
            try {
                const res = await api.get("/video-actions/playlists-with-videos")
                setPlaylists(res.data)
                setCachedPageData("page:playlists", res.data, 120000)
            } catch (error) {
            } finally {
                setLoading(false)
            }
        }

        fetchPlaylists()
    }, [])

    return (
        <AppLayout>
            <div className="w-full">
                <section className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#6d37a9]/45 via-[#463a92]/42 to-[#1f214b]/62 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                    <div className="border-b border-white/10 px-6 py-6 sm:px-8">
                        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            My Playlists
                        </h1>
                        <p className="mt-2 text-sm text-purple-100/65 sm:text-base">
                            Organize saved videos and jump back quickly.
                        </p>
                    </div>

                    <div className="space-y-6 px-6 py-6 sm:px-8">
                        {loading && (
                            <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-5 text-sm text-purple-100/60">
                                Loading playlists...
                            </div>
                        )}

                        {!loading && playlists.length === 0 && (
                            <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-6 text-sm text-purple-100/60">
                                You have not created any playlist yet.
                            </div>
                        )}

                        {!loading && playlists.map((playlist, index) => (
                            <section
                                key={playlist.id}
                                className={`${index > 0 ? "border-t border-white/10 pt-6" : ""} space-y-4`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className="text-xl font-semibold text-white">
                                        {playlist.name}
                                    </h2>
                                    <span className="text-xs text-purple-100/55">
                                        {playlist.videos.length} videos
                                    </span>
                                </div>

                                {playlist.videos.length === 0 ? (
                                    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-purple-100/50">
                                        No videos in this playlist.
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {playlist.videos.map((video) => {
                                            const id = video.publicId ?? String(video.id)
                                            const thumbnail = video.thumbnailKey
                                                ? `https://${import.meta.env.VITE_CLOUDFRONT_DOMAIN}/${video.thumbnailKey}`
                                                : "/placeholder-thumbnail.png"
                                            const title = video.aiTitle || video.title || "Untitled"
                                            const channelName =
                                                video.channel?.name || video.uploaderName || "Unknown channel"

                                            return (
                                                <button
                                                    key={`${playlist.id}-${id}`}
                                                    onClick={() => navigate(`/video/${id}`)}
                                                    className="flex w-full items-center gap-4 rounded-2xl border border-white/6 bg-black/22 p-3 text-left transition hover:bg-black/30"
                                                >
                                                    <div
                                                        style={{ width: 168, height: 96 }}
                                                        className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/20"
                                                    >
                                                        <img
                                                            src={thumbnail}
                                                            alt={title}
                                                            className="h-full w-full object-cover"
                                                            onError={(e) => {
                                                                ;(e.currentTarget as HTMLImageElement).src = "/placeholder-thumbnail.png"
                                                            }}
                                                        />
                                                    </div>

                                                    <div className="min-w-0">
                                                        <p className="text-base font-medium leading-6 text-white line-clamp-2">
                                                            {title}
                                                        </p>
                                                        <p className="mt-1 truncate text-sm text-purple-100/60">
                                                            {channelName}
                                                        </p>
                                                        {video.aiDescription && (
                                                            <p className="mt-1 line-clamp-2 text-xs text-purple-100/42">
                                                                {video.aiDescription}
                                                            </p>
                                                        )}
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </section>
                        ))}
                    </div>
                </section>
            </div>
        </AppLayout>
    )
}

export default PlaylistPage
