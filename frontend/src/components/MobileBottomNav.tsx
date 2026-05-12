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
            className="
        fixed bottom-0 left-0 w-full z-50
        md:hidden
        bg-white/5 backdrop-blur-xl
        border-t border-white/10
        px-4 py-2
      "
        >
            <div className="flex justify-between items-center">
                {items.map(({ icon: Icon, path }) => {
                    const active = location.pathname === path

                    return (
                        <button
                            key={path}
                            aria-label="h"
                            onClick={() => navigate(path)}
                            className="flex flex-col items-center justify-center flex-1 py-1"
                        >
                            <div
                                className={`p-2 rounded-lg transition-all${active
                                        ? "bg-white/20 text-white"
                                        : "text-gray-400"
                                    }
                `}
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
