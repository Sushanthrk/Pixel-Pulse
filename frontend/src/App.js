import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import AdminClients from "@/pages/AdminClients";
import Dashboard from "@/pages/Dashboard";
import Channels from "@/pages/Channels";
import Competitors from "@/pages/Competitors";
import Geo from "@/pages/Geo";
import Seo from "@/pages/Seo";
import ContentPlan from "@/pages/ContentPlan";
import Sentiment from "@/pages/Sentiment";
import AIActionPlan from "@/pages/AIActionPlan";
import { Toaster } from "sonner";

function Protected({ children, adminOnly = false }) {
    const { user } = useAuth();
    if (user === null) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#050505] text-[#a0a0ab] font-mono-tech text-xs">
                Booting…
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" replace />;
    return <Layout>{children}</Layout>;
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Toaster
                    position="bottom-right"
                    toastOptions={{
                        style: {
                            background: "#050505",
                            border: "1px solid rgba(160,160,171,0.25)",
                            borderRadius: 0,
                            color: "#fafafa",
                            fontFamily: "Inter, sans-serif",
                        },
                    }}
                />
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/admin/clients"
                        element={
                            <Protected adminOnly>
                                <AdminClients />
                            </Protected>
                        }
                    />
                    <Route
                        path="/dashboard"
                        element={
                            <Protected>
                                <Dashboard />
                            </Protected>
                        }
                    />
                    <Route
                        path="/channels"
                        element={
                            <Protected>
                                <Channels />
                            </Protected>
                        }
                    />
                    <Route
                        path="/configure"
                        element={
                            <Protected>
                                <Channels />
                            </Protected>
                        }
                    />
                    <Route
                        path="/competitors"
                        element={
                            <Protected>
                                <Competitors />
                            </Protected>
                        }
                    />
                    <Route
                        path="/geo"
                        element={
                            <Protected>
                                <Geo />
                            </Protected>
                        }
                    />
                    <Route
                        path="/seo"
                        element={
                            <Protected>
                                <Seo />
                            </Protected>
                        }
                    />
                    <Route
                        path="/plan"
                        element={
                            <Protected>
                                <ContentPlan />
                            </Protected>
                        }
                    />
                    <Route
                        path="/content-plan"
                        element={
                            <Protected>
                                <ContentPlan />
                            </Protected>
                        }
                    />
                    <Route
                        path="/sentiment"
                        element={
                            <Protected>
                                <Sentiment />
                            </Protected>
                        }
                    />
                    <Route
                        path="/ai-plan"
                        element={
                            <Protected>
                                <AIActionPlan />
                            </Protected>
                        }
                    />
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
