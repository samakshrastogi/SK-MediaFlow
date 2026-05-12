import { useState } from "react"

interface SharePopupProps {
    open: boolean
    onClose: () => void
    onShare: (method: string, targetUrl?: string) => Promise<void> | void
    videoUrl: string
}

const SharePopup = ({ open, onClose, onShare, videoUrl }: SharePopupProps) => {
    const [copied, setCopied] = useState(false)

    if (!open) return null

    const encodedUrl = encodeURIComponent(videoUrl)

    const options = [
        {
            label: "WhatsApp",
            method: "WHATSAPP",
            url: `https://wa.me/?text=${encodedUrl}`,
            icon: <WhatsAppIcon />
        },
        {
            label: "Telegram",
            method: "TELEGRAM",
            url: `https://t.me/share/url?url=${encodedUrl}`,
            icon: <TelegramIcon />
        },
        {
            label: "X",
            method: "X",
            url: `https://twitter.com/intent/tweet?url=${encodedUrl}`,
            icon: <XIcon />
        },
        {
            label: "Facebook",
            method: "FACEBOOK",
            url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
            icon: <FacebookIcon />
        },
        {
            label: "LinkedIn",
            method: "LINKEDIN",
            url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
            icon: <LinkedInIcon />
        },
        {
            label: "Email",
            method: "EMAIL",
            url: `mailto:?subject=Check this video&body=${encodedUrl}`,
            icon: <EmailIcon />
        }
    ]

    const handleCopy = async () => {
        await onShare("COPY_LINK")
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/72 px-4 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="w-full max-w-xl rounded-[28px] border border-white/10 bg-gradient-to-br from-[#1c1930] via-[#191726] to-[#12121b] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.42)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-semibold text-white">
                            Share Video
                        </h3>
                        <p className="mt-1 text-sm text-purple-100/45">
                            Send this video to apps and platforms you use most.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/6 text-lg text-gray-300 transition hover:bg-white/10 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                <div className="mt-5 rounded-2xl border border-white/8 bg-black/25 px-4 py-3 text-sm text-purple-100/70">
                    <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-purple-100/35">
                        Share Link
                    </p>
                    <p className="truncate">{videoUrl}</p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {options.map((opt) => (
                        <button
                            key={opt.method}
                            type="button"
                            onClick={() => onShare(opt.method, opt.url)}
                            className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.06] px-4 py-3 text-left transition hover:bg-white/[0.1]"
                        >
                            <div className="shrink-0">{opt.icon}</div>
                            <div>
                                <p className="text-sm font-medium text-white">{opt.label}</p>
                                <p className="text-[11px] text-purple-100/40">Share now</p>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="flex-1 rounded-2xl bg-linear-to-r from-purple-600 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                    >
                        {copied ? "Copied!" : "Copy Link"}
                    </button>

                    {typeof navigator !== "undefined" && "share" in navigator && (
                        <button
                            type="button"
                            onClick={() => onShare("NATIVE")}
                            className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                        >
                            More Options
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

const IconWrap = ({
    children,
    className
}: {
    children: React.ReactNode
    className: string
}) => (
    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${className}`}>
        {children}
    </div>
)

const WhatsAppIcon = () => (
    <IconWrap className="bg-[#25D366] text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M12.04 2C6.56 2 2.11 6.45 2.11 11.93c0 1.76.46 3.48 1.34 5L2 22l5.23-1.37a9.88 9.88 0 0 0 4.81 1.23h.01c5.48 0 9.93-4.45 9.93-9.93S17.52 2 12.04 2Zm5.78 13.97c-.24.67-1.39 1.28-1.92 1.36-.49.07-1.1.1-1.77-.12-.41-.13-.93-.3-1.61-.59-2.83-1.22-4.67-4.08-4.81-4.27-.14-.19-1.15-1.53-1.15-2.91s.72-2.06.97-2.35c.25-.29.55-.36.74-.36.19 0 .38 0 .55.01.18.01.42-.07.66.5.24.58.8 1.98.87 2.12.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.3.38-.43.5-.14.14-.28.29-.12.57.15.29.68 1.11 1.45 1.8 1 .88 1.84 1.15 2.12 1.28.28.14.45.12.62-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.64-.14.26.09 1.63.77 1.9.92.28.14.47.21.54.33.07.12.07.69-.17 1.36Z" />
        </svg>
    </IconWrap>
)

const TelegramIcon = () => (
    <IconWrap className="bg-[#229ED9] text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M21.94 4.66c.29-.12.57.13.48.45l-3.1 14.62c-.06.28-.37.41-.61.26l-4.72-3.48-2.4 2.3c-.18.18-.48.08-.52-.17l-.55-3.7L17.4 8.3c.18-.18-.03-.47-.25-.33L8.4 13.38 4.48 12.1c-.3-.1-.32-.51-.03-.63L21.94 4.66Z" />
        </svg>
    </IconWrap>
)

const XIcon = () => (
    <IconWrap className="bg-black text-white border border-white/10">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M18.9 2H22l-6.77 7.73L23 22h-6.18l-4.84-6.34L6.43 22H3.31l7.24-8.27L1 2h6.33l4.37 5.78L18.9 2Zm-1.09 18h1.72L6.39 3.9H4.54L17.81 20Z" />
        </svg>
    </IconWrap>
)

const FacebookIcon = () => (
    <IconWrap className="bg-[#1877F2] text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M13.5 21v-7h2.35l.35-2.73H13.5V9.53c0-.79.22-1.33 1.35-1.33h1.44V5.76c-.25-.03-1.1-.1-2.1-.1-2.08 0-3.5 1.27-3.5 3.6v2.01H8.35V14h2.34v7h2.81Z" />
        </svg>
    </IconWrap>
)

const LinkedInIcon = () => (
    <IconWrap className="bg-[#0A66C2] text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M6.94 8.5H4V20h2.94V8.5ZM5.47 7.28c.94 0 1.53-.62 1.53-1.4-.02-.8-.59-1.4-1.5-1.4-.92 0-1.53.6-1.53 1.4 0 .78.59 1.4 1.47 1.4h.03ZM20 20h-2.94v-6.02c0-1.51-.54-2.54-1.89-2.54-1.03 0-1.64.69-1.91 1.36-.1.24-.12.57-.12.9V20h-2.94s.04-10.21 0-11.5h2.94v1.63c.39-.6 1.09-1.45 2.66-1.45 1.94 0 3.4 1.27 3.4 4V20Z" />
        </svg>
    </IconWrap>
)

const EmailIcon = () => (
    <IconWrap className="bg-[#EA4335] text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5A1.75 1.75 0 0 1 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25V6.75Zm1.9.25 6.58 5.11a.83.83 0 0 0 1.04 0L19.1 7H4.9Zm14.6 10.5V8.2l-6.06 4.7a2.33 2.33 0 0 1-2.88 0L4.5 8.2v9.3h15Z" />
        </svg>
    </IconWrap>
)

export default SharePopup
