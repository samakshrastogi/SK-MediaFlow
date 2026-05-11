import { api } from "./axios"
import { API_URL } from "../config/env"

interface ApiResponse<T = unknown> {
    success: boolean
    message?: string
    data?: T
}

export interface LoginData {
    token: string
    user: {
        id: string
        email: string
        username: string
        name?: string
        avatarKey?: string
        platformAdmin?: boolean
    }
    loginId?: string
}

export const registerUser = async (
    name: string,
    email: string,
    password: string,
    confirmPassword: string
): Promise<ApiResponse> => {
    const { data } = await api.post("/auth/register", {
        name,
        email,
        password,
        confirmPassword,
    })
    return data
}

export const verifyOTP = async (
    email: string,
    otp: string
): Promise<ApiResponse> => {
    const { data } = await api.post("/auth/verify-otp", {
        email,
        otp,
    })
    return data
}

export const loginUser = async (
    email: string,
    password: string,
    remember: boolean
): Promise<ApiResponse<LoginData>> => {
    const { data } = await api.post("/auth/login", {
        email,
        password,
        remember,
    })
    return data
}

export const forgotPassword = async (
    email: string
): Promise<ApiResponse> => {
    const { data } = await api.post("/auth/forgot-password", {
        email,
    })
    return data
}

export const resetPassword = async (
    token: string,
    newPassword: string
): Promise<ApiResponse> => {
    const { data } = await api.post("/auth/reset-password", {
        token,
        newPassword,
    })
    return data
}

export const googleLogin = () => {
    window.location.href = `${API_URL}/auth/google`
}
