import { useMemo } from "react"

interface SpritesheetData {
    spritesheetUrl: string
    frameWidth: number
    frameHeight: number
    cols: number
    rows: number
    totalFrames: number
    intervalSec: number
}

interface SpritesheetPickerProps {
    spritesheet: SpritesheetData
    selectedFrameIndex?: number | null
    onSelectFrame: (index: number) => void
    onReset?: () => void
    onSave?: () => void
    saving?: boolean
    saveLabel?: string
}

const formatTime = (seconds: number) => {
    const total = Math.max(0, Math.floor(seconds))
    const mins = Math.floor(total / 60)
    const secs = total % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
}

const SpritesheetPicker = ({
    spritesheet,
    selectedFrameIndex,
    onSelectFrame,
    onReset,
    onSave,
    saving = false,
    saveLabel = "Save Thumbnail"
}: SpritesheetPickerProps) => {
    const maxFrame = Math.max(0, spritesheet.totalFrames - 1)
    const activeIndex =
        selectedFrameIndex === null || selectedFrameIndex === undefined
            ? 0
            : Math.min(Math.max(0, selectedFrameIndex), maxFrame)

    const col = activeIndex % spritesheet.cols
    const row = Math.floor(activeIndex / spritesheet.cols)

    const currentTime = formatTime(activeIndex * spritesheet.intervalSec)
    const totalTime = formatTime(
        Math.max(0, (spritesheet.totalFrames - 1) * spritesheet.intervalSec)
    )

    const previewRatio = useMemo(() => {
        if (!spritesheet.frameWidth || !spritesheet.frameHeight) return 16 / 9
        return spritesheet.frameWidth / spritesheet.frameHeight
    }, [spritesheet.frameHeight, spritesheet.frameWidth])

    return (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 md:p-5 space-y-4">
            <div className="relative rounded-xl overflow-hidden bg-black border border-white/10">
                <div className="flex justify-center p-3 md:p-4">
                    <div
                        className="relative w-full overflow-hidden rounded-xl"
                        style={{
                            aspectRatio: previewRatio,
                            maxWidth: `${Math.max(1, spritesheet.frameWidth)}px`
                        }}
                    >
                        <img
                            src={spritesheet.spritesheetUrl}
                            alt="Spritesheet preview"
                            className="absolute max-w-none select-none pointer-events-none"
                            style={{
                                width: `${Math.max(1, spritesheet.cols) * 100}%`,
                                height: `${Math.max(1, spritesheet.rows) * 100}%`,
                                left: `-${col * 100}%`,
                                top: `-${row * 100}%`,
                                imageRendering: "auto"
                            }}
                        />
                    </div>
                </div>

                <div className="absolute left-0 right-0 bottom-0 h-14 bg-gradient-to-t from-black/75 to-transparent pointer-events-none" />
                <div className="absolute left-3 bottom-2 text-xs text-white/95 font-medium">
                    {currentTime} / {totalTime}
                </div>
            </div>

            <div className="space-y-1">
                <input
                    type="range"
                    min={0}
                    max={maxFrame}
                    value={activeIndex}
                    onChange={(e) => onSelectFrame(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                />
                <div className="flex items-center justify-between text-xs text-gray-300">
                    <span>0:00</span>
                    <span>{totalTime}</span>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3">
                {onReset && (
                    <button
                        type="button"
                        onClick={onReset}
                        className="px-4 py-2 rounded-xl text-sm bg-gray-700 hover:bg-gray-600 transition"
                    >
                        Reset
                    </button>
                )}
                {onSave && (
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={selectedFrameIndex === null || selectedFrameIndex === undefined || saving}
                        className="px-4 py-2 rounded-xl text-sm bg-green-600 hover:bg-green-700 transition disabled:opacity-60"
                    >
                        {saving ? "Saving..." : saveLabel}
                    </button>
                )}
            </div>
        </div>
    )
}

export default SpritesheetPicker
