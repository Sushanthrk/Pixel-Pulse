# Pixelgrok Pulse — Product Requirements

Multi-tenant SaaS customer portal for Pixelgrok Media clients (B2B brand-authority analytics).
Stack: React + FastAPI + MongoDB.

## Hard constraint
Free tools only. No paid APIs (no X/Twitter API, Stripe, Semrush, DataForSEO, paid scrapers).

## User personas
- **Admin** (Pixelgrok lead) — manages 20 client workspaces (enable/disable), views all data
- **Client** — single-user per workspace (founders / marketing leads), sees only their workspace

## Core requirements
- JWT auth, admin-created accounts, no public signup
- Channels: YouTube/Medium/Substack/Blog(RSS)/Reddit = auto; Instagram/Facebook/LinkedIn (personal+company)/Pinterest/X = manual
- Own-channel analytics: feed, frequency, top post, engagement trend, MoM%, consistency score, channel health cards
- Competitor intel: up to 5 per platform, posting frequency, content mix, hashtags, heatmap, LLM topic clustering
- GEO mention tracker across GPT-5.2 / Claude Sonnet 4.5 / Gemini 3 Flash, brand-mention rate, competitor mentions
- SEO ranking: manual + optional Google Programmable Search (free 100/day)
- LLM keyword recommendations + 6-month content plan (plain text, NO PDF)
- Admin panel: client CRUD + enable/disable

## Brand
- Bg #050505, accent #e6192b, text #fafafa / #a0a0ab
- Bricolage Grotesque (display) + Inter (body)
- Film-set UI: REC dot, live timecode, hairline dividers, red corner brackets, sharp edges, pill-only CTAs

## What's been implemented — 2026-02-11
- JWT auth (cookie + bearer), bcrypt, admin seeded from .env
- Admin: list/create/toggle/delete client workspaces
- Channels: CRUD + per-platform `sync_mode` (auto|manual)
- Auto-sync: YouTube (mock if no key) · RSS (real) · Reddit public JSON (real)
- Manual post entry (URL + engagement numbers)
- Dashboard summary: MoM, consistency, channel health, top post, engagement trend
- Competitor radar: CRUD, sync, heatmap, content-mix donut, hashtags, LLM topic clustering (Claude)
- GEO: queries CRUD + full scan across gpt-5.2 / claude-sonnet-4.5 / gemini-3-flash, mention detection, competitor extraction
- SEO: keyword CRUD + manual rank + optional Programmable Search auto-rank
- Recommendations: long-tail keyword brief (GPT-5.2) + 6-month plan (Gemini 3 Flash)
- Full Pixelgrok brand theme (Bricolage Grotesque, Inter, REC dot, timecode, corner brackets)

## P1 backlog
- Real OAuth wiring for Meta Graph API (Instagram + FB) and Pinterest API tokens
- YouTube live key + actually pulling competitor channels at scale
- Email password-reset flow (Resend/SendGrid free tier)
- Saved scan schedules (cron) for GEO + SEO weekly tracking
- Side-by-side client-vs-competitor comparison view

## P2 backlog
- LinkedIn / X "manual snapshot" weekly entry form with screenshot upload (object storage)
- Multi-user per client account
- Billing layer (paid tiers)
