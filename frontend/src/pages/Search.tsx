import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { api } from "@/api/axios"
import AppLayout from "@/layouts/AppLayout"
import VideoCard, { Video } from "@/components/VideoCard"

const SearchPage = () => {
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const q = (params.get("q") || "").trim()

    const [query, setQuery] = useState(q)
    const [results, setResults] = useState<Video[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        setQuery(q)
    }, [q])

    useEffect(() => {
        const run = async () => {
            if (!q) {
                setResults([])
                return
            }

            try {
                setLoading(true)
                const res = await api.get("/video/search", { params: { q } })
                const data = Array.isArray(res.data?.data) ? res.data.data : []
                setResults(data)
            } catch (error) {
                console.error("Search failed", error)
                setResults([])
            } finally {
                setLoading(false)
            }
        }

        run()
    }, [q])

    useEffect(() => {
        const trimmed = query.trim()
        const timer = window.setTimeout(() => {
            if (trimmed === q) return
            navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search", { replace: true })
        }, 300)

        return () => window.clearTimeout(timer)
    }, [query, q, navigate])

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="shrink-0">
                        <h1 className="text-2xl font-semibold">Search</h1>
                        <p className="mt-1 text-sm text-gray-400">
                            {q ? `Results for "${q}"` : "Search for videos, channels, and titles"}
                        </p>
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault()
                            const trimmed = query.trim()
                            navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search")
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur lg:max-w-3xl focus-within:border-purple-400/60 focus-within:ring-2 focus-within:ring-purple-500/30"
                    >
                        <button type="submit" className="text-gray-400" aria-label="Search">
                            <Search size={18} />
                        </button>
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search films..."
                            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-400"
                        />
                    </form>
                </div>

                {loading && (
                    <div className="text-gray-300">Searching...</div>
                )}

                {!loading && q && results.length === 0 && (
                    <div className="text-gray-400">No videos matched your search.</div>
                )}

                {!loading && results.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {results.map((video, index) => (
                            <div key={video.publicId || `search-${index}`}>
                                <VideoCard video={video} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    )
}

export default SearchPage
