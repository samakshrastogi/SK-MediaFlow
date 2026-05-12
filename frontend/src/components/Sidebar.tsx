import { useEffect, useState } from "react"
import { Home, Search, Film, Heart, Smartphone, User } from "lucide-react"
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

const Sidebar = () => {
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
        { icon: Home, path: "/home", label: "Home" },
        { icon: Search, path: "/search", label: "Search" },
        ...(hasPortraitVideos
            ? [{ icon: Smartphone, path: "/portrait", label: "Portrait" }]
            : []),
        { icon: Film, path: "/playlists", label: "Playlists" },
        { icon: Heart, path: "/favorites", label: "Favorites" },
        { icon: User, path: "/profile", label: "Profile" }
    ]

    return (
        <aside
            className="
        fixed bottom-6 left-1/2 -translate-x-1/2 z-40
        hidden md:flex items-center gap-3

        bg-white/10 backdrop-blur-xl
        border border-white/10
        rounded-2xl

        px-3 py-2
        shadow-[0_0_25px_rgba(0,0,0,0.3)]
      "
        >
            {items.map(({ icon: Icon, path, label }) => {
                const active = location.pathname === path

                return (
                    <button
                        key={path}
                        onClick={() => navigate(path)}
                        className={`
              group flex items-center gap-2 overflow-hidden
              rounded-xl px-3 py-2
              transition-all duration-300

              ${active
                                ? "bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.25)]"
                                : "text-gray-300 hover:text-white hover:bg-white/10"
                            }
            `}
                    >
                        <Icon size={20} />

                        {/* LABEL */}
                        <span
                            className={`
                text-sm whitespace-nowrap
                transition-all duration-300

                ${active
                                    ? "opacity-100 max-w-[120px] ml-1"
                                    : "opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-[120px] group-hover:ml-1"
                                }
              `}
                        >
                            {label}
                        </span>
                    </button>
                )
            })}
        </aside>
    )
}

export default Sidebar
