import Sidebar from "@/components/Sidebar"
import Topbar from "@/components/Topbar"
import MobileBottomNav from "@/components/MobileBottomNav"
import { useLayout } from "@/context/LayoutContext"

const AppLayout = ({ children }: { children: React.ReactNode }) => {
    const { sidebarOpen } = useLayout()

    return (
        <div className="min-h-screen bg-linear-to-br from-purple-900 via-indigo-900 to-black text-white overflow-x-hidden">

            <Sidebar />
            <Topbar />

            <main
                className={`
                    pt-20 sm:pt-22.5
                    px-4 md:px-6 xl:px-8 2xl:px-10
                    pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:pb-10
                    transition-all duration-300
                    ${sidebarOpen ? "md:ml-64" : "md:ml-0"}
                `}
            >
                <div className="min-w-0 w-full space-y-8">
                    {children}
                </div>
            </main>

            <MobileBottomNav />
        </div>
    )
}

export default AppLayout
