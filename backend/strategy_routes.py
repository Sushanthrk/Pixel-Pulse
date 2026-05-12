"""LLM-driven strategic endpoints: competitor scoring, content plan, deep sentiment,
AI-engine action plan. Mounted by server.py via `app.include_router(strategy_router)`.

All endpoints follow the same shape:
- accept ?client_id= for admin scope
- return strict JSON the frontend can render
- persist result so the page can reload without re-spending tokens
"""
from __future__ import annotations

import json as _json
import re as _re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from llm_service import ask_engine


router = APIRouter(prefix="/api")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_json(text: str) -> dict | None:
    if not text:
        return None
    cleaned = _re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=_re.MULTILINE).strip()
    try:
        return _json.loads(cleaned)
    except Exception:
        pass
    m = _re.search(r"\{[\s\S]*\}", cleaned)
    if not m:
        return None
    try:
        return _json.loads(m.group(0))
    except Exception:
        return None


def _clamp(v, lo, hi) -> int:
    try:
        n = int(v)
    except Exception:
        n = lo
    return max(lo, min(hi, n))


async def _resolve_scope(db, user: dict, client_id: Optional[str]) -> str:
    if user["role"] == "admin":
        if not client_id:
            raise HTTPException(status_code=400, detail="client_id is required for admin")
        if not await db.clients.find_one({"id": client_id}):
            raise HTTPException(status_code=404, detail="Client not found")
        return client_id
    cid = user.get("client_id")
    if not cid:
        raise HTTPException(status_code=403, detail="User has no client scope")
    return cid


# ==================================================================
# Competitor scoring + gap analysis
# ==================================================================
def _build_competitor_router(db):
    @router.post("/competitors/scores/refresh")
    async def refresh_competitor_scores(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        """Compute per-competitor scores (brand, AI visibility, sentiment, cadence)
        from observed data + a short LLM-derived perception score. Stored per client."""
        cid = await _resolve_scope(db, user, client_id)
        competitors = await db.competitors.find({"client_id": cid}, {"_id": 0}).to_list(20)
        if not competitors:
            return {"competitors": [], "you": None, "biggest_gaps": []}

        # Pull observed signals
        geo_results = await db.geo_results.find({"client_id": cid}, {"_id": 0}).to_list(2000)
        own_posts = await db.posts.find({"client_id": cid}, {"_id": 0}).to_list(2000)
        own_sentiment = await db.brand_sentiment.find_one({"client_id": cid}, {"_id": 0})
        now = datetime.now(timezone.utc)
        cutoff_30 = now - timedelta(days=30)

        def _parse_dt(v):
            if isinstance(v, datetime):
                return v
            try:
                return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
            except Exception:
                return now

        def _eng(items):
            return sum(p.get("likes", 0) + p.get("comments", 0) + p.get("shares", 0) for p in items)

        # ---- Build per-competitor stats ----
        comp_stats = []
        for c in competitors:
            cposts = await db.competitor_posts.find(
                {"competitor_id": c["id"], "client_id": cid}, {"_id": 0}
            ).to_list(500)
            recent = [p for p in cposts if _parse_dt(p["posted_at"]) >= cutoff_30]
            # AI visibility: % geo_results where this handle is mentioned
            engine_pairs: dict[str, list] = {}
            for r in geo_results:
                k = f"{r['query_id']}::{r['engine']}"
                if k not in engine_pairs:
                    engine_pairs[k] = r
            ai_pairs = list(engine_pairs.values())
            ai_hits = sum(1 for r in ai_pairs if c["handle"] in (r.get("competitor_mentions") or []))
            ai_visibility = round((ai_hits / len(ai_pairs)) * 100) if ai_pairs else 0
            comp_stats.append({
                "id": c["id"],
                "handle": c["handle"],
                "platform": c["platform"],
                "url": c.get("url", ""),
                "posts_30d": len(recent),
                "engagement_30d": _eng(recent),
                "ai_visibility": ai_visibility,
                "posts_per_week": round(len(recent) / 4.0, 1) if recent else 0,
            })

        # ---- LLM perception pass (one call per scope: brand+all competitors) ----
        client = await db.clients.find_one({"id": cid}, {"_id": 0})
        company = (client or {}).get("company") or (client or {}).get("name", "the brand")
        comp_lines = "\n".join(
            f"- {c['handle']} (platform={c['platform']}, posts/30d={c['posts_30d']}, "
            f"engagement={c['engagement_30d']}, ai_visibility={c['ai_visibility']}%)"
            for c in comp_stats
        )
        prompt = f"""
For {company} and each competitor below, score (0-100) on TWO axes:
  brand_perception: how strong their brand authority appears in public conversation
  sentiment: how positively people speak about them

Return ONLY this JSON, no prose:
{{
  "you": {{ "brand_perception": <0-100>, "sentiment": <0-100>, "summary": "1 sentence" }},
  "competitors": [
    {{ "handle": "...", "brand_perception": <0-100>, "sentiment": <0-100>, "summary": "1 sentence" }}
  ]
}}

Competitors:
{comp_lines}
"""
        text = await ask_engine(
            "claude-sonnet-4.5",
            "You are a brand analyst. Output ONLY valid JSON.",
            prompt,
            session_id=f"comp-scores-{cid}",
        )
        parsed = _parse_json(text) or {}
        you_perception = parsed.get("you", {}) if isinstance(parsed.get("you"), dict) else {}

        # ---- Your composite score (reuse dashboard math approximations) ----
        own_recent = [p for p in own_posts if _parse_dt(p["posted_at"]) >= cutoff_30]
        own_channels_count = await db.channels.count_documents({"client_id": cid})
        latest_pairs = {}
        for r in geo_results:
            k = f"{r['query_id']}::{r['engine']}"
            if k not in latest_pairs:
                latest_pairs[k] = r
        own_ai_hits = sum(1 for r in latest_pairs.values() if r.get("mentioned"))
        own_ai = round((own_ai_hits / len(latest_pairs)) * 100) if latest_pairs else 0
        own_brand_score = _clamp(
            min(40, own_channels_count * 8)
            + min(30, len(own_recent) * 1.5)
            + own_ai * 0.3,
            0, 100,
        )
        own_sentiment_score = (own_sentiment or {}).get("score", you_perception.get("sentiment") or 0)

        you = {
            "brand_score": own_brand_score,
            "ai_visibility": own_ai,
            "sentiment": own_sentiment_score,
            "posts_30d": len(own_recent),
            "engagement_30d": _eng(own_recent),
            "perception": _clamp(you_perception.get("brand_perception") or own_brand_score, 0, 100),
            "summary": you_perception.get("summary", ""),
        }

        comp_perception = {
            (p.get("handle") or ""): p
            for p in (parsed.get("competitors") or [])
            if isinstance(p, dict)
        }
        for c in comp_stats:
            pc = comp_perception.get(c["handle"]) or {}
            c["perception"] = _clamp(pc.get("brand_perception") or 50, 0, 100)
            c["sentiment"] = _clamp(pc.get("sentiment") or 50, 0, 100)
            # composite brand score for the competitor: blend cadence + engagement + AI + perception
            cad = min(40, c["posts_30d"] * 4)
            eng = min(30, c["engagement_30d"] / 50)
            ai = c["ai_visibility"] * 0.15
            per = c["perception"] * 0.15
            c["brand_score"] = _clamp(cad + eng + ai + per, 0, 100)
            c["summary"] = pc.get("summary", "")

        # ---- Gap analysis ----
        best = {"brand_score": max([c["brand_score"] for c in comp_stats] or [0]),
                "ai_visibility": max([c["ai_visibility"] for c in comp_stats] or [0]),
                "sentiment": max([c["sentiment"] for c in comp_stats] or [0]),
                "posts_30d": max([c["posts_30d"] for c in comp_stats] or [0]),
                "engagement_30d": max([c["engagement_30d"] for c in comp_stats] or [0])}

        def _gap_priority(gap_pct: float) -> str:
            if gap_pct >= 50:
                return "High"
            if gap_pct >= 20:
                return "Medium"
            return "Low"

        gaps = []
        for area, you_val, best_val, why_template in [
            ("AI visibility", you["ai_visibility"], best["ai_visibility"],
             "Competitors are surfacing in {best}% of LLM answers — your {you}% leaves a clear void."),
            ("Brand score", you["brand_score"], best["brand_score"],
             "The leading competitor sits at {best}/100 vs your {you}/100 in overall presence."),
            ("Posting cadence (30d)", you["posts_30d"], best["posts_30d"],
             "Top competitor pushed {best} posts in the last 30 days, you pushed {you}."),
            ("Engagement (30d)", you["engagement_30d"], best["engagement_30d"],
             "Top competitor banked {best} reactions, you banked {you}."),
            ("Sentiment", you["sentiment"], best["sentiment"],
             "Market sentiment toward the leader scores {best}/100 vs your {you}/100."),
        ]:
            gap = max(0, best_val - you_val)
            if best_val <= 0:
                continue
            gap_pct = (gap / max(1, best_val)) * 100
            if gap <= 0:
                continue
            gaps.append({
                "area": area,
                "you": you_val,
                "best": best_val,
                "gap": round(gap, 1),
                "priority": _gap_priority(gap_pct),
                "rationale": why_template.format(you=you_val, best=best_val),
            })
        gaps.sort(key=lambda g: g["gap"], reverse=True)

        doc = {
            "client_id": cid,
            "you": you,
            "competitors": comp_stats,
            "biggest_gaps": gaps[:6],
            "updated_at": _now_iso(),
        }
        await db.competitor_scores.replace_one({"client_id": cid}, doc, upsert=True)
        doc.pop("_id", None)
        return doc

    @router.get("/competitors/scores")
    async def get_competitor_scores(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        cid = await _resolve_scope(db, user, client_id)
        doc = await db.competitor_scores.find_one({"client_id": cid}, {"_id": 0})
        if not doc:
            return {"competitors": [], "you": None, "biggest_gaps": [], "updated_at": None}
        return doc

    # ==================================================================
    # Content plan
    # ==================================================================
    @router.post("/content-plan/generate")
    async def generate_content_plan(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        cid = await _resolve_scope(db, user, client_id)
        client = await db.clients.find_one({"id": cid}, {"_id": 0})
        company = (client or {}).get("company") or (client or {}).get("name", "the brand")
        own_posts = await db.posts.find({"client_id": cid}, {"_id": 0}).sort("posted_at", -1).to_list(40)
        competitors = await db.competitors.find({"client_id": cid}, {"_id": 0}).to_list(20)
        comp_posts = await db.competitor_posts.find({"client_id": cid}, {"_id": 0}).sort("posted_at", -1).to_list(80)
        channels = await db.channels.find({"client_id": cid}, {"_id": 0}).to_list(50)

        you_sample = "\n".join(
            f"- [{p.get('platform')}] {(p.get('title') or p.get('snippet') or '')[:140]}"
            for p in own_posts[:20]
        ) or "(no posts yet)"
        comp_sample = "\n".join(
            f"- [{p.get('platform')}] {(p.get('title') or p.get('snippet') or '')[:140]}"
            for p in comp_posts[:30]
        ) or "(no competitor posts captured yet)"
        channels_summary = ", ".join(f"{c['platform']}@{c.get('handle','')}" for c in channels) or "(no channels yet)"

        prompt = f"""
Brand: {company}
Active channels: {channels_summary}
Recent own posts:
{you_sample}

Competitor posts we observed:
{comp_sample}

You are a content strategist. Build a JSON plan in EXACTLY this shape:

{{
  "content_gaps": [
    {{
      "topic": "short topic name",
      "competitor_handle": "who is winning here",
      "rationale": "1-2 sentence why it matters",
      "priority": "High" | "Medium" | "Low",
      "priority_reason": "1 sentence why this priority level"
    }}
  ],
  "blog_topics": [
    {{
      "title": "SEO-ready blog title (under 70 chars)",
      "angle": "1 sentence angle",
      "target_keyword": "long-tail keyword",
      "priority": "High" | "Medium" | "Low"
    }}
  ],
  "weekly_plan": {{
    "week_label": "This week",
    "reels_shorts": [
      {{"title": "...", "hook": "first 3s hook", "cta": "...", "platform": "Instagram|YouTube Shorts|TikTok"}}
    ],
    "paid_ads": [
      {{"platform": "Meta|Google|LinkedIn", "concept": "ad concept", "audience": "who", "budget_band": "INR 5k-10k / day"}}
    ],
    "longform": [
      {{"platform": "Blog|LinkedIn|YouTube", "topic": "...", "format": "Listicle|How-to|Case study"}}
    ],
    "outreach": [
      {{"action": "...", "target": "who to pitch", "channel": "Email|DM|Podcast"}}
    ]
  }}
}}

Rules:
- 5-8 content gaps, ranked by priority.
- 6 blog topics.
- weekly_plan: 3 reels/shorts, 2 paid ads, 2 longform, 2 outreach.
- Be specific to the brand and India-focused unless context says otherwise.
- Prefer ideas that close gaps versus competitors.
"""
        text = await ask_engine(
            "claude-sonnet-4.5",
            "You are a content strategist. Output ONLY valid JSON.",
            prompt,
            session_id=f"content-plan-{cid}",
        )
        parsed = _parse_json(text) or {}
        doc = {
            "client_id": cid,
            "content_gaps": parsed.get("content_gaps") or [],
            "blog_topics": parsed.get("blog_topics") or [],
            "weekly_plan": parsed.get("weekly_plan") or {},
            "raw": text[:8000],
            "updated_at": _now_iso(),
        }
        await db.content_plans_v2.replace_one({"client_id": cid}, doc, upsert=True)
        doc.pop("_id", None)
        return doc

    @router.get("/content-plan")
    async def get_content_plan(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        cid = await _resolve_scope(db, user, client_id)
        doc = await db.content_plans_v2.find_one({"client_id": cid}, {"_id": 0})
        return doc or {"content_gaps": [], "blog_topics": [], "weekly_plan": {}, "updated_at": None}

    # ==================================================================
    # Sentiment deep dive
    # ==================================================================
    @router.post("/sentiment/deep")
    async def deep_sentiment(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        cid = await _resolve_scope(db, user, client_id)
        client = await db.clients.find_one({"id": cid}, {"_id": 0})
        company = (client or {}).get("company") or (client or {}).get("name", "the brand")
        posts = await db.posts.find({"client_id": cid}, {"_id": 0}).sort("posted_at", -1).to_list(60)
        channels = await db.channels.find({"client_id": cid}, {"_id": 0}).to_list(50)
        if not posts:
            return {"overall_score": 0, "by_platform": [], "key_themes": [], "action_plan": [], "ready": False}

        sample = "\n".join(
            f"- [{p['platform']}] {(p.get('title') or '')[:120]} :: {(p.get('snippet') or '')[:200]}"
            for p in posts[:40]
        )
        prompt = f"""
Brand: {company}
Recent posts (proxies for public conversation):
{sample}

Output ONLY this JSON:
{{
  "overall_score": <0-100>,
  "by_platform": [
    {{"platform": "youtube|instagram|linkedin|blog|reddit|twitter|google_reviews",
      "score": <0-100>,
      "sample_size": <int>,
      "summary": "1 sentence"}}
  ],
  "key_themes": [
    {{"theme": "short theme name",
      "sentiment": "Positive|Neutral|Negative",
      "weight": "High|Medium|Low",
      "quote": "representative paraphrased quote",
      "rationale": "1 sentence why this theme is showing up"}}
  ],
  "action_plan": [
    {{"priority": "High|Medium|Low",
      "title": "short action title",
      "description": "2-3 sentence specific action",
      "timeframe": "Week 1|Month 1|Month 1-2|Ongoing"}}
  ]
}}

Rules:
- Include 1 entry per platform we see in the posts.
- 4-6 key themes.
- 5-7 action items, sorted by priority.
- Be specific. Reference the platforms or themes in each action.
"""
        text = await ask_engine(
            "claude-sonnet-4.5",
            "You are a customer-sentiment analyst. Output ONLY valid JSON.",
            prompt,
            session_id=f"sent-deep-{cid}",
        )
        parsed = _parse_json(text) or {}
        doc = {
            "client_id": cid,
            "overall_score": _clamp(parsed.get("overall_score") or 50, 0, 100),
            "by_platform": parsed.get("by_platform") or [],
            "key_themes": parsed.get("key_themes") or [],
            "action_plan": parsed.get("action_plan") or [],
            "raw": text[:8000],
            "updated_at": _now_iso(),
        }
        await db.sentiment_deep.replace_one({"client_id": cid}, doc, upsert=True)
        doc.pop("_id", None)
        return doc

    @router.get("/sentiment/deep")
    async def get_deep_sentiment(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        cid = await _resolve_scope(db, user, client_id)
        doc = await db.sentiment_deep.find_one({"client_id": cid}, {"_id": 0})
        if not doc:
            return {"overall_score": 0, "by_platform": [], "key_themes": [], "action_plan": [], "ready": False, "updated_at": None}
        return {**doc, "ready": True}

    # ==================================================================
    # AI Action Plan (ranking on LLM engines)
    # ==================================================================
    @router.post("/ai-action-plan/generate")
    async def generate_ai_plan(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        cid = await _resolve_scope(db, user, client_id)
        client = await db.clients.find_one({"id": cid}, {"_id": 0})
        company = (client or {}).get("company") or (client or {}).get("name", "the brand")
        geo_results = await db.geo_results.find({"client_id": cid}, {"_id": 0}).to_list(2000)
        queries = await db.geo_queries.find({"client_id": cid}, {"_id": 0}).to_list(50)
        competitors = await db.competitors.find({"client_id": cid}, {"_id": 0}).to_list(20)

        latest_pairs = {}
        for r in geo_results:
            k = f"{r['query_id']}::{r['engine']}"
            if k not in latest_pairs:
                latest_pairs[k] = r
        hit_pairs = [r for r in latest_pairs.values() if r.get("mentioned")]
        miss_pairs = [r for r in latest_pairs.values() if not r.get("mentioned")]
        comp_mentions = []
        for r in latest_pairs.values():
            comp_mentions.extend(r.get("competitor_mentions") or [])
        comp_counter: dict[str, int] = {}
        for h in comp_mentions:
            comp_counter[h] = comp_counter.get(h, 0) + 1
        top_comps = sorted(comp_counter.items(), key=lambda x: x[1], reverse=True)[:5]

        prompt = f"""
Brand: {company}
Tracked queries: {", ".join((q['query'] for q in queries[:20])) or "(none yet)"}
Engines we test: GPT-5.2, Claude Sonnet 4.5, Gemini 3 Flash
Current AI surface stats:
- Total query·engine pairs scanned: {len(latest_pairs)}
- Pairs where brand IS mentioned: {len(hit_pairs)}
- Pairs where brand is NOT mentioned: {len(miss_pairs)}
- Competitors surfacing instead (top 5): {", ".join(f"{h}({n})" for h,n in top_comps) or "none"}

You are a Generative Engine Optimisation strategist.
Produce STRICT JSON in this shape, no prose:

{{
  "current_state": "1 sentence diagnosis of where we are",
  "target_state": "1 sentence concrete goal (e.g. 60% mention rate across all 3 engines in 6 months)",
  "estimated_months": <int 1-12>,
  "recommendations": [
    {{
      "priority": "High|Medium|Low",
      "title": "short action title",
      "description": "2-3 sentence specific action",
      "engines_affected": ["gpt-5.2","claude-sonnet-4.5","gemini-3-flash"],
      "effort": "Low|Medium|High",
      "timeframe": "Week 1-2|Month 1|Month 1-2|Month 2-3|Ongoing"
    }}
  ],
  "timeline": [
    {{"month": 1, "milestone": "..."}},
    {{"month": 2, "milestone": "..."}},
    {{"month": 3, "milestone": "..."}}
  ]
}}

Rules:
- 7-9 recommendations, ranked High → Low.
- Focus on tactics that move LLM citation surfaces: Wikipedia presence, Reddit/Quora authority, listicles on high-DA sites, schema markup, expert quotes, podcast guesting, Substack/Medium presence.
- Timeline must have one milestone per month from 1 through estimated_months (max 6).
"""
        text = await ask_engine(
            "claude-sonnet-4.5",
            "You are a GEO strategist. Output ONLY valid JSON.",
            prompt,
            session_id=f"ai-plan-{cid}",
        )
        parsed = _parse_json(text) or {}
        doc = {
            "client_id": cid,
            "current_state": str(parsed.get("current_state") or ""),
            "target_state": str(parsed.get("target_state") or ""),
            "estimated_months": _clamp(parsed.get("estimated_months") or 6, 1, 12),
            "recommendations": parsed.get("recommendations") or [],
            "timeline": parsed.get("timeline") or [],
            "stats": {
                "scanned": len(latest_pairs),
                "hits": len(hit_pairs),
                "misses": len(miss_pairs),
                "top_competitors": [{"handle": h, "mentions": n} for h, n in top_comps],
            },
            "raw": text[:8000],
            "updated_at": _now_iso(),
        }
        await db.ai_action_plan.replace_one({"client_id": cid}, doc, upsert=True)
        doc.pop("_id", None)
        return doc

    @router.get("/ai-action-plan")
    async def get_ai_plan(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
        cid = await _resolve_scope(db, user, client_id)
        doc = await db.ai_action_plan.find_one({"client_id": cid}, {"_id": 0})
        return doc or {"current_state": "", "target_state": "", "recommendations": [], "timeline": [], "stats": {}, "updated_at": None}

    return router


def get_strategy_router(db):
    return _build_competitor_router(db)
