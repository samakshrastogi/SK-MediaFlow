import { useEffect, useState, useCallback, useMemo } from "react"
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
  thumbnailKey?: string
  videoKey?: string
  uploaderAvatarKey?: string
  uploaderAvatarUrl?: string
  uploaderName?: string
  createdAt?: string
  orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
  visibility?: "PUBLIC" | "PRIVATE" | "ORGANIZATION"
  channel?: {
    name?: string
  }
}

interface RawVideo {
  publicId: string
  title?: string
  aiTitle?: string
  thumbnailKey?: string
  videoKey?: string
  uploaderAvatarKey?: string
  uploaderAvatarUrl?: string
  uploaderName?: string
  createdAt?: string
  orientation?: "PORTRAIT" | "LANDSCAPE" | "SQUARE" | null
  visibility?: "PUBLIC" | "PRIVATE" | "ORGANIZATION"
  channel?: {
    name?: string
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
      thumbnailKey: v.thumbnailKey,
      uploaderAvatarKey: v.uploaderAvatarKey ?? undefined,
      uploaderAvatarUrl: v.uploaderAvatarUrl ?? undefined,
      uploaderName: v.uploaderName ?? undefined,
      createdAt: v.createdAt ?? undefined,
      orientation: v.orientation ?? null,
      visibility: v.visibility,
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

  /* ---------------- UI ---------------- */

  return (
    <AppLayout>

      <div
        className="
          w-full
          space-y-10 sm:space-y-12
        "
      >

        {/* HERO */}
        {videos.length > 0 && (
          <div className="relative">
            <HeroCarousel videos={videos} />

            <div className="absolute bottom-0 left-0 right-0 h-20 bg-linear-to-t from-black to-transparent pointer-events-none" />
          </div>
        )}

        {/* CONTENT */}
        {loading ? (
          <SkeletonLoader />
        ) : (
          <div className="space-y-10">

            {selectedOrgId && (
              <VideoRow
                title={selectedOrgName ? `${selectedOrgName} Videos` : "Organization Videos"}
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

            {landscapeVideos.length > 0 && (
                <VideoRow
                title="Featured Stories"
                videos={landscapeVideos}
              />
            )}

            {portraitVideos.length > 0 && (
              <VideoRow
                title="Short-form Stories"
                videos={portraitVideos}
              />
            )}

            {!selectedOrgId && !landscapeVideos.length && !portraitVideos.length && (
              <div className="text-center text-gray-400 py-20">
                No videos available yet
              </div>
            )}

          </div>
        )}

      </div>

    </AppLayout>
  )
}

/* ---------------- SKELETON ---------------- */

const SkeletonLoader = () => {
  return (
    <div className="space-y-8">

      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-4">

          <div className="h-5 w-40 bg-white/10 rounded animate-pulse" />

          <div className="flex flex-col gap-3 sm:hidden">
            {[1, 2, 3].map(j => (
              <div key={j} className="h-22.5 bg-white/10 rounded-lg animate-pulse" />
            ))}
          </div>

          <div className="hidden sm:flex gap-4 overflow-hidden">
            {[1, 2, 3, 4].map((j) => (
              <div
                key={j}
                className="w-55 h-32.5 bg-white/10 rounded-lg animate-pulse"
              />
            ))}
          </div>

        </div>
      ))}

    </div>
  )
}

export default Home
