import { useEffect, useState } from "react"
import { getAvatarSrc, getInitials } from "@/utils/avatar"

interface Props {
    name?: string
    avatarUrl?: string | null
    avatarKey?: string | null
    alt?: string
    className?: string
}

const UserAvatar = ({
    name,
    avatarUrl,
    avatarKey,
    alt = "User avatar",
    className = ""
}: Props) => {
    const [avatarFailed, setAvatarFailed] = useState(false)

    const avatarSrc = getAvatarSrc({ avatarUrl, avatarKey })
    const sizeClassName = className.trim() ? "" : "w-9 h-9 sm:w-10 sm:h-10"

    useEffect(() => {
        Promise.resolve().then(() => setAvatarFailed(false))
    }, [avatarUrl, avatarKey])

    return (
        <div
            className={`${sizeClassName} rounded-full bg-linear-to-br from-slate-700 to-slate-900 text-white overflow-hidden flex items-center justify-center font-semibold shrink-0 ${className}`}
        >
            {avatarSrc && !avatarFailed ? (
                <img
                    src={avatarSrc}
                    alt={alt}
                    onError={() => setAvatarFailed(true)}
                    className="w-full h-full object-cover"
                />
            ) : (
                <span className="select-none">{getInitials(name)}</span>
            )}
        </div>
    )
}

export default UserAvatar
