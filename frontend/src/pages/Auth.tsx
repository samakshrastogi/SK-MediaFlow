import { useState, useEffect } from "react";
import axios from "axios";
import {
    loginUser,
    registerUser,
    resendOTP,
    verifyOTP,
    forgotPassword,
    googleLogin,
} from "@/api/auth.api";
import { useAuth } from "@/context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";

const Auth = () => {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [step, setStep] = useState<"form" | "otp">("form");
    const [name, setName] = useState("")
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [remember, setRemember] = useState(false);

    const [forgotEmail, setForgotEmail] = useState("");

    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showForgot, setShowForgot] = useState(false);
    const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
    const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
    const [otpTargetEmail, setOtpTargetEmail] = useState("");
    const [otpResendCooldownSeconds, setOtpResendCooldownSeconds] = useState(0);
    const [otpResendCountRemaining, setOtpResendCountRemaining] = useState<number | null>(null);
    const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [showRegisterPassword, setShowRegisterPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [capsLockOn, setCapsLockOn] = useState(false);
    const [forgotCooldownSeconds, setForgotCooldownSeconds] = useState(0);

    const { login, token } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const redirectTo = (location.state as { from?: string } | null)?.from || "/home";

    useEffect(() => {
        if (!otpExpiresAt) {
            setOtpSecondsLeft(0);
            return;
        }

        const updateCountdown = () => {
            const diffMs = new Date(otpExpiresAt).getTime() - Date.now();
            setOtpSecondsLeft(Math.max(0, Math.ceil(diffMs / 1000)));
        };

        updateCountdown();
        const interval = window.setInterval(updateCountdown, 1000);
        return () => window.clearInterval(interval);
    }, [otpExpiresAt]);

    useEffect(() => {
        if (otpResendCooldownSeconds <= 0) return;

        const interval = window.setInterval(() => {
            setOtpResendCooldownSeconds((value) => Math.max(0, value - 1));
        }, 1000);

        return () => window.clearInterval(interval);
    }, [otpResendCooldownSeconds]);

    useEffect(() => {
        if (forgotCooldownSeconds <= 0) return;

        const interval = window.setInterval(() => {
            setForgotCooldownSeconds((value) => Math.max(0, value - 1));
        }, 1000);

        return () => window.clearInterval(interval);
    }, [forgotCooldownSeconds]);

    const formatOtpCountdown = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const getPasswordStrength = (value: string) => {
        const checks = [
            value.length >= 8,
            /[A-Z]/.test(value),
            /[a-z]/.test(value),
            /\d/.test(value),
            /[^A-Za-z0-9]/.test(value),
        ];
        const score = checks.filter(Boolean).length;

        if (!value) return { label: "Enter a password", color: "text-gray-400", score };
        if (score <= 2) return { label: "Weak password", color: "text-red-400", score };
        if (score === 3 || score === 4)
            return { label: "Medium password", color: "text-yellow-400", score };

        return { label: "Strong password", color: "text-green-400", score };
    };

    const passwordStrength = getPasswordStrength(password);
    const passwordChecks = [
        { label: "At least 8 characters", ok: password.length >= 8 },
        { label: "Uppercase letter", ok: /[A-Z]/.test(password) },
        { label: "Number", ok: /\d/.test(password) },
        { label: "Special character", ok: /[^A-Za-z0-9]/.test(password) },
    ];

    const enterOtpStep = (
        targetEmail: string,
        expiry?: string,
        message?: string,
        resendCooldownSeconds?: number,
        resendCountRemaining?: number
    ) => {
        const normalized = targetEmail.trim().toLowerCase();
        setEmail(normalized);
        setOtpTargetEmail(normalized);
        setOtpExpiresAt(expiry ?? null);
        setOtpResendCooldownSeconds(resendCooldownSeconds ?? 0);
        setOtpResendCountRemaining(resendCountRemaining ?? null);
        setSuccessMessage(message ?? `OTP sent to ${normalized}.`);
        setPendingVerificationEmail("");
        setStep("otp");
    };

    const handlePasswordKeyState = (
        e: React.KeyboardEvent<HTMLInputElement>
    ) => {
        setCapsLockOn(e.getModifierState("CapsLock"));
    };

    useEffect(() => {
        if (token) navigate(redirectTo, { replace: true });
    }, [token, navigate, redirectTo]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setPendingVerificationEmail("");
        setLoading(true);

        try {
            if (mode === "login") {
                const res = await loginUser(email, password, remember);
                if (!res.success) throw new Error(res.message);

                login(res.data!.token, res.data!.user, remember, res.data!.loginId ?? null);
                navigate(redirectTo, { replace: true });
            } else {
                const res = await registerUser(name, email, password, confirmPassword);
                if (!res.success) throw new Error(res.message);
                enterOtpStep(
                    res.data?.email ?? email,
                    res.data?.otpExpiresAt,
                    res.message ?? `OTP sent to ${email.trim().toLowerCase()}.`,
                    res.data?.resendCooldownSeconds,
                    res.data?.resendCountRemaining
                );
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const requiresVerification = Boolean(
                    err.response?.data?.data?.requiresVerification
                );
                const verificationEmail =
                    err.response?.data?.data?.email ?? email.trim().toLowerCase();

                if (requiresVerification) {
                    setPendingVerificationEmail(verificationEmail);
                    setError("Verify your email first.");
                    return;
                }
            }

            const errorMessage =
                err instanceof Error
                    ? err.message
                    : "Something went wrong"

            setError(errorMessage)
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await verifyOTP(otpTargetEmail || email, otp);
            if (!res.success) throw new Error(res.message);

            setSuccessMessage("Account verified successfully. Please login.");
            setMode("login");
            setStep("form");
            setOtp("");
            setOtpExpiresAt(null);
            setOtpTargetEmail("");
        } catch (err: unknown) {
            const errorMessage =
                err instanceof Error
                    ? err.message
                    : "Something went wrong"

            setError(errorMessage)
        } finally {
            setLoading(false);
        }
    };

    const handleResendOTP = async () => {
        try {
            setLoading(true);
            setError(null);
            setSuccessMessage(null);

            const res = await resendOTP(otpTargetEmail || email);
            if (!res.success) throw new Error(res.message);
            const nextEmail = res.data?.email ?? otpTargetEmail ?? email;

            enterOtpStep(
                nextEmail,
                res.data?.otpExpiresAt,
                res.message ?? `OTP sent to ${nextEmail.trim().toLowerCase()}.`,
                res.data?.resendCooldownSeconds,
                res.data?.resendCountRemaining
            );
            setOtp("");
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const cooldownSeconds = Number(err.response?.data?.data?.cooldownSeconds || 0);
                if (cooldownSeconds > 0) {
                    setOtpResendCooldownSeconds(cooldownSeconds);
                }
            }
            const errorMessage =
                err instanceof Error
                    ? err.message
                    : "Something went wrong";

            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleLoginRecoveryResend = async () => {
        try {
            setLoading(true);
            setError(null);

            const targetEmail = pendingVerificationEmail || email;
            const res = await resendOTP(targetEmail);
            if (!res.success) throw new Error(res.message);

            enterOtpStep(
                res.data?.email ?? targetEmail,
                res.data?.otpExpiresAt,
                res.message ?? `OTP sent to ${targetEmail.trim().toLowerCase()}.`,
                res.data?.resendCooldownSeconds,
                res.data?.resendCountRemaining
            );
            setOtp("");
        } catch (err: unknown) {
            const errorMessage =
                err instanceof Error
                    ? err.message
                    : "Something went wrong";
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleChangeEmail = () => {
        setStep("form");
        setOtp("");
        setOtpExpiresAt(null);
        setOtpTargetEmail("");
        setOtpResendCooldownSeconds(0);
        setOtpResendCountRemaining(null);
        setSuccessMessage(null);
        setError(null);
    };

    const handleForgotPassword = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await forgotPassword(forgotEmail);
            if (!res.success) throw new Error(res.message);
            setForgotCooldownSeconds(res.data?.cooldownSeconds ?? 0);

            setSuccessMessage(
                res.data?.resetLink
                    ? `Local reset link: ${res.data.resetLink}`
                    : (res.message ?? "Reset instructions sent to your email.")
            );
            setShowForgot(false);
            setForgotEmail("");
        } catch (err: unknown) {
            const errorMessage =
                err instanceof Error
                    ? err.message
                    : "Something went wrong"

            setError(errorMessage)
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white flex">

            {/* LEFT HERO */}
            <div className="hidden lg:flex w-1/2 relative items-center px-20">

                {/* Background Image */}
                <div className="absolute inset-0 bg-cover bg-center"
                    style={{
                        backgroundImage:
                            "url('https://images.unsplash.com/photo-1524985069026-dd778a71c7b4')",
                    }}
                />

                {/* Dark Overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent" />

                <div className="relative z-10 max-w-xl">

                    <h1 className="text-7xl font-bold leading-tight">
                        Watch, <br />
                        Upload, <br />
                        <span className="bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(139,92,246,0.6)]">
                            Discover
                        </span>
                    </h1>

                    <p className="mt-6 text-gray-400 text-lg leading-relaxed">
                        Explore trending videos, share your content, and discover creators from around the world - only on <span className="text-white">SKFlix</span>.
                    </p>

                </div>
            </div>

            {/* RIGHT AUTH CARD */}
            <div className="flex flex-1 items-center justify-center p-8">

                <div className="w-full max-w-lg p-10 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">

                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
                            SKFlix
                        </h1>
                        <p className="text-gray-400 mt-2 text-sm">
                            {mode === "login" ? "Welcome back" : "Create your account"}
                        </p>
                    </div>

                    {/* Toggle */}
                    <div className="relative flex bg-black/40 rounded-xl p-1 mb-6">

                        <div
                            className={`absolute top-1 bottom-1 w-1/2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 transition-all duration-300 ${mode === "login" ? "left-1" : "left-1/2"
                                }`}
                        />

                        <button
                            onClick={() => {
                                setMode("login");
                                setStep("form");
                                setError(null);
                                setSuccessMessage(null);
                                setOtp("");
                                setOtpExpiresAt(null);
                                setOtpTargetEmail("");
                                setOtpResendCooldownSeconds(0);
                                setOtpResendCountRemaining(null);
                                setPendingVerificationEmail("");
                            }}
                            className="flex-1 py-2 text-sm font-medium z-10"
                        >
                            Login
                        </button>

                        <button
                            onClick={() => {
                                setMode("register");
                                setStep("form");
                                setError(null);
                                setSuccessMessage(null);
                                setOtp("");
                                setOtpExpiresAt(null);
                                setOtpTargetEmail("");
                                setOtpResendCooldownSeconds(0);
                                setOtpResendCountRemaining(null);
                                setPendingVerificationEmail("");
                            }}
                            className="flex-1 py-2 text-sm font-medium z-10"
                        >
                            Register
                        </button>

                    </div>

                    {/* Messages */}
                    {error && (
                        <div className="bg-red-500/20 border border-red-500 text-red-400 text-sm p-3 rounded-lg mb-4 text-center">
                            {error}
                        </div>
                    )}

                    {mode === "login" && step === "form" && pendingVerificationEmail && (
                        <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                            <div className="font-medium">
                                Verify your email first.
                            </div>
                            <div className="mt-1 text-amber-100/80">
                                Finish verification for {pendingVerificationEmail}.
                            </div>
                            <button
                                type="button"
                                onClick={handleLoginRecoveryResend}
                                disabled={loading}
                                className="mt-3 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
                            >
                                Resend OTP
                            </button>
                        </div>
                    )}

                    {successMessage && (
                        <div className="bg-green-500/20 border border-green-500 text-green-400 text-sm p-3 rounded-lg mb-4 text-center">
                            {successMessage}
                        </div>
                    )}

                    {step === "form" ? (
                        <form onSubmit={handleSubmit} className="space-y-5">

                            {/* FULL NAME (REGISTER ONLY) */}
                            {mode === "register" && (
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Full Name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 outline-none transition"
                                    />
                                </div>
                            )}

                            {/* EMAIL */}
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 outline-none transition"
                            />

                            {/* PASSWORD ROW */}
                            <div className={`${mode === "register" ? "flex gap-4" : ""}`}>

                                {/* PASSWORD */}
                                <div className={`relative ${mode === "register" ? "w-1/2" : "w-full"}`}>
                                    <input
                                        type={
                                            mode === "register"
                                                ? showRegisterPassword
                                                    ? "text"
                                                    : "password"
                                                : showLoginPassword
                                                ? "text"
                                                : "password"
                                        }
                                        placeholder="Password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        onKeyUp={handlePasswordKeyState}
                                        onKeyDown={handlePasswordKeyState}
                                        required
                                        className="w-full px-4 py-3 pr-20 rounded-xl bg-black/50 border border-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 outline-none transition"
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            mode === "register"
                                                ? setShowRegisterPassword((value) => !value)
                                                : setShowLoginPassword((value) => !value)
                                        }
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-300 hover:text-white"
                                    >
                                        {(mode === "register" ? showRegisterPassword : showLoginPassword)
                                            ? "Hide"
                                            : "Show"}
                                    </button>
                                </div>

                                {/* CONFIRM PASSWORD */}
                                {mode === "register" && (
                                    <div className="relative w-1/2">
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="Confirm Password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            onKeyUp={handlePasswordKeyState}
                                            onKeyDown={handlePasswordKeyState}
                                            required
                                            className="w-full px-4 py-3 pr-20 rounded-xl bg-black/50 border border-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword((value) => !value)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-300 hover:text-white"
                                        >
                                            {showConfirmPassword ? "Hide" : "Show"}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {capsLockOn && (
                                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
                                    Caps Lock is on.
                                </div>
                            )}

                            {mode === "register" && (
                                <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-300">Password strength</span>
                                        <span className={passwordStrength.color}>
                                            {passwordStrength.label}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[1, 2, 3, 4].map((bar) => (
                                            <div
                                                key={bar}
                                                className={`h-2 rounded-full ${
                                                    passwordStrength.score >= bar
                                                        ? passwordStrength.score <= 2
                                                            ? "bg-red-500"
                                                            : passwordStrength.score <= 4
                                                            ? "bg-yellow-500"
                                                            : "bg-green-500"
                                                        : "bg-gray-700"
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                                        {passwordChecks.map((item) => (
                                            <div
                                                key={item.label}
                                                className={item.ok ? "text-green-400" : "text-gray-500"}
                                            >
                                                {item.ok ? "OK" : "Need"} {item.label}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* LOGIN OPTIONS */}
                            {mode === "login" && (
                                <div className="flex items-center justify-between text-sm">

                                    <label className="flex items-center gap-2 text-gray-400">
                                        <input
                                            type="checkbox"
                                            checked={remember}
                                            onChange={() => setRemember(!remember)}
                                        />
                                        Remember me
                                    </label>

                                    <span
                                        onClick={() => setShowForgot(true)}
                                        className="text-purple-400 cursor-pointer hover:text-purple-300"
                                    >
                                        Forgot password?
                                    </span>

                                </div>
                            )}

                            {/* SUBMIT */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition disabled:opacity-60"
                            >
                                {loading
                                    ? "Processing..."
                                    : mode === "login"
                                        ? "Login"
                                        : "Register"}
                            </button>

                            {/* DIVIDER */}
                            <div className="text-center text-gray-400 text-sm">
                                OR
                            </div>

                            {/* GOOGLE LOGIN */}
                            <button
                                type="button"
                                onClick={googleLogin}
                                className="w-full py-3 rounded-xl bg-white text-black font-semibold flex items-center justify-center gap-3 hover:bg-gray-100 transition"
                            >
                                <img
                                    src="https://www.svgrepo.com/show/475656/google-color.svg"
                                    alt="Google logo"
                                    className="w-5 h-5"
                                />
                                Continue with Google
                            </button>

                        </form>
                    ) : (
                        <div className="space-y-5">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
                                <div className="font-medium text-white">
                                    OTP sent to {otpTargetEmail || email}
                                </div>
                                <div className="mt-1 text-gray-400">
                                    {otpSecondsLeft > 0
                                        ? `Code expires in ${formatOtpCountdown(otpSecondsLeft)}`
                                        : "This OTP has expired. Request a new code."}
                                </div>
                                {otpResendCountRemaining !== null && (
                                    <div className="mt-1 text-xs text-gray-500">
                                        {otpResendCountRemaining} resend(s) remaining this hour
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={handleChangeEmail}
                                    className="mt-3 text-sm font-medium text-purple-400 hover:text-purple-300"
                                >
                                    Change email
                                </button>
                            </div>
 
                            <input
                                type="text"
                                placeholder="Enter OTP"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                maxLength={6}
                                className="w-full text-center tracking-widest text-lg px-4 py-3 rounded-xl bg-black/50 border border-gray-700 focus:border-purple-500 outline-none"
                            />

                            <button
                                onClick={handleVerifyOTP}
                                disabled={loading || otpSecondsLeft === 0}
                                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600"
                            >
                                Verify OTP
                            </button>

                            <button
                                type="button"
                                onClick={handleResendOTP}
                                disabled={
                                    loading ||
                                    otpResendCooldownSeconds > 0 ||
                                    otpResendCountRemaining === 0
                                }
                                className="w-full py-3 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-60"
                            >
                                {otpResendCooldownSeconds > 0
                                    ? `Resend OTP in ${otpResendCooldownSeconds}s`
                                    : "Resend OTP"}
                            </button>

                        </div>
                    )}
                </div>
            </div>

            {/* Forgot Password Modal */}
            {showForgot && (
                <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center px-4 backdrop-blur-sm">

                    <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#0f172a] p-4 sm:p-8 space-y-4 shadow-xl">

                        <h3 className="text-lg font-semibold">
                            Reset Password
                        </h3>

                        <input
                            type="email"
                            placeholder="Enter email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-black/40 border border-gray-700 focus:border-purple-500 outline-none"
                        />

                        <button
                            onClick={handleForgotPassword}
                            disabled={loading || forgotCooldownSeconds > 0}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600"
                        >
                            {forgotCooldownSeconds > 0
                                ? `Wait ${forgotCooldownSeconds}s`
                                : "Send Reset Email"}
                        </button>

                        <button
                            onClick={() => setShowForgot(false)}
                            className="w-full text-gray-400 text-sm hover:text-white"
                        >
                            Cancel
                        </button>

                    </div>
                </div>
            )}
        </div>
    );
};

export default Auth;
