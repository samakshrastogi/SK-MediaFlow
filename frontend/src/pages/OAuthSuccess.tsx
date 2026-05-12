import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { api } from "@/api/axios"

const OAuthSuccess = () => {

    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { setAuthFromOAuth } = useAuth()

    const [loading, setLoading] = useState(true)

    useEffect(() => {

        const handleOAuth = async () => {

            const token = searchParams.get("token")
            const loginIdParam = searchParams.get("loginId")

            if (!token) {
                navigate("/login", { replace: true })
                return
            }

            try {

                const res = await api.get("/user/me", {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                })

                const user = res.data.data.user

                setAuthFromOAuth(
                    token,
                    user,
                    loginIdParam || null
                )

                navigate("/home", { replace: true })

            } catch (err) {
                navigate("/login", { replace: true })

            } finally {

                setLoading(false)

            }

        }

        handleOAuth()

    }, [searchParams, navigate, setAuthFromOAuth])

    return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white">
            <p className="text-lg animate-pulse">
                {loading ? "Logging you in..." : "Redirecting..."}
            </p>
        </div>
    )
}

export default OAuthSuccess
