import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { RecDot, HairlineDivider } from "../components/Pieces";

export default function Login() {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    if (user) return <Navigate to={user.role === "admin" ? "/admin/clients" : "/dashboard"} replace />;

    const onSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        const result = await login(email.trim().toLowerCase(), password);
        setLoading(false);
        if (result.ok) {
            navigate(result.data.user.role === "admin" ? "/admin/clients" : "/dashboard");
        } else {
            setError(result.error);
        }
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-[#050505] text-[#fafafa]">
            <div
                className="hidden md:flex md:w-1/2 relative overflow-hidden"
                style={{
                    backgroundImage:
                        "linear-gradient(180deg, rgba(5,5,5,0.65), rgba(5,5,5,0.9)), url('https://images.pexels.com/photos/28534618/pexels-photo-28534618.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=940')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            >
                <div className="absolute inset-0 p-10 flex flex-col justify-between">
                    <div className="flex items-center gap-3">
                        <RecDot label="ON AIR" />
                        <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                            CH 01 // BRAND AUTHORITY LAB
                        </span>
                    </div>
                    <div>
                        <div className="font-mono-tech text-[10px] text-[#a0a0ab] mb-3">
                            // Pixelgrok Media · client portal
                        </div>
                        <h1 className="font-display uppercase font-black text-5xl leading-[0.95]">
                            Pulse{" "}
                            <span className="text-[#e6192b]">/</span>{" "}
                            the brand
                            <br />
                            authority lab.
                        </h1>
                        <p className="max-w-md text-[#a0a0ab] mt-6 text-sm leading-relaxed">
                            Channel signal. Competitor radar. Generative-engine mention rate.
                            Closed-beta access — credentials issued directly by Pixelgrok.
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-8">
                <form
                    onSubmit={onSubmit}
                    className="w-full max-w-md pg-card p-10"
                    data-testid="login-form"
                >
                    <span className="bracket tl !opacity-100" />
                    <span className="bracket br !opacity-100" />
                    <div className="flex items-center gap-3 mb-6">
                        <RecDot label="SECURE" />
                        <span className="font-mono-tech text-[10px] text-[#a0a0ab]">
                            // sign in
                        </span>
                    </div>
                    <h2 className="font-display uppercase font-bold text-3xl tracking-tight mb-2">
                        Access the lab
                    </h2>
                    <p className="text-[#a0a0ab] text-sm mb-7 leading-relaxed">
                        Use the credentials shared by your Pixelgrok lead.
                    </p>

                    <label className="pg-label">Email</label>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pg-input mt-2 mb-5"
                        placeholder="you@brand.com"
                        data-testid="login-email-input"
                    />

                    <label className="pg-label">Password</label>
                    <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pg-input mt-2 mb-7"
                        placeholder="••••••••"
                        data-testid="login-password-input"
                    />

                    {error && (
                        <div
                            className="text-sm text-[#ff6b76] mb-4 font-mono"
                            data-testid="login-error"
                        >
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="pg-btn-primary w-full justify-center"
                        disabled={loading}
                        data-testid="login-submit-btn"
                    >
                        {loading ? "Authenticating…" : "Sign in"}
                    </button>

                    <HairlineDivider className="my-8" />
                    <div className="font-mono-tech text-[10px] text-[#a0a0ab] text-center">
                        No public signup · closed beta
                    </div>
                </form>
            </div>
        </div>
    );
}
