import { Home, Search, UploadCloud, Building2, User } from "lucide-react"
import { useNavigate, useLocation } from "react-router-dom"

const MobileBottomNav = () => {
    const navigate = useNavigate()
    const location = useLocation()

    const items = [
        { icon: Home, path: "/home", label: "Home" },
        { icon: Search, path: "/search", label: "Search" },
        { icon: UploadCloud, path: "/upload", label: "Upload" },
        { icon: Building2, path: "/organization", label: "Organization" },
        { icon: User, path: "/profile", label: "Profile" },
    ]

    return (
        <div
            className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-0 z-40 w-full px-4"
        >
            <div className="mx-auto flex max-w-sm items-center justify-between rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] px-2 py-2 shadow-[0_22px_60px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
                {items.map(({ icon: Icon, path, label }) => {
                    const active = location.pathname === path

                    return (
                        <button
                            key={path}
                            aria-label={label}
                            title={label}
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
