import axios, { AxiosHeaders } from "axios"
import { API_URL } from "../config/env"

const getToken = () => {
  return (
    localStorage.getItem("token") ||
    sessionStorage.getItem("token")
  )
}

export const clearStoredAuth = () => {
  localStorage.removeItem("token")
  localStorage.removeItem("user")
  localStorage.removeItem("loginId")
  localStorage.removeItem("sessionStart")
  sessionStorage.removeItem("token")
  sessionStorage.removeItem("user")
  sessionStorage.removeItem("loginId")
  sessionStorage.removeItem("sessionStart")
  setAuthToken(null)
}

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true
})

let inMemoryToken: string | null = null

export const setAuthToken = (token: string | null) => {
  inMemoryToken = token
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

// Initialize once from storage on app boot
setAuthToken(getToken())

api.interceptors.request.use((config) => {
  const token = inMemoryToken || getToken()

  if (token) {
    const headers = new AxiosHeaders(config.headers)
    headers.set("Authorization", `Bearer ${token}`)
    config.headers = headers
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const responseMessage = error?.response?.data?.message

    if (error?.response?.status === 401) {
      clearStoredAuth()
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth:expired"))
      }
    }

    if (responseMessage && typeof responseMessage === "string") {
      error.message = responseMessage
    }

    return Promise.reject(error)
  }
)
