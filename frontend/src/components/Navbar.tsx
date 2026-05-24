import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/api/axios";
import { useNavigate } from "react-router-dom";

interface User {
    id: string;
    username: string;
    createdAt: string;
}

const Navbar = () => {
    const { logout } = useAuth();
    const [user, setUser] = useState<User | null>(null);
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await api.get("/user/me");

                const userData = res.data?.data || res.data;

                if (!userData?.username) {
                    throw new Error("Invalid user data");
                }

                setUser(userData);
            } catch {
                logout();
                navigate("/login");
            }
        };

        fetchUser();
    }, [logout, navigate]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleLogout = async () => {
        await logout();
        navigate("/login");
    };

    const getInitials = (username?: string) => {
        if (!username) return "?";

        return username
            .split(" ")
            .map((word) => word[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <nav className="bg-gray-900 text-white px-3 sm:px-4 md:px-6 py-3 flex justify-between items-center border-b border-gray-800">
            <div className="text-xl font-bold">🎬 SK-MediaFlow</div>

            <div className="flex items-center gap-6 relative">
                <button
                    onClick={() => navigate("/upload")}
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded transition"
                >
                    Upload
                </button>

                <div className="relative" ref={dropdownRef}>
                    <div
                        onClick={() => setOpen(!open)}
                        className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center cursor-pointer font-semibold"
                    >
                        {getInitials(user?.username)}
                    </div>

                    {open && user && (
                        <div className="absolute right-0 mt-2 w-64 bg-gray-800 rounded-lg shadow-lg p-4 z-50">
                            <p className="font-semibold text-lg">{user.username}</p>
                            <p className="text-sm text-gray-400">
                                Joined: {new Date(user.createdAt).toLocaleDateString()}
                            </p>

                            <button
                                onClick={handleLogout}
                                className="mt-4 w-full bg-red-600 hover:bg-red-700 transition p-2 rounded"
                            >
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
