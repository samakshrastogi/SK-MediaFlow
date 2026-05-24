import { useEffect, useState } from "react"
import { Home, Search, Film, Heart, User, Smartphone } from "lucide-react"
import { useNavigate, useLocation } from "react-router-dom"
import { api } from "@/api/axios"

let portraitAvailabilityPromise: Promise<boolean> | null = null
let portraitAvailabilityCache: boolean | null = null

const getPortraitAvailability = async () => {
    if (portraitAvailabilityCache !== null) return portraitAvailabilityCache

    if (!portraitAvailabilityPromise) {
        portraitAvailabilityPromise = api.get("/video/portrait")
            .then((res) => {
                portraitAvailabilityCache = (res.data?.data || []).length > 0
                return portraitAvailabilityCache
            })
            .catch(() => {
                portraitAvailabilityCache = false
                return false
            })
            .finally(() => {
                portraitAvailabilityPromise = null
            })
    }

    return portraitAvailabilityPromise
}

const MobileBottomNav = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const [hasPortraitVideos, setHasPortraitVideos] = useState(false)

    useEffect(() => {
        let mounted = true
        void getPortraitAvailability().then((hasVideos) => {
            if (mounted) {
                setHasPortraitVideos(hasVideos)
            }
        })

        return () => {
            mounted = false
        }
    }, [])

    const items = [
        { icon: Home, path: "/home" },
        { icon: Search, path: "/search" },
        ...(hasPortraitVideos ? [{ icon: Smartphone, path: "/portrait" }] : []),
        { icon: Film, path: "/playlists" },
        { icon: Heart, path: "/favorites" },
        { icon: User, path: "/profile" },
    ]

    return (
        <div
            className="fixed bottom-3 left-0 z-40 w-full px-4 md:hidden"
        >
            <div className="mx-auto flex max-w-sm items-center justify-between rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] px-2 py-2 shadow-[0_22px_60px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
                {items.map(({ icon: Icon, path }) => {
                    const active = location.pathname === path

                    return (
                        <button
                            key={path}
                            aria-label="h"
                            onClick={() => navigate(path)}
                            className="flex flex-1 flex-col items-center justify-center py-1"
                        >
                            <div
                                className={`rounded-2xl p-2.5 transition-all duration-300 ${
                                    active
                                        ? "bg-white/18 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)]"
                                        : "text-gray-400 hover:-translate-y-0.5 hover:text-white"
                                }`}
                            >
                                <Icon size={20} />
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export default MobileBottomNav
