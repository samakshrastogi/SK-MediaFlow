import { useEffect, useState, useCallback } from "react"
import axios from "axios"

type Props = {
    videoId: string
}
type AISuggestionData = {
    title?: string
    description?: string
    keywords?: string[]
    tags?: string[]
}

export default function AISuggestions({ videoId }: Props) {
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<AISuggestionData | null>(null)
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")

    const fetchSuggestions = useCallback(async () => {
        try {
            const res = await axios.get(`/api/ai/video/${videoId}`)
            setData(res.data)
            setTitle(res.data.title || "")
            setDescription(res.data.description || "")
        } catch (err) {
        } finally {
            setLoading(false)
        }
    }, [videoId])

    useEffect(() => {
        fetchSuggestions()
    }, [fetchSuggestions])

    const applySuggestion = async () => {
        try {
            await axios.post(`/api/ai/video/${videoId}/apply`)
            alert("AI suggestion applied")
        } catch (err) {
        }
    }

    if (loading) return <p>Generating AI metadata...</p>

    return (
        <div className="ai-box">
            <h2>AI Suggestions</h2>

            <div>
                <label htmlFor="title">Title</label>
                <input
                    id="title"
                    placeholder="Enter title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
            </div>

            <div>
                <label htmlFor="description">Description</label>
                <textarea
                    id="description"
                    placeholder="Enter description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            <div>
                <label>Keywords</label>
                <div className="tags">
                    {data?.keywords?.map((k: string) => (
                        <span key={k}>{k}</span>
                    ))}
                </div>
            </div>

            <div>
                <label>Tags</label>
                <div className="tags">
                    {data?.tags?.map((t: string) => (
                        <span key={t}>{t}</span>
                    ))}
                </div>
            </div>

            <button onClick={applySuggestion}>
                Use AI Suggestion
            </button>
        </div>
    )
}
