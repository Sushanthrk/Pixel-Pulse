import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
    baseURL: API,
    withCredentials: true,
});

api.interceptors.response.use(
    (r) => r,
    (err) => {
        return Promise.reject(err);
    },
);

export function formatApiError(detail) {
    if (detail == null) return "Something went wrong.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail
            .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
            .join(" ");
    if (detail && typeof detail.msg === "string") return detail.msg;
    return String(detail);
}

export const PLATFORMS = [
    { key: "youtube", label: "YouTube", mode: "auto" },
    { key: "medium", label: "Medium", mode: "auto" },
    { key: "substack", label: "Substack", mode: "auto" },
    { key: "blog", label: "Blog / RSS", mode: "auto" },
    { key: "reddit", label: "Reddit", mode: "auto" },
    { key: "instagram", label: "Instagram", mode: "manual" },
    { key: "facebook", label: "Facebook", mode: "manual" },
    { key: "linkedin", label: "LinkedIn (personal)", mode: "manual" },
    { key: "linkedin_company", label: "LinkedIn (company)", mode: "manual" },
    { key: "pinterest", label: "Pinterest", mode: "manual" },
    { key: "twitter", label: "X / Twitter", mode: "manual" },
    { key: "custom", label: "Custom", mode: "manual" },
];

export function platformLabel(key) {
    return PLATFORMS.find((p) => p.key === key)?.label || key;
}
