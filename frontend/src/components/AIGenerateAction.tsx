import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, Sparkles, X } from "lucide-react"
import { api } from "@/api/axios"

interface Props {
    publicId?: string
    title?: string
    className?: string
    includeThumbnail?: boolean
    selected?: boolean
    onConfirm?: () => void | Promise<void>
    onStarted?: () => void
}

const AIGenerateAction = ({
    publicId,
    title,
    className = "",
    includeThumbnail = true,
    selected = false,
    onConfirm,
    onStarted
}: Props) => {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState("")

    const startGeneration = async () => {
        try {
            setLoading(true)
            setMessage("")
            if (!publicId) {
                await onConfirm?.()
                setMessage("AI generation is selected. It will start after the video upload finishes.")
                onStarted?.()
                return
            }

            const res = await api.post(`/video/${publicId}/generate-ai-assets`, {
                ai: true,
                thumbnail: includeThumbnail,
                spritesheet: true
            })
            const data = res.data?.data
            if (data?.aiQueued || data?.thumbnailQueued || data?.spritesheetQueued) {
                setMessage("AI generation started. Title, description, thumbnail, and spritesheet updates will appear after processing finishes.")
            } else {
                setMessage("AI generation was already requested for this video. Failed jobs are not retried.")
            }
            onStarted?.()
        } catch (error: any) {
            setMessage(error?.message || "Unable to start generation for this video.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <button
                type="button"
                aria-label="Generate AI"
                title="Generate AI"
                onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setOpen(true)
                }}
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-md transition ${selected ? "border-cyan-300/40 bg-cyan-400 text-slate-950" : "border-white/20 bg-black/70 text-cyan-100 hover:bg-cyan-400 hover:text-slate-950"} ${className}`}
            >
                <Sparkles size={16} />
                <span>{selected ? "AI Selected" : "Generate AI"}</span>
            </button>

            <AnimatePresence>
                {open ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4 backdrop-blur-md"
                        onClick={(event) => {
                            event.stopPropagation()
                            setOpen(false)
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 18, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.98 }}
                            className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0b1020] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/12 text-cyan-100">
                                        <Sparkles size={18} />
                                    </div>
                                    <h2 className="text-lg font-semibold">Generate AI</h2>
                                    <p className="mt-2 text-sm leading-6 text-slate-300">
                                        This will analyze {title?.trim() || "this video"} and create an AI title, description, keywords, transcript data, {includeThumbnail ? "an AI thumbnail, " : ""}and a video-frame spritesheet. It runs once and failed jobs are not retried.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    aria-label="Close"
                                    onClick={() => setOpen(false)}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-slate-200 transition hover:bg-white/12"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {message ? (
                                <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-200">
                                    {message}
                                </p>
                            ) : null}

                            <div className="mt-5 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="rounded-xl border border-white/10 bg-white/8 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/14"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={loading || (!publicId && !onConfirm)}
                                    onClick={startGeneration}
                                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                                    Generate
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </>
    )
}

export default AIGenerateAction
