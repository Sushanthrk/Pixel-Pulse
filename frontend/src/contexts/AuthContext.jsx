import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // null = checking, false = logged out, object = logged in
    const [scopedClientId, setScopedClientId] = useState(null);

    const refresh = useCallback(async () => {
        try {
            const { data } = await api.get("/auth/me");
            setUser(data);
            if (data.role === "client") {
                setScopedClientId(data.client_id);
            } else {
                const stored = localStorage.getItem("pg_admin_workspace");
                if (stored) {
                    setScopedClientId(stored);
                } else {
                    // auto-pick the first client (typically Pixelgrok) so the admin
                    // lands on a populated dashboard instead of an empty notice.
                    try {
                        const r = await api.get("/admin/clients");
                        if (r.data && r.data.length > 0) {
                            const pixelgrok = r.data.find(
                                (c) => c.name?.toLowerCase() === "pixelgrok",
                            );
                            const pick = (pixelgrok || r.data[0]).id;
                            setScopedClientId(pick);
                            localStorage.setItem("pg_admin_workspace", pick);
                        }
                    } catch (_) {}
                }
            }
            return data;
        } catch (e) {
            setUser(false);
            return null;
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const login = async (email, password) => {
        try {
            const { data } = await api.post("/auth/login", { email, password });
            await refresh();
            return { ok: true, data };
        } catch (e) {
            return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
        }
    };

    const logout = async () => {
        try {
            await api.post("/auth/logout");
        } catch (_) {
            // ignore
        }
        localStorage.removeItem("pg_admin_workspace");
        setScopedClientId(null);
        setUser(false);
    };

    const setWorkspace = (clientId) => {
        setScopedClientId(clientId);
        if (clientId) localStorage.setItem("pg_admin_workspace", clientId);
        else localStorage.removeItem("pg_admin_workspace");
    };

    return (
        <AuthContext.Provider
            value={{ user, refresh, login, logout, scopedClientId, setWorkspace }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}

// Builds `?client_id=` query when admin has picked a workspace
export function useClientQuery() {
    const { user, scopedClientId } = useAuth();
    if (user && user.role === "admin" && scopedClientId) {
        return { params: { client_id: scopedClientId } };
    }
    return { params: {} };
}
