export const formatDurationMs = (durationMs: number) => {
    if (durationMs < 1000) {
        return `${durationMs} ms`
    }

    const seconds = durationMs / 1000
    if (seconds < 60) {
        return `${seconds.toFixed(1)} sec`
    }

    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = (seconds % 60).toFixed(1)
    return `${minutes} min ${remainingSeconds} sec`
}
