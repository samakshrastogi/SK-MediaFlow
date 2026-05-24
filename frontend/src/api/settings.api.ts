import { api } from "./axios"

interface ApiResponse<T = unknown> {
    success: boolean
    message?: string
    data?: T
}

export interface SettingsData {
    account: {
        name?: string
        email: string
        isVerified: boolean
        connectedMethods: {
            google: boolean
            password: boolean
        }
        canChangeEmail: boolean
        canChangePassword: boolean
    }
    notifications: {
        emailNotificationsEnabled: boolean
        productUpdatesEnabled: boolean
        marketingEmailsEnabled: boolean
    }
    privacy: {
        publicProfileEnabled: boolean
        activityVisibilityEnabled: boolean
    }
    preferences: {
        preferredLanguage: string
        autoplayEnabled: boolean
        subtitlesEnabled: boolean
        subtitleLanguage: string
    }
    security: {
        currentSessionId: string | null
        sessions: Array<{
            id: string
            method: "LOCAL" | "GOOGLE"
            deviceLabel: string
            browser: string
            createdAt: string
            endedAt?: string | null
            revokedAt?: string | null
            isCurrent: boolean
        }>
    }
}

export interface VerificationFlowData {
    email?: string
    otpExpiresAt?: string
    resendCooldownSeconds?: number
    resendCountRemaining?: number
    emailDeliveryMode?: "smtp" | "console"
}

export const getSettings = async (): Promise<ApiResponse<SettingsData>> => {
    const { data } = await api.get("/user/settings")
    return data
}

export const updateSettingsPreferences = async (payload: {
    notifications: SettingsData["notifications"]
    privacy: SettingsData["privacy"]
    preferences: SettingsData["preferences"]
}): Promise<ApiResponse<Partial<SettingsData>>> => {
    const { data } = await api.patch("/user/settings/preferences", payload)
    return data
}

export const updateSettingsEmail = async (
    email: string,
    currentPassword: string
): Promise<ApiResponse<VerificationFlowData>> => {
    const { data } = await api.patch("/user/settings/email", {
        email,
        currentPassword,
    })
    return data
}

export const updateSettingsPassword = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
): Promise<ApiResponse> => {
    const { data } = await api.patch("/user/settings/password", {
        currentPassword,
        newPassword,
        confirmPassword,
    })
    return data
}

export const revokeOtherSessions = async (): Promise<ApiResponse> => {
    const { data } = await api.post("/user/settings/sessions/revoke-others")
    return data
}

export const revokeSession = async (sessionId: string): Promise<ApiResponse> => {
    const { data } = await api.delete(`/user/sessions/${sessionId}`)
    return data
}

export const clearWatchHistory = async (): Promise<ApiResponse> => {
    const { data } = await api.delete("/user/settings/history/watch")
    return data
}

export const deactivateAccount = async (
    currentPassword?: string
): Promise<ApiResponse> => {
    const { data } = await api.post("/user/settings/account/deactivate", {
        currentPassword,
    })
    return data
}

export const deleteAccount = async (
    confirmation: string,
    currentPassword?: string
): Promise<ApiResponse> => {
    const { data } = await api.post("/user/settings/account/delete", {
        confirmation,
        currentPassword,
    })
    return data
}
