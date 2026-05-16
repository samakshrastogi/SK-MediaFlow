import { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { resetPassword } from "@/api/auth.api";

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const token = searchParams.get("token");

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const passwordStrength = useMemo(() => {
        const checks = [
            newPassword.length >= 8,
            /[A-Z]/.test(newPassword),
            /[a-z]/.test(newPassword),
            /\d/.test(newPassword),
            /[^A-Za-z0-9]/.test(newPassword),
        ];
        const score = checks.filter(Boolean).length;

        if (!newPassword) return { label: "Enter a password", color: "text-gray-400", score };
        if (score <= 2) return { label: "Weak password", color: "text-red-400", score };
        if (score <= 4) return { label: "Medium password", color: "text-yellow-400", score };
        return { label: "Strong password", color: "text-green-400", score };
    }, [newPassword]);

    const passwordChecks = [
        { label: "At least 8 characters", ok: newPassword.length >= 8 },
        { label: "Uppercase letter", ok: /[A-Z]/.test(newPassword) },
        { label: "Number", ok: /\d/.test(newPassword) },
        { label: "Special character", ok: /[^A-Za-z0-9]/.test(newPassword) },
    ];

    const handleReset = async () => {
        setError(null);
        setSuccess(null);

        if (!token) {
            setError("This reset link is invalid or has already been used.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        try {
            setLoading(true);
            const res = await resetPassword(token, newPassword);
            if (!res.success) throw new Error(res.message);

            setSuccess(res.message ?? "Password reset successful. Redirecting to login...");

            setTimeout(() => {
                navigate("/login");
            }, 2000);
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("Reset failed");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl w-full max-w-md space-y-4">
                <h2 className="text-xl font-semibold text-center">
                    Reset Password
                </h2>

                <p className="text-sm text-center text-gray-400">
                    Reset links expire after 1 hour and can only be used once.
                </p>

                {error && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm text-center">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300 text-sm text-center">
                        {success}
                    </div>
                )}

                <div className="relative">
                    <input
                        type={showPassword ? "text" : "password"}
                        placeholder="New password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 pr-20 rounded-xl bg-black/50 border border-gray-700"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-300 hover:text-white"
                    >
                        {showPassword ? "Hide" : "Show"}
                    </button>
                </div>

                <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">Password strength</span>
                        <span className={passwordStrength.color}>{passwordStrength.label}</span>
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

                <div className="relative">
                    <input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-3 pr-20 rounded-xl bg-black/50 border border-gray-700"
                    />
                    <button
                        type="button"
                        onClick={() => setShowConfirmPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-300 hover:text-white"
                    >
                        {showConfirmPassword ? "Hide" : "Show"}
                    </button>
                </div>

                <button
                    onClick={handleReset}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 disabled:opacity-60"
                >
                    {loading ? "Resetting..." : "Reset Password"}
                </button>
            </div>
        </div>
    );
};

export default ResetPassword;
