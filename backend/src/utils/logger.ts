type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG"
const recentMessages = new Map<string, number>()
const DEDUPE_WINDOW_MS = 10000

const formatHint = (meta?: Record<string, unknown>) => {
    if (!meta) return ""

    const error = meta.error
    if (error instanceof Error && error.message) {
        return ` (${error.message})`
    }

    if (typeof meta.failedReason === "string" && meta.failedReason.trim()) {
        return ` (${meta.failedReason.trim()})`
    }

    return ""
}

const write = (
    level: LogLevel,
    _scope: string,
    message: string,
    meta?: Record<string, unknown>
) => {
    const dedupeKey = `${level}:${message}`
    const now = Date.now()
    const lastSeenAt = recentMessages.get(dedupeKey)

    if (lastSeenAt && now - lastSeenAt < DEDUPE_WINDOW_MS) {
        return
    }

    recentMessages.set(dedupeKey, now)

    const timestamp = new Date().toISOString()
    const prefix =
        level === "ERROR"
            ? "Error: "
            : level === "WARN"
                ? "Warning: "
                : ""
    const line = `[${timestamp}] ${prefix}${message}${formatHint(meta)}`

    if (level === "ERROR") {
        console.error(line)
        return
    }

    if (level === "WARN") {
        console.warn(line)
        return
    }

    console.log(line)
}

export const logger = {
    info: (scope: string, message: string, meta?: Record<string, unknown>) =>
        write("INFO", scope, message, meta),
    warn: (scope: string, message: string, meta?: Record<string, unknown>) =>
        write("WARN", scope, message, meta),
    error: (scope: string, message: string, meta?: Record<string, unknown>) =>
        write("ERROR", scope, message, meta),
    debug: (scope: string, message: string, meta?: Record<string, unknown>) =>
        write("DEBUG", scope, message, meta)
}
