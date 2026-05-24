import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import {
    Bell,
    CirclePlay,
    Eye,
    Gauge,
    History,
    Laptop2,
    MonitorSmartphone,
    MoonStar,
    Shield,
    Smartphone,
    Trash2,
    Tv,
    UserCircle2,
    Wand2,
} from "lucide-react"

import AppLayout from "@/layouts/AppLayout"
import { resendOTP } from "@/api/auth.api"
import {
    clearWatchHistory,
    deactivateAccount,
    deleteAccount,
    getSettings,
    revokeOtherSessions,
    revokeSession,
    type SettingsData,
    updateSettingsEmail,
    updateSettingsPassword,
    updateSettingsPreferences,
} from "@/api/settings.api"
import { useAuth } from "@/context/AuthContext"

const getSearchHistoryKey = (userId?: string) => `search-history:${userId || "guest"}`

const languageOptions = [
    { value: "en", label: "English" },
    { value: "hi", label: "Hindi" },
]

const sectionItems = [
    { id: "account", label: "Account", icon: UserCircle2 },
    { id: "security", label: "Security", icon: Shield },
    { id: "preferences", label: "Preferences", icon: Wand2 },
    { id: "history", label: "History", icon: History },
    { id: "danger", label: "Danger Zone", icon: Trash2 },
] as const

const premiumEase = [0.22, 1, 0.36, 1] as const

const pageTransition: Variants = {
    hidden: { opacity: 0, y: 28 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.75,
            ease: premiumEase,
            staggerChildren: 0.08,
        },
    },
}

const cardTransition: Variants = {
    hidden: { opacity: 0, y: 30, scale: 0.98 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
            duration: 0.7,
            ease: premiumEase,
        },
    },
}

const SettingsPage = () => {
    const navigate = useNavigate()
    const { logout, user } = useAuth()

    const [settings, setSettings] = useState<SettingsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [savingPreferences, setSavingPreferences] = useState(false)
    const [changingEmail, setChangingEmail] = useState(false)
    const [changingPassword, setChangingPassword] = useState(false)
    const [processingDanger, setProcessingDanger] = useState(false)
    const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [activeSection, setActiveSection] =
        useState<(typeof sectionItems)[number]["id"]>("account")
    const [confirmAction, setConfirmAction] = useState<null | "deactivate" | "delete">(null)

    const [email, setEmail] = useState("")
    const [emailPassword, setEmailPassword] = useState("")
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [dangerPassword, setDangerPassword] = useState("")
    const [deleteConfirmation, setDeleteConfirmation] = useState("")

    const [notifications, setNotifications] = useState<SettingsData["notifications"]>({
        emailNotificationsEnabled: true,
        productUpdatesEnabled: true,
        marketingEmailsEnabled: false,
    })
    const [privacy, setPrivacy] = useState<SettingsData["privacy"]>({
        publicProfileEnabled: true,
        activityVisibilityEnabled: false,
    })
    const [preferences, setPreferences] = useState<SettingsData["preferences"]>({
        preferredLanguage: "en",
        autoplayEnabled: true,
        subtitlesEnabled: false,
        subtitleLanguage: "en",
    })

    const load = async () => {
        try {
            setLoading(true)
            setError(null)
            const res = await getSettings()
            const data = res.data
            if (!data) throw new Error(res.message || "Failed to load settings.")

            setSettings(data)
            setEmail(data.account.email)
            setNotifications(data.notifications)
            setPrivacy(data.privacy)
            setPreferences(data.preferences)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load settings.")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load()
    }, [])

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

                if (visible?.target?.id) {
                    setActiveSection(visible.target.id as (typeof sectionItems)[number]["id"])
                }
            },
            {
                rootMargin: "-90px 0px -55% 0px",
                threshold: [0.18, 0.38, 0.62],
            }
        )

        sectionItems.forEach((item) => {
            const el = document.getElementById(item.id)
            if (el) observer.observe(el)
        })

        return () => observer.disconnect()
    }, [loading, settings])

    const passwordStrength = useMemo(() => {
        const checks = [
            newPassword.length >= 8,
            /[A-Z]/.test(newPassword),
            /[a-z]/.test(newPassword),
            /\d/.test(newPassword),
            /[^A-Za-z0-9]/.test(newPassword),
        ]
        const score = checks.filter(Boolean).length

        if (!newPassword) return { label: "Idle", color: "text-slate-400", score }
        if (score <= 2) return { label: "Weak", color: "text-rose-300", score }
        if (score <= 4) return { label: "Stable", color: "text-amber-300", score }
        return { label: "Premium", color: "text-emerald-300", score }
    }, [newPassword])

    const isGoogleOnlyAccount = Boolean(
        settings?.account.connectedMethods.google && !settings?.account.connectedMethods.password
    )

    const hasPreferenceChanges = useMemo(() => {
        if (!settings) return false

        return (
            JSON.stringify(notifications) !== JSON.stringify(settings.notifications) ||
            JSON.stringify(privacy) !== JSON.stringify(settings.privacy) ||
            JSON.stringify(preferences) !== JSON.stringify(settings.preferences)
        )
    }, [notifications, preferences, privacy, settings])

    const accountSummary = useMemo(() => {
        if (!settings) return []

        const connectedMethods = [
            settings.account.connectedMethods.password ? "Password" : null,
            settings.account.connectedMethods.google ? "Google" : null,
        ].filter(Boolean)

        return [
            { label: "Verification", value: settings.account.isVerified ? "Verified" : "Pending" },
            { label: "Sign-in", value: connectedMethods.join(", ") || "None" },
            {
                label: "Currently active",
                value: `${settings.security.sessions.filter((session) => !session.revokedAt).length} sessions`,
            },
            {
                label: "Last login",
                value: settings.security.sessions[0]
                    ? new Date(settings.security.sessions[0].createdAt).toLocaleString()
                    : "No activity",
            },
        ]
    }, [settings])

    const featuredDevices = useMemo(() => {
        if (!settings) return []

        const deviceIcons = [Tv, Laptop2, Smartphone]
        const deviceLabels = ["Living Room TV", "Creator Laptop", "Pocket Mobile"]

        return settings.security.sessions.slice(0, 3).map((session, index) => ({
            ...session,
            uiLabel: deviceLabels[index] || session.deviceLabel,
            icon: deviceIcons[index] || MonitorSmartphone,
        }))
    }, [settings])

    const activityTimeline = useMemo(() => {
        if (!settings) return []

        const lastSession = settings.security.sessions[0]

        return [
            {
                title: "Last login",
                detail: lastSession
                    ? `${lastSession.deviceLabel} • ${new Date(lastSession.createdAt).toLocaleString()}`
                    : "No recent session detected",
                accent: "from-cyan-400 to-blue-500",
            },
            {
                title: "Last watched",
                detail: "SK-MediaFlow originals stream progress synced across devices.",
                accent: "from-fuchsia-400 to-violet-500",
            },
            {
                title: "Currently active",
                detail: `${settings.security.sessions.filter((session) => !session.revokedAt).length} session indicators are live.`,
                accent: "from-emerald-400 to-teal-500",
            },
        ]
    }, [settings])

    const updateMessage = (nextMessage: string | null, nextError: string | null = null) => {
        setMessage(nextMessage)
        setError(nextError)
    }

    const handleSavePreferences = async () => {
        try {
            setSavingPreferences(true)
            updateMessage(null, null)

            const res = await updateSettingsPreferences({
                notifications,
                privacy,
                preferences,
            })

            setSettings((prev) =>
                prev
                    ? {
                          ...prev,
                          notifications,
                          privacy,
                          preferences,
                      }
                    : prev
            )

            updateMessage(res.message || "Settings updated.")
        } catch (err) {
            updateMessage(null, err instanceof Error ? err.message : "Failed to update settings.")
        } finally {
            setSavingPreferences(false)
        }
    }

    const handleEmailChange = async () => {
        try {
            setChangingEmail(true)
            updateMessage(null, null)

            const res = await updateSettingsEmail(email, emailPassword)
            await logout()
            navigate("/login", {
                replace: true,
                state: {
                    verificationFlow: {
                        email: res.data?.email ?? email.trim().toLowerCase(),
                        otpExpiresAt: res.data?.otpExpiresAt,
                        resendCooldownSeconds: res.data?.resendCooldownSeconds,
                        resendCountRemaining: res.data?.resendCountRemaining,
                        message: res.message || "Verify your new email to continue.",
                    },
                },
            })
        } catch (err) {
            updateMessage(null, err instanceof Error ? err.message : "Failed to update email.")
        } finally {
            setChangingEmail(false)
        }
    }

    const handlePasswordChange = async () => {
        try {
            setChangingPassword(true)
            updateMessage(null, null)

            const res = await updateSettingsPassword(currentPassword, newPassword, confirmPassword)

            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
            updateMessage(res.message || "Password updated.")
        } catch (err) {
            updateMessage(null, err instanceof Error ? err.message : "Failed to update password.")
        } finally {
            setChangingPassword(false)
        }
    }

    const handleResendVerification = async () => {
        if (!settings) return

        try {
            updateMessage(null, null)
            const res = await resendOTP(settings.account.email)
            await logout()
            navigate("/login", {
                replace: true,
                state: {
                    verificationFlow: {
                        email: res.data?.email ?? settings.account.email,
                        otpExpiresAt: res.data?.otpExpiresAt,
                        resendCooldownSeconds: res.data?.resendCooldownSeconds,
                        resendCountRemaining: res.data?.resendCountRemaining,
                        message: res.message || "Verify your email to continue.",
                    },
                },
            })
        } catch (err) {
            updateMessage(null, err instanceof Error ? err.message : "Failed to resend verification email.")
        }
    }

    const handleRevokeSession = async (sessionId: string) => {
        try {
            setRevokingSessionId(sessionId)
            updateMessage(null, null)
            const res = await revokeSession(sessionId)

            setSettings((prev) =>
                prev
                    ? {
                          ...prev,
                          security: {
                              ...prev.security,
                              sessions: prev.security.sessions.map((session) =>
                                  session.id === sessionId
                                      ? { ...session, revokedAt: new Date().toISOString() }
                                      : session
                              ),
                          },
                      }
                    : prev
            )

            updateMessage(res.message || "Device signed out.")
        } catch (err) {
            updateMessage(null, err instanceof Error ? err.message : "Failed to sign out device.")
        } finally {
            setRevokingSessionId(null)
        }
    }

    const handleRevokeOthers = async () => {
        try {
            updateMessage(null, null)
            const res = await revokeOtherSessions()

            setSettings((prev) =>
                prev
                    ? {
                          ...prev,
                          security: {
                              ...prev.security,
                              sessions: prev.security.sessions.map((session) =>
                                  session.isCurrent ? session : { ...session, revokedAt: new Date().toISOString() }
                              ),
                          },
                      }
                    : prev
            )

            updateMessage(res.message || "Other devices signed out.")
        } catch (err) {
            updateMessage(null, err instanceof Error ? err.message : "Failed to sign out other devices.")
        }
    }

    const handleClearWatchHistory = async () => {
        try {
            updateMessage(null, null)
            const res = await clearWatchHistory()
            updateMessage(res.message || "Watch history cleared.")
        } catch (err) {
            updateMessage(null, err instanceof Error ? err.message : "Failed to clear watch history.")
        }
    }

    const handleClearSearchHistory = () => {
        localStorage.removeItem(getSearchHistoryKey(user?.id))
        updateMessage("Search history cleared.")
    }

    const handleDeactivate = async () => {
        try {
            setProcessingDanger(true)
            updateMessage(null, null)
            await deactivateAccount(dangerPassword || undefined)
            await logout()
            navigate("/login", { replace: true })
        } catch (err) {
            updateMessage(null, err instanceof Error ? err.message : "Failed to deactivate account.")
        } finally {
            setProcessingDanger(false)
        }
    }

    const handleDelete = async () => {
        try {
            setProcessingDanger(true)
            updateMessage(null, null)
            await deleteAccount(deleteConfirmation, dangerPassword || undefined)
            await logout()
            navigate("/login", { replace: true })
        } catch (err) {
            updateMessage(null, err instanceof Error ? err.message : "Failed to delete account.")
        } finally {
            setProcessingDanger(false)
        }
    }

    const executeConfirmedAction = async () => {
        if (confirmAction === "deactivate") {
            await handleDeactivate()
        }

        if (confirmAction === "delete") {
            await handleDelete()
        }
    }

    if (loading) {
        return (
            <AppLayout>
                <div className="h-52 animate-pulse rounded-[32px] border border-white/10 bg-white/[0.04]" />
            </AppLayout>
        )
    }

    if (!settings) {
        return (
            <AppLayout>
                <div className="rounded-[28px] border border-rose-400/22 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
                    {error || "Failed to load settings."}
                </div>
            </AppLayout>
        )
    }

    return (
        <AppLayout>
            <style>{`
                @keyframes skfxMesh {
                    0% { transform: translate3d(-4%, -3%, 0) scale(1); opacity: 0.7; }
                    50% { transform: translate3d(3%, 2%, 0) scale(1.08); opacity: 1; }
                    100% { transform: translate3d(-4%, -3%, 0) scale(1); opacity: 0.7; }
                }
                @keyframes skfxOrb {
                    0% { transform: translate3d(0,0,0) scale(1); }
                    50% { transform: translate3d(0,-18px,0) scale(1.08); }
                    100% { transform: translate3d(0,0,0) scale(1); }
                }
                @keyframes skfxShine {
                    0% { transform: translateX(-140%) skewX(-18deg); }
                    100% { transform: translateX(240%) skewX(-18deg); }
                }
                @keyframes skfxPulse {
                    0%,100% { opacity: 0.55; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.25); }
                }
                @keyframes skfxFloat {
                    0%,100% { transform: translateY(0px); }
                    50% { transform: translateY(-8px); }
                }
                @keyframes skfxGlow {
                    0%,100% { opacity: 0.38; }
                    50% { opacity: 0.8; }
                }
                @keyframes skfxSubtitle {
                    0% { opacity: 0.45; filter: blur(0px); }
                    50% { opacity: 0.8; filter: blur(0.4px); }
                    100% { opacity: 0.45; filter: blur(0px); }
                }
            `}</style>

            <motion.div
                className="relative overflow-hidden rounded-[30px] border border-white/8 bg-[#070b15] pb-5 shadow-[0_30px_90px_rgba(0,0,0,0.4)]"
                variants={pageTransition}
                initial="hidden"
                animate="visible"
            >
                <CinematicBackdrop />

                <div className="relative z-10 space-y-4 px-3 pt-3 sm:px-5 sm:pt-5">
                    <motion.section variants={cardTransition}>
                        <HeroPanel
                            userEmail={settings.account.email}
                            verified={settings.account.isVerified}
                            summary={accountSummary}
                            onBack={() => navigate("/profile")}
                            onSave={handleSavePreferences}
                            saving={savingPreferences}
                            hasChanges={hasPreferenceChanges}
                        />
                    </motion.section>

                    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                        <motion.aside variants={cardTransition} className="xl:sticky xl:top-24 xl:self-start">
                            <SidebarPanel
                                activeSection={activeSection}
                                onSelect={(sectionId) => {
                                    setActiveSection(sectionId)
                                    document.getElementById(sectionId)?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "start",
                                    })
                                }}
                            />
                        </motion.aside>

                        <motion.div variants={pageTransition} className="space-y-4">
                            <AnimatePresence>
                                {error && (
                                    <Message key="error" tone="error">
                                        {error}
                                    </Message>
                                )}
                                {message && (
                                    <Message key="success" tone="success">
                                        {message}
                                    </Message>
                                )}
                            </AnimatePresence>

                            <GlassTiltCard
                                id="account"
                                title="Account Matrix"
                                subtitle="Identity, verification, and premium sign-in control."
                                icon={UserCircle2}
                                variants={cardTransition}
                            >
                                <div className="grid gap-3 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
                                    <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
                                        <InfoChip label="Primary email" value={settings.account.email} />
                                        <InfoChip
                                            label="Verification"
                                            value={settings.account.isVerified ? "Signal verified" : "Verification pending"}
                                            tone={settings.account.isVerified ? "success" : "warning"}
                                        />
                                        <InfoChip
                                            label="Connected methods"
                                            value={[
                                                settings.account.connectedMethods.password ? "Password" : null,
                                                settings.account.connectedMethods.google ? "Google" : null,
                                            ].filter(Boolean).join(" + ") || "None"}
                                        />
                                    </div>

                                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-xl">
                                        {isGoogleOnlyAccount ? (
                                            <div className="rounded-xl border border-cyan-300/14 bg-cyan-400/10 p-3.5">
                                                <p className="text-sm font-semibold text-white">Google sign-in manages this account</p>
                                                <p className="mt-1 text-xs leading-6 text-slate-300/78">
                                                    Email and password updates are hidden for Google SSO accounts because authentication is handled through Google.
                                                </p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_210px_auto]">
                                                    <FloatingField
                                                        label="New email"
                                                        value={email}
                                                        onChange={setEmail}
                                                    />
                                                    <FloatingField
                                                        label="Current password"
                                                        value={emailPassword}
                                                        onChange={setEmailPassword}
                                                        type="password"
                                                        disabled={!settings.account.canChangeEmail}
                                                    />
                                                    <ShineButton
                                                        onClick={handleEmailChange}
                                                        disabled={changingEmail || !settings.account.canChangeEmail}
                                                        className="min-h-12"
                                                    >
                                                        {changingEmail ? "Updating..." : "Update"}
                                                    </ShineButton>
                                                </div>

                                                {!settings.account.isVerified && (
                                                    <motion.button
                                                        whileHover={{ x: 2 }}
                                                        whileTap={{ scale: 0.995 }}
                                                        type="button"
                                                        onClick={handleResendVerification}
                                                        className="mt-2.5 rounded-xl border border-amber-300/20 bg-amber-400/12 px-3.5 py-2 text-sm font-medium text-amber-100 shadow-[0_10px_30px_rgba(251,191,36,0.12)]"
                                                    >
                                                        Resend verification email
                                                    </motion.button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </GlassTiltCard>

                            <GlassTiltCard
                                id="security"
                                title="Security Bay"
                                subtitle="Password hardening, live sessions, and streaming-device access."
                                icon={Shield}
                                variants={cardTransition}
                            >
                                <div className="grid gap-3 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-xl">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <div>
                                                <h3 className="text-sm font-semibold text-white">Password Shield</h3>
                                                <p className="mt-1 text-xs text-slate-400">
                                                    Other devices are pushed out after a successful change.
                                                </p>
                                            </div>
                                            {!isGoogleOnlyAccount ? (
                                                <StrengthMeter score={passwordStrength.score} label={passwordStrength.label} color={passwordStrength.color} />
                                            ) : null}
                                        </div>

                                        {isGoogleOnlyAccount ? (
                                            <div className="rounded-xl border border-cyan-300/14 bg-cyan-400/10 p-3.5">
                                                <p className="text-sm font-semibold text-white">Password controls are unavailable</p>
                                                <p className="mt-1 text-xs leading-6 text-slate-300/78">
                                                    This account signs in with Google SSO, so password change fields are hidden here.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="grid gap-2.5">
                                                <FloatingField
                                                    label="Current password"
                                                    value={currentPassword}
                                                    onChange={setCurrentPassword}
                                                    type="password"
                                                    disabled={!settings.account.canChangePassword}
                                                />
                                                <div className="grid gap-2.5 md:grid-cols-2">
                                                    <FloatingField
                                                        label="New password"
                                                        value={newPassword}
                                                        onChange={setNewPassword}
                                                        type="password"
                                                        disabled={!settings.account.canChangePassword}
                                                    />
                                                    <FloatingField
                                                        label="Confirm new password"
                                                        value={confirmPassword}
                                                        onChange={setConfirmPassword}
                                                        type="password"
                                                        disabled={!settings.account.canChangePassword}
                                                    />
                                                </div>
                                                <ShineButton
                                                    onClick={handlePasswordChange}
                                                    disabled={changingPassword || !settings.account.canChangePassword}
                                                >
                                                    {changingPassword ? "Updating..." : "Reinforce Password"}
                                                </ShineButton>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-xl">
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="text-sm font-semibold text-white">Live Device Deck</h3>
                                                    <p className="mt-1 text-xs text-slate-400">
                                                        Rich session cards inspired by premium streaming devices.
                                                    </p>
                                                </div>
                                                <ShineButton
                                                    onClick={handleRevokeOthers}
                                                    variant="ghost"
                                                    className="min-h-11 px-4 text-xs"
                                                >
                                                    Sign out others
                                                </ShineButton>
                                            </div>

                                            <div className="grid gap-2.5 lg:grid-cols-3">
                                                {featuredDevices.map((device, index) => (
                                                    <DeviceCard
                                                        key={device.id}
                                                        session={device}
                                                        index={index}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-xl">
                                            <div className="space-y-2">
                                                {settings.security.sessions.map((session) => (
                                                    <motion.div
                                                        key={session.id}
                                                        whileHover={{ y: -1 }}
                                                        className="rounded-xl border border-white/10 bg-black/18 px-3 py-2.5"
                                                    >
                                                        <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="relative flex h-2.5 w-2.5">
                                                                        <span className="absolute inset-0 rounded-full bg-emerald-400" style={{ animation: "skfxPulse 2s ease-in-out infinite" }} />
                                                                    </span>
                                                                    <p className="truncate text-sm font-medium text-white">
                                                                        {session.deviceLabel}
                                                                    </p>
                                                                    {session.isCurrent && (
                                                                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                                                                            Current
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="mt-0.5 text-xs text-slate-400">
                                                                    {session.method === "GOOGLE" ? "Google" : "Email and password"} • {new Date(session.createdAt).toLocaleString()}
                                                                </p>
                                                                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                                                                    {session.revokedAt ? "Signed out" : session.browser}
                                                                </p>
                                                            </div>

                                                            {!session.isCurrent && !session.revokedAt && (
                                                                <ShineButton
                                                                    onClick={() => handleRevokeSession(session.id)}
                                                                    disabled={revokingSessionId === session.id}
                                                                    variant="danger"
                                                                    className="min-h-10 px-3.5 text-xs"
                                                                >
                                                                    {revokingSessionId === session.id ? "Signing out..." : "Sign out"}
                                                                </ShineButton>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </GlassTiltCard>

                            <GlassTiltCard
                                id="preferences"
                                title="Streaming Preferences"
                                subtitle="Glassmorphism controls for platform alerts, visibility, and playback behavior."
                                icon={Wand2}
                                variants={cardTransition}
                            >
                                <div className="grid gap-3 xl:grid-cols-3">
                                    <PreferenceGroup title="Notifications" icon={Bell}>
                                        <ToggleRow
                                            label="Account emails"
                                            detail="Priority platform alerts and account messaging."
                                            checked={notifications.emailNotificationsEnabled}
                                            onChange={(checked) =>
                                                setNotifications((prev) => ({ ...prev, emailNotificationsEnabled: checked }))
                                            }
                                        />
                                        <ToggleRow
                                            label="Product updates"
                                            detail="Feature drops and new premium platform releases."
                                            checked={notifications.productUpdatesEnabled}
                                            onChange={(checked) =>
                                                setNotifications((prev) => ({ ...prev, productUpdatesEnabled: checked }))
                                            }
                                        />
                                        <ToggleRow
                                            label="Marketing emails"
                                            detail="Promotions, picks, and premium SK-MediaFlow highlights."
                                            checked={notifications.marketingEmailsEnabled}
                                            onChange={(checked) =>
                                                setNotifications((prev) => ({ ...prev, marketingEmailsEnabled: checked }))
                                            }
                                        />
                                    </PreferenceGroup>

                                    <PreferenceGroup title="Privacy" icon={Eye}>
                                        <ToggleRow
                                            label="Public profile"
                                            detail="Keep your creator profile visible across the platform."
                                            checked={privacy.publicProfileEnabled}
                                            onChange={(checked) =>
                                                setPrivacy((prev) => ({ ...prev, publicProfileEnabled: checked }))
                                            }
                                        />
                                        <ToggleRow
                                            label="Show activity"
                                            detail="Display richer activity presence where supported."
                                            checked={privacy.activityVisibilityEnabled}
                                            onChange={(checked) =>
                                                setPrivacy((prev) => ({ ...prev, activityVisibilityEnabled: checked }))
                                            }
                                        />
                                    </PreferenceGroup>

                                    <PreferenceGroup title="Playback" icon={Gauge}>
                                        <SelectField
                                            label="App language"
                                            value={preferences.preferredLanguage}
                                            onChange={(value) =>
                                                setPreferences((prev) => ({ ...prev, preferredLanguage: value }))
                                            }
                                            options={languageOptions}
                                        />
                                        <ToggleRow
                                            label="Autoplay"
                                            detail="Move straight into the next title with no interruption."
                                            checked={preferences.autoplayEnabled}
                                            onChange={(checked) =>
                                                setPreferences((prev) => ({ ...prev, autoplayEnabled: checked }))
                                            }
                                        />
                                        <ToggleRow
                                            label="Subtitles by default"
                                            detail="Enable cinematic captions as soon as playback starts."
                                            checked={preferences.subtitlesEnabled}
                                            onChange={(checked) =>
                                                setPreferences((prev) => ({ ...prev, subtitlesEnabled: checked }))
                                            }
                                        />
                                        <SelectField
                                            label="Subtitle language"
                                            value={preferences.subtitleLanguage}
                                            onChange={(value) =>
                                                setPreferences((prev) => ({ ...prev, subtitleLanguage: value }))
                                            }
                                            options={languageOptions}
                                        />
                                    </PreferenceGroup>
                                </div>
                            </GlassTiltCard>

                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                                <GlassTiltCard
                                    id="history"
                                    title="Live Platform Activity"
                                    subtitle="Recent motion and streaming-inspired account signals."
                                    icon={CirclePlay}
                                    variants={cardTransition}
                                >
                                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                                        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
                                            {activityTimeline.map((item) => (
                                                <motion.div
                                                    key={item.title}
                                                    whileHover={{ x: 2 }}
                                                    className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3"
                                                >
                                                    <div className={`absolute left-0 top-0 h-full w-1 bg-gradient-to-b ${item.accent}`} />
                                                    <p className="text-sm font-semibold text-white">{item.title}</p>
                                                    <p className="mt-0.5 text-xs leading-5 text-slate-400">{item.detail}</p>
                                                </motion.div>
                                            ))}
                                        </div>

                                        <div className="grid gap-2.5">
                                            <ActionCluster
                                                title="Clear watch history"
                                                description="Remove watched-video history from your account."
                                                buttonLabel="Clear"
                                                onClick={handleClearWatchHistory}
                                            />
                                            <ActionCluster
                                                title="Clear search history"
                                                description="Remove recent searches saved in this browser."
                                                buttonLabel="Clear"
                                                onClick={handleClearSearchHistory}
                                            />
                                        </div>
                                    </div>
                                </GlassTiltCard>

                                <GlassTiltCard
                                    id="danger"
                                    title="Danger Zone"
                                    subtitle="High-impact actions with deliberate confirmation."
                                    icon={MoonStar}
                                    danger
                                    variants={cardTransition}
                                >
                                    <div className="space-y-3">
                                        <FloatingField
                                            label="Current password if your account uses one"
                                            value={dangerPassword}
                                            onChange={setDangerPassword}
                                            type="password"
                                        />

                                        <div className="grid gap-3">
                                            <DangerCluster
                                                title="Deactivate account"
                                                description="Disable account access immediately and leave your cinematic workspace offline."
                                                buttonLabel="Deactivate"
                                                onClick={() => setConfirmAction("deactivate")}
                                                disabled={processingDanger}
                                            />

                                            <div className="rounded-[22px] border border-rose-400/16 bg-rose-500/10 p-3.5 backdrop-blur-xl">
                                                <p className="text-sm font-semibold text-rose-100">Delete account</p>
                                                <p className="mt-1 text-xs leading-5 text-rose-100/72">
                                                    Type DELETE to permanently remove this account and its session access.
                                                </p>
                                                <div className="mt-2.5">
                                                    <FloatingField
                                                        label='Type "DELETE"'
                                                        value={deleteConfirmation}
                                                        onChange={setDeleteConfirmation}
                                                    />
                                                </div>
                                                <ShineButton
                                                    onClick={() => setConfirmAction("delete")}
                                                    disabled={processingDanger}
                                                    variant="danger"
                                                    className="mt-2.5 w-full"
                                                >
                                                    Delete Account
                                                </ShineButton>
                                            </div>
                                        </div>
                                    </div>
                                </GlassTiltCard>
                            </div>
                        </motion.div>
                    </div>
                </div>

                <AnimatePresence>
                    {hasPreferenceChanges && (
                        <motion.div
                            initial={{ opacity: 0, y: 22 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 22 }}
                            className="fixed inset-x-0 bottom-20 z-40 px-4 md:bottom-6 md:left-auto md:right-6 md:w-auto md:max-w-lg"
                        >
                            <div className="overflow-hidden rounded-[24px] border border-white/12 bg-[linear-gradient(145deg,rgba(17,30,59,0.94),rgba(11,17,34,0.96))] p-3.5 shadow-[0_20px_64px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
                                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(192,132,252,0.12),transparent_28%)]" />
                                <div className="relative flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-white">Unsaved preference changes</p>
                                        <p className="mt-1 text-xs text-slate-400">
                                            Your streaming environment changed. Save the cinematic profile tuning.
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <ShineButton
                                            onClick={() => {
                                                setNotifications(settings.notifications)
                                                setPrivacy(settings.privacy)
                                                setPreferences(settings.preferences)
                                            }}
                                            variant="ghost"
                                            className="px-4 text-sm"
                                        >
                                            Reset
                                        </ShineButton>
                                        <ShineButton
                                            onClick={handleSavePreferences}
                                            disabled={savingPreferences}
                                            className="px-4 text-sm"
                                        >
                                            {savingPreferences ? "Saving..." : "Save"}
                                        </ShineButton>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {confirmAction && (
                        <ConfirmModal
                            title={confirmAction === "deactivate" ? "Deactivate account?" : "Delete account?"}
                            description={
                                confirmAction === "deactivate"
                                    ? "This will immediately sign you out and disable account access until you reactivate later."
                                    : "This permanently removes your account access. This action cannot be undone."
                            }
                            buttonLabel={confirmAction === "deactivate" ? "Deactivate" : "Delete"}
                            loading={processingDanger}
                            onCancel={() => setConfirmAction(null)}
                            onConfirm={async () => {
                                await executeConfirmedAction()
                                setConfirmAction(null)
                            }}
                        />
                    )}
                </AnimatePresence>
            </motion.div>
        </AppLayout>
    )
}

const CinematicBackdrop = () => (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
            className="absolute -left-[12%] top-[-18%] h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.22),transparent_58%)] blur-3xl"
            style={{ animation: "skfxOrb 16s ease-in-out infinite" }}
        />
        <div
            className="absolute right-[-10%] top-[8%] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.24),transparent_60%)] blur-3xl"
            style={{ animation: "skfxOrb 19s ease-in-out infinite reverse" }}
        />
        <div
            className="absolute bottom-[-18%] left-[22%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.18),transparent_58%)] blur-3xl"
            style={{ animation: "skfxOrb 17s ease-in-out infinite" }}
        />
        <div
            className="absolute inset-[-12%] opacity-80"
            style={{
                background:
                    "radial-gradient(circle at 18% 22%, rgba(59,130,246,0.18), transparent 24%), radial-gradient(circle at 78% 14%, rgba(168,85,247,0.16), transparent 22%), radial-gradient(circle at 50% 72%, rgba(14,165,233,0.1), transparent 24%)",
                animation: "skfxMesh 18s ease-in-out infinite",
            }}
        />
        <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
                backgroundImage:
                    "radial-gradient(rgba(255,255,255,0.8) 0.6px, transparent 0.8px)",
                backgroundSize: "20px 20px",
            }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,14,0.12),rgba(4,7,14,0.48))]" />
    </div>
)

const HeroPanel = ({
    userEmail,
    verified,
    summary,
    onBack,
    onSave,
    saving,
    hasChanges,
}: {
    userEmail: string
    verified: boolean
    summary: Array<{ label: string; value: string }>
    onBack: () => void
    onSave: () => void
    saving: boolean
    hasChanges: boolean
}) => (
    <motion.div
        whileHover={{ y: -3 }}
        className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(15,22,40,0.68),rgba(10,14,28,0.82))] p-4 shadow-[0_28px_76px_rgba(0,0,0,0.32)] backdrop-blur-2xl"
    >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.16),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.12),transparent_28%)]" />
        <div
            className="absolute -top-12 left-16 h-28 w-56 rounded-full bg-cyan-400/14 blur-3xl"
            style={{ animation: "skfxGlow 8s ease-in-out infinite" }}
        />
        <div
            className="absolute right-8 top-5 h-px w-32 bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent"
            style={{ animation: "skfxFloat 5s ease-in-out infinite" }}
        />
        <div
            className="absolute left-1/2 top-8 h-px w-24 -translate-x-1/2 bg-gradient-to-r from-transparent via-fuchsia-300/70 to-transparent"
            style={{ animation: "skfxFloat 6s ease-in-out infinite" }}
        />

        <div className="relative space-y-4">
            <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/62">
                    SK-MediaFlow Account Control Center
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
                    Cinematic Identity Hub
                </h1>
                <p
                    className="max-w-3xl text-sm leading-5 text-slate-300/80"
                    style={{ animation: "skfxSubtitle 6s ease-in-out infinite" }}
                >
                    Premium OTT-grade control over your profile, sessions, privacy, playback defaults, and live platform presence.
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300/74">
                    <span className="truncate">{userEmail}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                        verified
                            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                            : "border-amber-300/20 bg-amber-400/10 text-amber-200"
                    }`}>
                        {verified ? "Verified signal" : "Verification pending"}
                    </span>
                </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    {summary.map((item, index) => (
                        <motion.div
                            key={item.label}
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 + index * 0.06, duration: 0.6 }}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl"
                        >
                            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                {item.label}
                            </p>
                            <p className="mt-1 text-sm font-medium text-white">
                                {item.value}
                            </p>
                        </motion.div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                    <ShineButton onClick={onBack} variant="ghost" className="px-4 text-sm">
                        Back to Profile
                    </ShineButton>
                    <ShineButton onClick={onSave} disabled={saving || !hasChanges} className="px-5 text-sm">
                        {saving ? "Saving..." : "Save Changes"}
                    </ShineButton>
                </div>
            </div>
        </div>
    </motion.div>
)

const SidebarPanel = ({
    activeSection,
    onSelect,
}: {
    activeSection: (typeof sectionItems)[number]["id"]
    onSelect: (id: (typeof sectionItems)[number]["id"]) => void
}) => (
    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(145deg,rgba(14,22,38,0.76),rgba(8,12,23,0.82))] p-2.5 shadow-[0_20px_48px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <p className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
            Navigation
        </p>
        <div className="space-y-1.5">
            {sectionItems.map((item) => {
                const Icon = item.icon
                const isActive = activeSection === item.id

                return (
                    <motion.button
                        key={item.id}
                        whileHover={{ x: 2 }}
                        whileTap={{ scale: 0.985 }}
                        type="button"
                        onClick={() => onSelect(item.id)}
                        className={`relative flex w-full items-center justify-between overflow-hidden rounded-xl px-3 py-2.5 text-left transition ${
                            isActive
                                ? "bg-white text-slate-950 shadow-[0_16px_36px_rgba(255,255,255,0.12)]"
                                : "bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]"
                        }`}
                    >
                        {isActive && (
                            <motion.span
                                layoutId="settings-active-pill"
                                className="absolute inset-0 bg-white"
                                transition={{ type: "spring", stiffness: 340, damping: 28 }}
                            />
                        )}

                        <span className="relative z-10 flex items-center gap-3">
                            <Icon size={17} className={isActive ? "text-cyan-700" : "text-cyan-200"} />
                            <span className="text-sm font-medium">{item.label}</span>
                        </span>

                        <span
                            className={`relative z-10 h-2 w-2 rounded-full ${
                                isActive ? "bg-cyan-500" : "bg-white/20"
                            }`}
                            style={isActive ? { animation: "skfxPulse 1.8s ease-in-out infinite" } : undefined}
                        />
                    </motion.button>
                )
            })}
        </div>
    </div>
)

const GlassTiltCard = ({
    id,
    title,
    subtitle,
    icon: Icon,
    children,
    danger = false,
    variants,
}: {
    id: string
    title: string
    subtitle: string
    icon: React.ComponentType<{ size?: number; className?: string }>
    children: React.ReactNode
    danger?: boolean
    variants: Variants
}) => {
    return (
        <motion.section
            id={id}
            variants={variants}
            whileHover={{ y: -1 }}
            className={`relative scroll-mt-24 overflow-hidden rounded-[28px] border p-4 shadow-[0_28px_72px_rgba(0,0,0,0.26)] backdrop-blur-2xl ${
                danger
                    ? "border-rose-400/16 bg-[linear-gradient(145deg,rgba(56,15,26,0.65),rgba(20,11,17,0.82))]"
                    : "border-white/10 bg-[linear-gradient(145deg,rgba(18,28,49,0.62),rgba(10,15,28,0.78))]"
            }`}
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_28%)]" />
            <div className="absolute inset-0 rounded-[28px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
            <div className="relative mb-4 flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    danger
                        ? "border border-rose-300/16 bg-rose-500/12 text-rose-100"
                        : "border border-cyan-300/14 bg-cyan-400/10 text-cyan-100"
                }`}>
                    <Icon size={17} />
                </div>
                <div>
                    <h2 className="text-base font-semibold text-white">{title}</h2>
                    <p className="mt-0.5 text-xs leading-5 text-slate-400">{subtitle}</p>
                </div>
            </div>
            <div className="relative">{children}</div>
        </motion.section>
    )
}

const DeviceCard = ({
    session,
    index,
}: {
    session: SettingsData["security"]["sessions"][number] & {
        uiLabel: string
        icon: React.ComponentType<{ size?: number; className?: string }>
    }
    index: number
}) => {
    const Icon = session.icon
    const gradientByIndex = [
        "from-cyan-500/18 to-blue-500/10",
        "from-fuchsia-500/18 to-violet-500/10",
        "from-emerald-500/18 to-teal-500/10",
    ]

    return (
        <motion.div
            whileHover={{ y: -1 }}
            className={`relative overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-br ${gradientByIndex[index] || gradientByIndex[0]} p-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]`}
        >
            <div className="absolute right-3 top-3 h-16 w-16 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-black/18 text-white">
                    <Icon size={18} />
                </div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-300/16 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" style={{ animation: "skfxPulse 1.8s ease-in-out infinite" }} />
                    Live
                </div>
            </div>

            <div className="mt-3">
                <p className="text-sm font-semibold text-white">{session.uiLabel}</p>
                <p className="mt-1 text-xs text-slate-300/72">{session.deviceLabel}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">Last seen</p>
                <p className="mt-1 text-xs text-slate-300/72">{new Date(session.createdAt).toLocaleString()}</p>
            </div>
        </motion.div>
    )
}

const PreferenceGroup = ({
    title,
    icon: Icon,
    children,
}: {
    title: string
    icon: React.ComponentType<{ size?: number; className?: string }>
    children: React.ReactNode
}) => (
    <motion.div
        whileHover={{ y: -1 }}
        className="rounded-[24px] border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-xl"
    >
        <div className="mb-2.5 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-cyan-100">
                <Icon size={15} />
            </div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <div className="space-y-2">{children}</div>
    </motion.div>
)

const FloatingField = ({
    label,
    value,
    onChange,
    type = "text",
    disabled = false,
}: {
    label: string
    value: string
    onChange: (value: string) => void
    type?: string
    disabled?: boolean
}) => (
    <label className="group relative block">
        <span
            className={`pointer-events-none absolute left-3.5 z-10 rounded-full px-2 text-[10px] font-medium tracking-[0.12em] text-slate-300/80 transition-all ${
                value
                    ? "top-0 -translate-y-1/2 bg-[#0a1020]"
                    : "top-1/2 -translate-y-1/2 bg-transparent text-slate-400"
            } group-focus-within:top-0 group-focus-within:-translate-y-1/2 group-focus-within:bg-[#0a1020] group-focus-within:text-cyan-200`}
        >
            {label}
        </span>
        <input
            type={type}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] px-3.5 pt-4 text-sm text-white outline-none transition-all focus:border-cyan-300/40 focus:shadow-[0_0_0_1px_rgba(103,232,249,0.18),0_0_20px_rgba(34,211,238,0.12)] disabled:opacity-50"
        />
    </label>
)

const SelectField = ({
    label,
    value,
    onChange,
    options,
}: {
    label: string
    value: string
    onChange: (value: string) => void
    options: Array<{ value: string; label: string }>
}) => (
    <label className="block rounded-xl border border-white/10 bg-white/[0.035] p-2.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
            {label}
        </span>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg border border-white/10 bg-[#12192c] px-3 text-sm text-white outline-none transition-all focus:border-cyan-300/40 focus:shadow-[0_0_0_1px_rgba(103,232,249,0.18),0_0_20px_rgba(34,211,238,0.12)]"
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    </label>
)

const ToggleRow = ({
    label,
    detail,
    checked,
    onChange,
}: {
    label: string
    detail: string
    checked: boolean
    onChange: (checked: boolean) => void
}) => (
    <motion.label
        whileHover={{ y: 0 }}
        className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/18 px-3 py-2.5"
    >
        <div>
            <p className="text-sm font-medium text-white">{label}</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-400">{detail}</p>
        </div>
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`relative mt-0.5 h-6.5 w-12 rounded-full border transition-all ${
                checked
                    ? "border-cyan-300/20 bg-cyan-400/20"
                    : "border-white/12 bg-white/6"
            }`}
        >
            <motion.span
                layout
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
                className={`absolute top-0.5 h-5 w-5 rounded-full ${
                    checked ? "left-[1.45rem] bg-cyan-200 shadow-[0_0_20px_rgba(103,232,249,0.55)]" : "left-0.5 bg-white"
                }`}
            />
        </button>
    </motion.label>
)

const ShineButton = ({
    children,
    onClick,
    disabled,
    className = "",
    variant = "primary",
}: {
    children: React.ReactNode
    onClick: () => void
    disabled?: boolean
    className?: string
    variant?: "primary" | "ghost" | "danger"
}) => (
    <motion.button
        whileHover={disabled ? undefined : { y: -1 }}
        whileTap={disabled ? undefined : { scale: 0.995 }}
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`group relative overflow-hidden rounded-xl px-4 py-2.5 font-semibold transition-all ${
            variant === "primary"
                ? "bg-[linear-gradient(135deg,#f8fafc,#a5f3fc)] text-slate-950 shadow-[0_18px_40px_rgba(103,232,249,0.18)]"
                : variant === "danger"
                ? "border border-rose-300/18 bg-rose-500/14 text-rose-50 shadow-[0_16px_34px_rgba(244,63,94,0.16)]"
                : "border border-white/12 bg-white/[0.06] text-white shadow-[0_14px_30px_rgba(255,255,255,0.05)]"
        } disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
        <span
            className="pointer-events-none absolute inset-y-0 left-0 w-14 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.7),transparent)] opacity-0 group-hover:opacity-100"
            style={{ animation: "skfxShine 1.1s ease forwards" }}
        />
        <span className="relative z-10">{children}</span>
    </motion.button>
)

const StrengthMeter = ({
    score,
    label,
    color,
}: {
    score: number
    label: string
    color: string
}) => (
    <div className="rounded-xl border border-white/10 bg-black/18 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Strength</span>
            <span className={`text-xs font-semibold ${color}`}>{label}</span>
        </div>
        <div className="mt-2 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((bar) => (
                <span
                    key={bar}
                    className={`h-1.5 flex-1 rounded-full ${
                        score >= bar
                            ? score <= 2
                                ? "bg-rose-400"
                                : score <= 4
                                ? "bg-amber-400"
                                : "bg-emerald-400"
                            : "bg-white/10"
                    }`}
                />
            ))}
        </div>
    </div>
)

const InfoChip = ({
    label,
    value,
    tone = "default",
}: {
    label: string
    value: string
    tone?: "default" | "success" | "warning"
}) => (
    <motion.div
        whileHover={{ y: -1 }}
        className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-xl"
    >
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
            {label}
        </p>
        <p
            className={`mt-0.5 text-sm font-medium ${
                tone === "success"
                    ? "text-emerald-200"
                    : tone === "warning"
                    ? "text-amber-200"
                    : "text-white"
            }`}
        >
            {value}
        </p>
    </motion.div>
)

const ActionCluster = ({
    title,
    description,
    buttonLabel,
    onClick,
}: {
    title: string
    description: string
    buttonLabel: string
    onClick: () => void
}) => (
    <motion.div
        whileHover={{ y: -1 }}
        className="rounded-[22px] border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-xl"
    >
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
        <ShineButton onClick={onClick} variant="ghost" className="mt-3 text-sm">
            {buttonLabel}
        </ShineButton>
    </motion.div>
)

const DangerCluster = ({
    title,
    description,
    buttonLabel,
    onClick,
    disabled,
}: {
    title: string
    description: string
    buttonLabel: string
    onClick: () => void
    disabled: boolean
}) => (
    <motion.div
        whileHover={{ y: -1 }}
        className="rounded-[22px] border border-rose-400/16 bg-rose-500/10 p-3.5 backdrop-blur-xl"
    >
        <p className="text-sm font-semibold text-rose-100">{title}</p>
        <p className="mt-1 text-xs leading-5 text-rose-100/72">{description}</p>
        <ShineButton onClick={onClick} disabled={disabled} variant="danger" className="mt-3 text-sm">
            {buttonLabel}
        </ShineButton>
    </motion.div>
)

const Message = ({
    tone,
    children,
}: {
    tone: "success" | "error"
    children: React.ReactNode
}) => (
    <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`rounded-[24px] border px-4 py-3 text-sm backdrop-blur-xl ${
            tone === "success"
                ? "border-emerald-400/22 bg-emerald-500/10 text-emerald-100"
                : "border-rose-400/22 bg-rose-500/10 text-rose-100"
        }`}
    >
        {children}
    </motion.div>
)

const ConfirmModal = ({
    title,
    description,
    buttonLabel,
    loading,
    onCancel,
    onConfirm,
}: {
    title: string
    description: string
    buttonLabel: string
    loading: boolean
    onCancel: () => void
    onConfirm: () => void | Promise<void>
}) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md"
    >
        <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(18,23,39,0.92),rgba(9,12,21,0.96))] p-5 shadow-[0_35px_90px_rgba(0,0,0,0.45)]"
        >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.18),transparent_26%)]" />
            <div className="relative">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/14 text-rose-200">
                        <Trash2 size={18} />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">{title}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
                    </div>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <ShineButton onClick={onCancel} variant="ghost" className="px-4 text-sm">
                        Cancel
                    </ShineButton>
                    <ShineButton
                        onClick={() => void onConfirm()}
                        disabled={loading}
                        variant="danger"
                        className="px-4 text-sm"
                    >
                        {loading ? "Processing..." : buttonLabel}
                    </ShineButton>
                </div>
            </div>
        </motion.div>
    </motion.div>
)

export default SettingsPage
