import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { api } from "@/api/axios"
import AppLayout from "@/layouts/AppLayout"
import VideoCard, { Video } from "@/components/VideoCard"
import { useAuth } from "@/context/AuthContext"
import { getCachedPageData, setCachedPageData } from "@/utils/pageCache"

const SEARCH_HISTORY_LIMIT = 8

const getSearchHistoryKey = (userId?: string) => `search-history:${userId || "guest"}`

const readSearchHistory = (userId?: string) => {
    try {
        const stored = localStorage.getItem(getSearchHistoryKey(userId))
        if (!stored) return []
        const parsed = JSON.parse(stored)
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
    } catch {
        return []
    }
}

const writeSearchHistory = (userId: string | undefined, value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return readSearchHistory(userId)

    const next = [
        trimmed,
        ...readSearchHistory(userId).filter((item) => item.toLowerCase() !== trimmed.toLowerCase())
    ].slice(0, SEARCH_HISTORY_LIMIT)

    localStorage.setItem(getSearchHistoryKey(userId), JSON.stringify(next))
    return next
}

const SearchPage = () => {
    const navigate = useNavigate()
    const { user } = useAuth()
    const [params] = useSearchParams()
    const q = (params.get("q") || "").trim()
    const cachedResults = getCachedPageData<Video[]>(`page:search:${q}`)
    const searchWrapRef = useRef<HTMLDivElement | null>(null)

    const [query, setQuery] = useState(q)
    const [results, setResults] = useState<Video[]>(cachedResults || [])
    const [loading, setLoading] = useState(Boolean(q) && !cachedResults)
    const [searchHistory, setSearchHistory] = useState<string[]>(() => readSearchHistory(user?.id))
    const [showSuggestions, setShowSuggestions] = useState(false)

    const suggestionItems = useMemo(() => {
        const trimmed = query.trim().toLowerCase()
        if (!trimmed) return searchHistory
        return searchHistory.filter((item) => item.toLowerCase().includes(trimmed))
    }, [query, searchHistory])

    const submitSearch = (rawValue: string, replace = false, closeSuggestions = true) => {
        const trimmed = rawValue.trim()
        if (closeSuggestions) {
            setShowSuggestions(false)
        }

        if (!trimmed) {
            navigate("/search", { replace })
            return
        }

        const nextHistory = writeSearchHistory(user?.id, trimmed)
        setSearchHistory(nextHistory)
        navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace })
    }

    useEffect(() => {
        setSearchHistory(readSearchHistory(user?.id))
    }, [user?.id])

    useEffect(() => {
        setQuery(q)
    }, [q])

    useEffect(() => {
        if (!q) return
        setSearchHistory(writeSearchHistory(user?.id, q))
    }, [q, user?.id])

    useEffect(() => {
        const run = async () => {
            if (!q) {
                setResults([])
                return
            }

            try {
                if (!cachedResults) {
                    setLoading(true)
                }
                const res = await api.get("/video/search", { params: { q } })
                const data = Array.isArray(res.data?.data) ? res.data.data : []
                setResults(data)
                setCachedPageData(`page:search:${q}`, data, 120000)
            } catch (error) {
                setResults([])
            } finally {
                setLoading(false)
            }
        }

        run()
    }, [q, cachedResults])

    useEffect(() => {
        const trimmed = query.trim()
        const timer = window.setTimeout(() => {
            if (trimmed === q) return
            submitSearch(trimmed, true, false)
        }, 300)

        return () => window.clearTimeout(timer)
    }, [query, q])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!searchWrapRef.current?.contains(event.target as Node)) {
                setShowSuggestions(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    return (
        <AppLayout>
            <div className="w-full">
                <section className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#6d37a9]/45 via-[#463a92]/42 to-[#1f214b]/62 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                    <div className="border-b border-white/10 px-6 py-6 sm:px-8">
                        <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.42fr)_minmax(0,1fr)] xl:items-end">
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                                    Search
                                </h1>
                                <p className="mt-2 text-sm text-purple-100/65 sm:text-base">
                                    {q ? `Results for "${q}"` : "Search for videos, channels, and titles"}
                                </p>
                            </div>

                            <div ref={searchWrapRef} className="relative">
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault()
                                        submitSearch(query)
                                    }}
                                    className="flex w-full items-center gap-3 rounded-2xl border border-purple-300/22 bg-white/8 px-5 py-4 backdrop-blur focus-within:border-purple-300/45 focus-within:ring-2 focus-within:ring-purple-500/25"
                                >
                                    <button type="submit" className="text-purple-100/65" aria-label="Search">
                                        <Search size={20} />
                                    </button>
                                    <input
                                        value={query}
                                        onFocus={() => setShowSuggestions(true)}
                                        onChange={(e) => {
                                            setQuery(e.target.value)
                                            setShowSuggestions(true)
                                        }}
                                        placeholder="Search videos, creators, playlists..."
                                        className="w-full bg-transparent text-base text-white outline-none placeholder:text-purple-100/40"
                                    />
                                </form>

                                {showSuggestions && searchHistory.length > 0 && (
                                    <div className="absolute left-0 right-0 top-full z-20 mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1434]/88 shadow-[0_24px_60px_rgba(0,0,0,0.26)] backdrop-blur-xl">
                                        <div className="border-b border-white/8 px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-purple-100/45">
                                            {query.trim() ? "Suggestions" : "Recent searches"}
                                        </div>

                                        <div className="max-h-72 overflow-y-auto py-2">
                                            {suggestionItems.length > 0 ? (
                                                suggestionItems.map((item) => (
                                                    <button
                                                        key={item}
                                                        type="button"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => {
                                                            setQuery(item)
                                                            submitSearch(item)
                                                        }}
                                                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white transition hover:bg-white/8"
                                                    >
                                                        <Search size={16} className="shrink-0 text-purple-100/45" />
                                                        <span className="truncate">{item}</span>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="px-4 py-4 text-sm text-purple-100/45">
                                                    No matching previous searches.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6 px-6 py-6 sm:px-8">
                        {q && !loading && (
                            <div className="flex flex-wrap items-center gap-3 text-sm text-purple-100/60">
                                <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5">
                                    {results.length} result{results.length === 1 ? "" : "s"}
                                </span>
                                <span>Showing the best matches for your query.</span>
                            </div>
                        )}

                        {loading && (
                            <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-5 text-sm text-purple-100/60">
                                Searching...
                            </div>
                        )}

                        {!loading && q && results.length === 0 && (
                            <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-6 text-center">
                                <p className="text-base font-medium text-white">No matches found</p>
                                <p className="mt-1 text-sm text-purple-100/55">
                                    Try a different title, creator name, or a shorter keyword.
                                </p>
                            </div>
                        )}

                        {!loading && !q && (
                            <div className="rounded-2xl border border-white/8 bg-white/6 px-4 py-6 text-center">
                                <p className="text-base font-medium text-white">Start typing to search</p>
                                <p className="mt-1 text-sm text-purple-100/55">
                                    Use video names, channel names, or keywords to find content quickly.
                                </p>
                            </div>
                        )}

                        {!loading && results.length > 0 && (
                            <div
                                className="grid justify-start gap-4"
                                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 360px))" }}
                            >
                                {results.map((video, index) => (
                                    <div key={video.publicId || `search-${index}`} className="w-full max-w-[360px]">
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

export default SearchPage
