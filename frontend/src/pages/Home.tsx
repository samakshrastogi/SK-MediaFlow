import { type ReactNode, useEffect, useState, useCallback, useMemo } from "react"
import { motion } from "framer-motion"
import { Flame, Radio, Sparkles, TrendingUp } from "lucide-react"
import { api } from "@/api/axios"
import AppLayout from "@/layouts/AppLayout"
import HeroCarousel from "@/components/HeroCarousel"
import VideoRow from "@/components/VideoRow"
import { getCachedPageData, setCachedPageData } from "@/utils/pageCache"

/* ---------------- TYPES ---------------- */

interface Video {
  publicId: string
  title?: string
  aiTitle?: string
  aiDescription?: string
  keywords?: string[]
  tags?: string[]
  thumbnailKey?: string
  videoKey?: string
  duration?: string
  durationSeconds?: number | null
  progress?: number
  uploaderAvatarKey?: string
  uploaderAvatarUrl?: string
  uploaderName?: string
  createdAt?: string
  lastWatchedAt?: string | null
  watchedSeconds?: number
  lastPositionSeconds?: number
  orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
  visibility?: "PUBLIC" | "PRIVATE" | "ORGANIZATION"
  signedUrl?: string
  viewsCount?: number
  viewsLast24h?: number
  viewsLast7d?: number
  likesCount?: number
  dislikesCount?: number
  likesLast7d?: number
  sharesCount?: number
  sharesLast7d?: number
  commentsCount?: number
  commentsLast7d?: number
  activeSessionsCount?: number
  userReaction?: "LIKE" | "DISLIKE" | null
  channel?: {
    name?: string
    username?: string
  }
}

interface RawVideo {
  publicId: string
  title?: string
  aiTitle?: string
  aiDescription?: string
  keywords?: string[]
  tags?: string[]
  thumbnailKey?: string
  videoKey?: string
  duration?: string
  durationSeconds?: number | null
  progress?: number
  uploaderAvatarKey?: string
  uploaderAvatarUrl?: string
  uploaderName?: string
  createdAt?: string
  lastWatchedAt?: string | null
  watchedSeconds?: number
  lastPositionSeconds?: number
  orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
  visibility?: "PUBLIC" | "PRIVATE" | "ORGANIZATION"
  signedUrl?: string
  viewsCount?: number
  viewsLast24h?: number
  viewsLast7d?: number
  likesCount?: number
  dislikesCount?: number
  likesLast7d?: number
  sharesCount?: number
  sharesLast7d?: number
  commentsCount?: number
  commentsLast7d?: number
  activeSessionsCount?: number
  userReaction?: "LIKE" | "DISLIKE" | null
  channel?: {
    name?: string
    username?: string
  }
}

interface OrganizationMembership {
  status: string
  organization?: {
    id?: string
    name?: string
  }
}

interface OrganizationOption {
  id: string
  name: string
}

interface HomePageCache {
  videos: Video[]
  landscapeVideos: Video[]
  portraitVideos: Video[]
  orgVideos: Video[]
  orgMemberships: OrganizationMembership[]
  selectedOrgId: string | null
  selectedOrgName: string
}

const ROW_LIMIT = 10
const DAY_IN_MS = 24 * 60 * 60 * 1000

const toTimestamp = (value?: string | null) => {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))

const uniqueVideos = (items: Video[]) => {
  const seen = new Set<string>()
  return items.filter((video) => {
    const key = video.publicId
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const freshnessBoost = (createdAt?: string) => {
  const ageDays = (Date.now() - toTimestamp(createdAt)) / DAY_IN_MS
  if (!Number.isFinite(ageDays) || ageDays < 0) return 0
  return Math.max(0, 14 - ageDays)
}

const engagementScore = (video: Video) =>
  (video.viewsCount || 0) +
  (video.likesCount || 0) * 4 +
  (video.sharesCount || 0) * 6 +
  (video.commentsCount || 0) * 3 -
  (video.dislikesCount || 0) * 2

const trendingScore = (video: Video) =>
  (video.viewsLast24h || 0) * 8 +
  (video.viewsLast7d || 0) * 3 +
  (video.likesLast7d || 0) * 10 +
  (video.sharesLast7d || 0) * 12 +
  (video.commentsLast7d || 0) * 6 +
  (video.activeSessionsCount || 0) * 14 +
  freshnessBoost(video.createdAt)

const liveScore = (video: Video) =>
  (video.activeSessionsCount || 0) * 18 +
  (video.viewsLast24h || 0) * 5 +
  (video.likesLast7d || 0) * 2 +
  freshnessBoost(video.createdAt)

const popularityScore = (video: Video) =>
  engagementScore(video) +
  (video.viewsLast7d || 0) * 2 +
  (video.activeSessionsCount || 0) * 5

const takeShelf = (source: Video[], limit: number, consumed?: Set<string>) => {
  const picked: Video[] = []
  const localSeen = new Set<string>()

  for (const video of source) {
    const key = video.publicId
    if (!key || localSeen.has(key) || consumed?.has(key)) continue
    localSeen.add(key)
    picked.push(video)
    if (picked.length >= limit) break
  }

  picked.forEach((video) => consumed?.add(video.publicId))
  return picked
}

/* ---------------- COMPONENT ---------------- */

const Home = () => {
  const cached = getCachedPageData<HomePageCache>("page:home")
  const savedOrgStorageKey = "home:last-selected-organization"

  const [videos, setVideos] = useState<Video[]>(cached?.videos || [])
  const [landscapeVideos, setLandscapeVideos] = useState<Video[]>(cached?.landscapeVideos || [])
  const [portraitVideos, setPortraitVideos] = useState<Video[]>(cached?.portraitVideos || [])
  const [orgVideos, setOrgVideos] = useState<Video[]>(cached?.orgVideos || [])
  const [orgMemberships, setOrgMemberships] = useState<OrganizationMembership[]>(cached?.orgMemberships || [])
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(cached?.selectedOrgId || null)
  const [selectedOrgName, setSelectedOrgName] = useState<string>(cached?.selectedOrgName || "")
  const [loading, setLoading] = useState(!cached)
  const [orgRowLoading, setOrgRowLoading] = useState(false)

  /* ---------------- HELPERS ---------------- */

  const normalize = (videos: RawVideo[]): Video[] => {
    if (!Array.isArray(videos)) return []

    return videos.map(v => ({
      publicId: v.publicId,   // ✅ FIX
      title: v.title || v.aiTitle || "Untitled",
      aiTitle: v.aiTitle ?? undefined,
      aiDescription: v.aiDescription ?? undefined,
      keywords: v.keywords ?? [],
      tags: v.tags ?? [],
      thumbnailKey: v.thumbnailKey,
      videoKey: v.videoKey,
      duration: v.duration,
      durationSeconds: v.durationSeconds ?? null,
      progress: v.progress,
      uploaderAvatarKey: v.uploaderAvatarKey ?? undefined,
      uploaderAvatarUrl: v.uploaderAvatarUrl ?? undefined,
      uploaderName: v.uploaderName ?? undefined,
      createdAt: v.createdAt ?? undefined,
      lastWatchedAt: v.lastWatchedAt ?? null,
      watchedSeconds: v.watchedSeconds ?? 0,
      lastPositionSeconds: v.lastPositionSeconds ?? 0,
      orientation: v.orientation ?? null,
      visibility: v.visibility,
      signedUrl: v.signedUrl ?? undefined,
      viewsCount: v.viewsCount ?? 0,
      viewsLast24h: v.viewsLast24h ?? 0,
      viewsLast7d: v.viewsLast7d ?? 0,
      likesCount: v.likesCount ?? 0,
      dislikesCount: v.dislikesCount ?? 0,
      likesLast7d: v.likesLast7d ?? 0,
      sharesCount: v.sharesCount ?? 0,
      sharesLast7d: v.sharesLast7d ?? 0,
      commentsCount: v.commentsCount ?? 0,
      commentsLast7d: v.commentsLast7d ?? 0,
      activeSessionsCount: v.activeSessionsCount ?? 0,
      userReaction: v.userReaction ?? null,
      channel: v.channel ?? undefined
    }))
  }

  /* ---------------- FETCH ---------------- */

  const fetchHomeData = useCallback(async () => {
    try {
      const [res, orgRes] = await Promise.all([
        api.get("/video"),
        api.get("/organization/my")
      ])
      const raw: RawVideo[] = res.data?.data || []

      const allVideos = normalize(raw)
      const publicVideos = allVideos.filter(v => !v.visibility || v.visibility === "PUBLIC")
      const portraits = publicVideos.filter(v => v.orientation === "PORTRAIT")
      const landscapes = publicVideos.filter(v => v.orientation !== "PORTRAIT")

      setVideos(allVideos)
      setPortraitVideos(portraits)
      setLandscapeVideos(landscapes)

      const memberships = ((orgRes.data?.data?.memberships || []) as OrganizationMembership[]).filter((m) => m.status === "APPROVED")
      setOrgMemberships(memberships)

      const savedOrgId = localStorage.getItem(savedOrgStorageKey)
      const activeOrgId = orgRes.data?.data?.access?.activeOrganizationId ?? null
      const preferredOrg =
        (savedOrgId
          ? memberships.find((m) => m.organization?.id === savedOrgId)
          : null) ||
        (activeOrgId
          ? memberships.find((m) => m.organization?.id === activeOrgId)
          : null)
      if (preferredOrg?.organization?.id) {
        setSelectedOrgId(preferredOrg.organization.id)
        setSelectedOrgName(preferredOrg.organization.name || "Organization")
        localStorage.setItem(savedOrgStorageKey, preferredOrg.organization.id)
      } else {
        setSelectedOrgId(null)
        setSelectedOrgName("")
        localStorage.removeItem(savedOrgStorageKey)
      }

    } catch (error) {
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHomeData()
  }, [fetchHomeData])

  const orgOptions = useMemo(
    () =>
      orgMemberships.map((m) => ({
        id: m.organization?.id,
        name: m.organization?.name || "Organization"
      })).filter((o): o is OrganizationOption => typeof o.id === "string" && o.id.length > 0),
    [orgMemberships]
  )

  const fetchOrgRow = useCallback(async (organizationId: string) => {
    try {
      setOrgRowLoading(true)
      const res = await api.get(`/video/organization/${organizationId}`)
      const raw: RawVideo[] = res.data?.data || []
      setOrgVideos(normalize(raw))
    } catch (err) {
      setOrgVideos([])
    } finally {
      setOrgRowLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedOrgId) {
      fetchOrgRow(selectedOrgId)
    } else {
      setOrgVideos([])
    }
  }, [selectedOrgId, fetchOrgRow])

  useEffect(() => {
    if (selectedOrgId) {
      localStorage.setItem(savedOrgStorageKey, selectedOrgId)
    }
  }, [selectedOrgId])

  useEffect(() => {
    setCachedPageData<HomePageCache>("page:home", {
      videos,
      landscapeVideos,
      portraitVideos,
      orgVideos,
      orgMemberships,
      selectedOrgId,
      selectedOrgName
    }, 120000)
  }, [videos, landscapeVideos, portraitVideos, orgVideos, orgMemberships, selectedOrgId, selectedOrgName])

  const publicLandscapeVideos = useMemo(
    () => uniqueVideos(landscapeVideos.filter((video) => !video.visibility || video.visibility === "PUBLIC")),
    [landscapeVideos]
  )

  const libraryVideos = useMemo(
    () => uniqueVideos(videos),
    [videos]
  )

  const continueWatchingSource = useMemo(
    () =>
      [...libraryVideos]
        .filter((video) => {
          const progress = video.progress ?? 0
          return Boolean(video.lastWatchedAt) && progress >= 5 && progress < 98
        })
        .sort((a, b) => toTimestamp(b.lastWatchedAt) - toTimestamp(a.lastWatchedAt)),
    [libraryVideos]
  )

  const recentlyUploadedSource = useMemo(
    () =>
      [...libraryVideos].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt)),
    [libraryVideos]
  )

  const trendingSource = useMemo(
    () =>
      [...publicLandscapeVideos]
        .sort((a, b) => trendingScore(b) - trendingScore(a) || toTimestamp(b.createdAt) - toTimestamp(a.createdAt)),
    [publicLandscapeVideos]
  )

  const watchingNowSource = useMemo(
    () =>
      [...libraryVideos]
        .filter((video) => (video.activeSessionsCount || 0) > 0 || (video.viewsLast24h || 0) > 0)
        .sort((a, b) => liveScore(b) - liveScore(a) || toTimestamp(b.createdAt) - toTimestamp(a.createdAt)),
    [libraryVideos]
  )

  const popularSource = useMemo(
    () =>
      [...publicLandscapeVideos]
        .sort((a, b) => popularityScore(b) - popularityScore(a) || toTimestamp(b.createdAt) - toTimestamp(a.createdAt)),
    [publicLandscapeVideos]
  )

  const recommendedSource = useMemo(() => {
    const preferenceSeed = libraryVideos.filter((video) => Boolean(video.lastWatchedAt) || video.userReaction === "LIKE")

    if (!preferenceSeed.length) {
      return [...popularSource]
    }

    const preferredChannels = new Map<string, number>()
    const preferredOrientations = new Map<string, number>()
    const preferredTerms = new Map<string, number>()

    for (const video of preferenceSeed) {
      const channelKey = video.channel?.username || video.channel?.name || video.uploaderName || ""
      if (channelKey) {
        preferredChannels.set(channelKey, (preferredChannels.get(channelKey) || 0) + (video.userReaction === "LIKE" ? 4 : 2))
      }

      if (video.orientation) {
        preferredOrientations.set(video.orientation, (preferredOrientations.get(video.orientation) || 0) + 1)
      }

      for (const term of [...(video.tags || []), ...(video.keywords || [])]) {
        const normalized = String(term || "").toLowerCase().trim()
        if (!normalized) continue
        preferredTerms.set(normalized, (preferredTerms.get(normalized) || 0) + 1)
      }
    }

    return [...libraryVideos]
      .filter((video) => (video.progress ?? 0) < 98)
      .sort((a, b) => {
        const scoreVideo = (candidate: Video) => {
          const channelKey = candidate.channel?.username || candidate.channel?.name || candidate.uploaderName || ""
          const channelAffinity = preferredChannels.get(channelKey) || 0
          const orientationAffinity = candidate.orientation ? preferredOrientations.get(candidate.orientation) || 0 : 0
          const termAffinity = [...(candidate.tags || []), ...(candidate.keywords || [])].reduce((sum, term) => {
            const normalized = String(term || "").toLowerCase().trim()
            return sum + (preferredTerms.get(normalized) || 0)
          }, 0)

          return (
            channelAffinity * 8 +
            orientationAffinity * 3 +
            termAffinity * 2 +
            trendingScore(candidate) * 0.55 +
            popularityScore(candidate) * 0.2 +
            clamp(100 - (candidate.progress ?? 0), 0, 100) * 0.08
          )
        }

        return scoreVideo(b) - scoreVideo(a) || toTimestamp(b.createdAt) - toTimestamp(a.createdAt)
      })
  }, [libraryVideos, popularSource])

  const shelves = useMemo(() => {
    const consumed = new Set<string>()
    const episodeSource = [...portraitVideos].sort(
      (a, b) => trendingScore(b) - trendingScore(a) || toTimestamp(b.createdAt) - toTimestamp(a.createdAt)
    )

    return {
      continueWatching: takeShelf(continueWatchingSource, 8, consumed),
      trendingNow: takeShelf(trendingSource, ROW_LIMIT, consumed),
      recentlyUploaded: takeShelf(recentlyUploadedSource, ROW_LIMIT, consumed),
      recommendedForYou: takeShelf(recommendedSource, ROW_LIMIT, consumed),
      newEpisodes: takeShelf(episodeSource, ROW_LIMIT, consumed),
      watchingNow: takeShelf(watchingNowSource, 8, consumed),
      popular: takeShelf(popularSource, ROW_LIMIT, consumed)
    }
  }, [
    continueWatchingSource,
    trendingSource,
    recentlyUploadedSource,
    recommendedSource,
    portraitVideos,
    watchingNowSource,
    popularSource
  ])

  const {
    continueWatching,
    trendingNow,
    recentlyUploaded,
    recommendedForYou,
    newEpisodes,
    watchingNow,
    popular
  } = shelves

  const featuredCarouselVideos = useMemo(
    () =>
      uniqueVideos([
        ...trendingSource.slice(0, 3),
        ...recentlyUploadedSource.slice(0, 2),
        ...popularSource.slice(0, 2),
        ...recommendedSource.slice(0, 2)
      ]).slice(0, 8),
    [trendingSource, recentlyUploadedSource, popularSource, recommendedSource]
  )

  const heroVideo = trendingNow[0] || recentlyUploaded[0] || popular[0] || videos[0]
  const hasAnyRows =
    !!selectedOrgId ||
    !!continueWatching.length ||
    !!trendingNow.length ||
    !!recommendedForYou.length ||
    !!recentlyUploaded.length ||
    !!newEpisodes.length ||
    !!popular.length

  /* ---------------- UI ---------------- */

  return (
    <AppLayout>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[-10%] top-8 h-96 w-96 rounded-full bg-fuchsia-500/14 blur-[140px]" />
          <div className="absolute right-[-8%] top-40 h-[28rem] w-[28rem] rounded-full bg-blue-500/14 blur-[160px]" />
          <div className="absolute bottom-24 left-1/3 h-80 w-80 rounded-full bg-cyan-400/10 blur-[150px]" />
          <motion.div
            animate={{ x: [0, 36, -18, 0], y: [0, -20, 16, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
            className="absolute left-[18%] top-[14%] h-40 w-40 rounded-full bg-violet-400/10 blur-[90px]"
          />
          <motion.div
            animate={{ x: [0, -24, 14, 0], y: [0, 24, -10, 0] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
            className="absolute right-[14%] top-[28%] h-52 w-52 rounded-full bg-cyan-300/10 blur-[110px]"
          />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.55) 1px, transparent 0)",
              backgroundSize: "30px 30px"
            }}
          />
        </div>

        <div className="relative w-full space-y-10 sm:space-y-12">

        {/* HERO */}
        {featuredCarouselVideos.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative hidden md:block"
          >
            <HeroCarousel videos={featuredCarouselVideos} />

            <div className="absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-[#070814] via-[#070814]/72 to-transparent pointer-events-none" />
          </motion.div>
        )}

        {/* CONTENT */}
        {loading ? (
          <SkeletonLoader />
        ) : (
          <div className="space-y-9 pb-10">
            {heroVideo && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.6 }}
                className="hidden gap-3 px-1 md:grid md:grid-cols-3"
              >
                <HomePulsePanel
                  title="Watching Now"
                  value={heroVideo.aiTitle || heroVideo.title || "Featured Stream"}
                  meta="Live hero spotlight is active"
                  icon={<Radio className="h-4 w-4" />}
                />
                <HomePulsePanel
                  title="Trending Pulse"
                  value={`${trendingNow.length} active picks`}
                  meta="Curated from current public streaming shelves"
                  icon={<TrendingUp className="h-4 w-4" />}
                />
                <HomePulsePanel
                  title="Viewer Atmosphere"
                  value={`${recentlyUploaded.length} fresh drops`}
                  meta="Recently uploaded titles shaping the feed"
                  icon={<Flame className="h-4 w-4" />}
                />
              </motion.section>
            )}

            {selectedOrgId && (
              <VideoRow
                title={selectedOrgName ? `${selectedOrgName} Videos` : "Organization Videos"}
                subtitle="Private streaming shelf tuned to your active workspace access."
                eyebrow="Workspace stream"
                accent="cyan"
                videos={orgVideos}
                rightSlot={
                  <div className="flex items-center gap-2">
                    {orgRowLoading && (
                      <span className="text-xs text-gray-400">Loading...</span>
                    )}
                    {orgOptions.length > 1 && (
                      <select
                        value={selectedOrgId}
                        onChange={(e) => {
                          const nextId = e.target.value
                          const nextOrg = orgOptions.find((o) => o.id === nextId)
                          setSelectedOrgId(nextId)
                          setSelectedOrgName(nextOrg?.name || "Organization")
                          localStorage.setItem(savedOrgStorageKey, nextId)
                        }}
                        className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs"
                      >
                        {orgOptions.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                }
              />
            )}

            {continueWatching.length > 0 && (
              <VideoRow
                title="Continue Watching"
                subtitle="Jump back into your unfinished cinematic sessions with active playback state."
                eyebrow="Resume instantly"
                accent="violet"
                videos={continueWatching}
              />
            )}

            {trendingNow.length > 0 && (
              <VideoRow
                title="Trending Now"
                accent="fuchsia"
                videos={trendingNow}
              />
            )}

            {recentlyUploaded.length > 0 && (
              <VideoRow
                title="Recently Uploaded"
                subtitle="Fresh drops, recent creator activity, and newly surfaced cinematic content."
                eyebrow="Latest arrivals"
                accent="cyan"
                videos={recentlyUploaded}
              />
            )}

            {recommendedForYou.length > 0 && (
              <VideoRow
                title="Recommended For You"
                subtitle="Futuristic editorial picks tailored from your current discovery pattern."
                eyebrow="Curated stream"
                accent="blue"
                videos={recommendedForYou}
              />
            )}

            {newEpisodes.length > 0 && (
              <VideoRow
                title="New Episodes"
                subtitle="Short-form and portrait stories tuned for fast, high-impact entertainment."
                eyebrow="Vertical cinema"
                accent="amber"
                videos={newEpisodes}
              />
            )}

            {watchingNow.length > 0 && (
              <VideoRow
                title="Watching Now"
                subtitle="A live-feeling feed of active library moments and real-time platform energy."
                eyebrow="Active sessions"
                accent="emerald"
                videos={watchingNow}
              />
            )}

            {popular.length > 0 && (
              <VideoRow
                title="Popular on SK-MediaFlow"
                subtitle="The strongest all-around catalog performers based on views, reactions, shares, and sustained engagement."
                eyebrow="Audience favorites"
                accent="rose"
                videos={popular}
              />
            )}

            {!hasAnyRows && (
              <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] py-20 text-center text-gray-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
                <Sparkles className="mx-auto h-10 w-10 text-cyan-200/60" />
                <p className="mt-5 text-xl font-semibold text-white">No videos available yet</p>
                <p className="mt-2 text-sm text-purple-100/55">
                  Your cinematic streaming surface will populate as soon as content lands in the library.
                </p>
              </div>
            )}

          </div>
        )}

      </div>
      </div>

    </AppLayout>
  )
}

/* ---------------- SKELETON ---------------- */

const SkeletonLoader = () => {
  return (
    <div className="space-y-10">
      <div className="h-[26rem] overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] shadow-[0_24px_70px_rgba(0,0,0,0.2)]">
        <div className="h-full w-full animate-pulse bg-[linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0.12),rgba(255,255,255,0.05))]" />
      </div>

      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-4">

          <div className="space-y-2">
            <div className="h-3 w-28 rounded-full bg-white/10 animate-pulse" />
            <div className="h-6 w-52 rounded-full bg-white/10 animate-pulse" />
          </div>

          <div className="flex flex-col gap-3 sm:hidden">
            {[1, 2, 3].map(j => (
              <div key={j} className="h-28 bg-white/10 rounded-[22px] animate-pulse" />
            ))}
          </div>

          <div className="hidden sm:flex gap-4 overflow-hidden">
            {[1, 2, 3, 4].map((j) => (
              <div
                key={j}
                className="h-56 w-72 rounded-[24px] bg-white/10 animate-pulse"
              />
            ))}
          </div>

        </div>
      ))}

    </div>
  )
}

const HomePulsePanel = ({
  title,
  value,
  meta,
  icon
}: {
  title: string
  value: string
  meta: string
  icon: ReactNode
}) => (
  <motion.div
    whileHover={{ y: -6, rotateX: 5, rotateY: -5 }}
    transition={{ type: "spring", stiffness: 220, damping: 18 }}
    className="rounded-[24px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_22px_48px_rgba(0,0,0,0.16)] backdrop-blur-xl"
  >
    <div className="flex items-center justify-between">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-100/55">{title}</p>
      <div className="rounded-2xl border border-white/10 bg-black/18 p-2 text-cyan-100">
        {icon}
      </div>
    </div>
    <p className="mt-3 text-lg font-semibold text-white">{value}</p>
    <p className="mt-1 text-sm text-purple-100/55">{meta}</p>
  </motion.div>
)

export default Home
