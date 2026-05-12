const pageCache = new Map<string, { value: unknown; expiresAt: number }>()

export const getCachedPageData = <T>(key: string) => {
    const entry = pageCache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
        pageCache.delete(key)
        return null
    }

    return entry.value as T
}

export const setCachedPageData = <T>(key: string, value: T, ttlMs = 60000) => {
    pageCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
    })
}
