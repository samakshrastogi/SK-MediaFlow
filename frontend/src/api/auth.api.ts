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

export interface RegisterData {
    email?: string
    emailDeliveryMode?: "smtp" | "console"
    otpExpiresAt?: string
    resendCooldownSeconds?: number
    resendCountRemaining?: number
}

export interface ForgotPasswordData {
    resetLink?: string
    emailDeliveryMode?: "smtp" | "console"
    cooldownSeconds?: number
}

export const registerUser = async (
    name: string,
    email: string,
    password: string,
    confirmPassword: string
): Promise<ApiResponse<RegisterData>> => {
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

export const resendOTP = async (
    email: string
): Promise<ApiResponse<RegisterData>> => {
    const { data } = await api.post("/auth/resend-otp", {
        email,
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
): Promise<ApiResponse<ForgotPasswordData>> => {
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
