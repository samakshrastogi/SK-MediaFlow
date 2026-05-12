import { useState, useEffect } from "react";
import {
    loginUser,
    registerUser,
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

    const { login, token } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const redirectTo = (location.state as { from?: string } | null)?.from || "/home";

    useEffect(() => {
        if (token) navigate(redirectTo, { replace: true });
    }, [token, navigate, redirectTo]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);
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

                setSuccessMessage("OTP sent to your email.");
                setStep("otp");
            }
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

    const handleVerifyOTP = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await verifyOTP(email, otp);
            if (!res.success) throw new Error(res.message);

            setSuccessMessage("Account verified successfully. Please login.");
            setMode("login");
            setStep("form");
            setOtp("");
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

    const handleForgotPassword = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await forgotPassword(forgotEmail);
            if (!res.success) throw new Error(res.message);

            setSuccessMessage("Reset instructions sent to your email.");
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
                        Explore trending videos, share your content, and discover creators from around the world - only on <span className="text-white">StreamHub</span>.
                    </p>

                </div>
            </div>

            {/* RIGHT AUTH CARD */}
            <div className="flex flex-1 items-center justify-center p-8">

                <div className="w-full max-w-lg p-10 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">

                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
                            StreamHub
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

                    {successMessage && (
                        <div className="bg-green-500/20 border border-green-500 text-green-400 text-sm p-3 rounded-lg mb-4 text-center">
                            {successMessage}
                        </div>
                    )}

                    {step === "form" ? (
                        <form onSubmit={handleSubmit} className="space-y-5">

                            {/* FULL NAME (REGISTER ONLY) */}
                            {mode === "register" && (
                                <input
                                    type="text"
                                    placeholder="Full Name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 outline-none transition"
                                />
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
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className={`px-4 py-3 rounded-xl bg-black/50 border border-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 outline-none transition ${mode === "register" ? "w-1/2" : "w-full"}`}
                                />

                                {/* CONFIRM PASSWORD */}
                                {mode === "register" && (
                                    <input
                                        type="password"
                                        placeholder="Confirm Password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        className="w-1/2 px-4 py-3 rounded-xl bg-black/50 border border-gray-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 outline-none"
                                    />
                                )}
                            </div>

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

                            <input
                                type="text"
                                placeholder="Enter OTP"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                className="w-full text-center tracking-widest text-lg px-4 py-3 rounded-xl bg-black/50 border border-gray-700 focus:border-purple-500 outline-none"
                            />

                            <button
                                onClick={handleVerifyOTP}
                                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600"
                            >
                                Verify OTP
                            </button>

                        </div>
                    )}
                </div>
            </div>

            {/* Forgot Password Modal */}
            {showForgot && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm">

                    <div className="bg-[#0f172a] p-8 rounded-2xl w-96 space-y-4 border border-white/10 shadow-xl">

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
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600"
                        >
                            Send Reset Email
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
