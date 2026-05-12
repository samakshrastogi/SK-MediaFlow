const prefetchedMediaUrls = new Set<string>()

export const prefetchMedia = (url?: string | null) => {
    if (!url || prefetchedMediaUrls.has(url) || typeof document === "undefined") return

    const link = document.createElement("link")
    link.rel = "prefetch"
    link.href = url
    link.crossOrigin = "anonymous"

    document.head.appendChild(link)
    prefetchedMediaUrls.add(url)
}
