"""Pixelgrok Pulse - FastAPI backend."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import APIRouter, FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from auth import (
    clear_auth_cookies,
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    require_admin,
    set_auth_cookies,
    verify_password,
)
from integrations import fetch_og_metadata, fetch_reddit, fetch_rss, fetch_youtube, google_search_rank
from llm_service import ENGINES, ask_engine, detect_mentions, extract_competitor_mentions
from models import (
    AUTO_PLATFORMS,
    Channel,
    ChannelIn,
    ClientAccount,
    Competitor,
    CompetitorIn,
    CompetitorPost,
    CompetitorPostIn,
    CreateClientIn,
    GeoQuery,
    GeoQueryIn,
    GeoRecommendation,
    GeoResult,
    LoginIn,
    Post,
    PostIn,
    Recommendation,
    SeoKeyword,
    SeoKeywordIn,
    SeoRank,
    SeoRankIn,
    User,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("pixelgrok")

# ---------- DB ----------
mongo_url = os.environ["MONGO_URL"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ["DB_NAME"]]

# ---------- App ----------
app = FastAPI(title="Pixelgrok Pulse")
api = APIRouter(prefix="/api")


@app.on_event("startup")
async def _startup() -> None:
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("email", unique=True)
    await db.channels.create_index([("client_id", 1), ("platform", 1)])
    await db.posts.create_index([("client_id", 1), ("posted_at", -1)])
    await db.competitor_posts.create_index([("client_id", 1), ("posted_at", -1)])
    await db.geo_results.create_index([("client_id", 1), ("ran_at", -1)])
    await db.seo_ranks.create_index([("client_id", 1), ("recorded_at", -1)])

    # Seed admin from .env
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_password:
        existing = await db.users.find_one({"email": admin_email})
        if existing is None:
            user = User(email=admin_email, name="Pixelgrok Admin", role="admin")
            doc = user.model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            doc["password_hash"] = hash_password(admin_password)
            await db.users.insert_one(doc)
            log.info("Seeded admin user %s", admin_email)
        else:
            # keep hash in sync with .env to support password rotation
            if not verify_password(admin_password, existing.get("password_hash", "")):
                await db.users.update_one(
                    {"email": admin_email},
                    {"$set": {"password_hash": hash_password(admin_password)}},
                )

    # Seed Pixelgrok client workspace (their own brand) + a starter channel set
    # so they can analyse pixelgrok.com from day one.
    pg_email = "pulse@pixelgrok.com"
    pg_existing = await db.clients.find_one({"email": pg_email})
    if pg_existing is None:
        pg_client = ClientAccount(
            name="Pixelgrok",
            company="Pixelgrok Media",
            email=pg_email,
        )
        cdoc = pg_client.model_dump()
        cdoc["created_at"] = cdoc["created_at"].isoformat()
        await db.clients.insert_one(cdoc)
        pg_user = User(
            email=pg_email,
            name="Pixelgrok",
            role="client",
            client_id=pg_client.id,
        )
        udoc = pg_user.model_dump()
        udoc["created_at"] = udoc["created_at"].isoformat()
        udoc["password_hash"] = hash_password("Pulse@2026")
        await db.users.insert_one(udoc)
        # starter channels — handles can be edited by admin/client later
        starter_channels = [
            ("blog", "pixelgrok.com", "https://pixelgrok.com/feed"),
            ("youtube", "@pixelgrok", ""),
            ("linkedin_company", "pixelgrok-media", "https://www.linkedin.com/company/pixelgrok-media/"),
            ("instagram", "pixelgrok", "https://instagram.com/pixelgrok"),
            ("twitter", "pixelgrok", "https://x.com/pixelgrok"),
        ]
        for platform, handle, url in starter_channels:
            ch = Channel(
                client_id=pg_client.id,
                platform=platform,
                handle=handle,
                url=url,
                sync_mode="auto" if platform in AUTO_PLATFORMS else "manual",
                status="pending",
            )
            doc = ch.model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            await db.channels.insert_one(doc)
        log.info("Seeded Pixelgrok client workspace (%s) with 5 starter channels", pg_client.id)

    # Write test credentials
    try:
        creds_dir = Path("/app/memory")
        creds_dir.mkdir(parents=True, exist_ok=True)
        (creds_dir / "test_credentials.md").write_text(
            "# Pixelgrok Pulse Test Credentials\n\n"
            f"## Admin\n- Email: `{admin_email}`\n- Password: `{admin_password}`\n- Role: admin\n\n"
            "## Auth endpoints\n- POST `/api/auth/login`\n- GET `/api/auth/me`\n- POST `/api/auth/logout`\n"
        )
    except Exception as exc:
        log.warning("Couldn't write test_credentials.md: %s", exc)


@app.on_event("shutdown")
async def _shutdown() -> None:
    mongo_client.close()


# ---------- helpers ----------
def _dt(value) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


async def _client_scope(user: dict, client_id: Optional[str] = None) -> str:
    """Resolve which client_id a request should be scoped to.
    Admins can pass `?client_id=` query; clients are pinned to their own."""
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


# ====================================================
# AUTH
# ====================================================
@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    # If a client, ensure client account is active
    if user["role"] == "client" and user.get("client_id"):
        client = await db.clients.find_one({"id": user["client_id"]}, {"_id": 0})
        if client and not client.get("is_active", True):
            raise HTTPException(status_code=403, detail="Client workspace is disabled")
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"user": user, "access_token": access}


@api.post("/auth/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    if user.get("client_id"):
        client = await db.clients.find_one({"id": user["client_id"]}, {"_id": 0})
        user["client"] = client
    return user


# ====================================================
# ADMIN: client management
# ====================================================
@api.get("/admin/clients")
async def list_clients(_: dict = Depends(require_admin)):
    docs = await db.clients.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # attach user email
    return docs


@api.post("/admin/clients")
async def create_client(payload: CreateClientIn, _: dict = Depends(require_admin)):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    client = ClientAccount(name=payload.name, company=payload.company, email=email)
    cdoc = client.model_dump()
    cdoc["created_at"] = cdoc["created_at"].isoformat()
    await db.clients.insert_one(cdoc)
    # create the linked user
    user = User(email=email, name=payload.name, role="client", client_id=client.id)
    udoc = user.model_dump()
    udoc["created_at"] = udoc["created_at"].isoformat()
    udoc["password_hash"] = hash_password(payload.password)
    await db.users.insert_one(udoc)
    cdoc.pop("_id", None)
    return cdoc


@api.patch("/admin/clients/{client_id}/toggle")
async def toggle_client(client_id: str, _: dict = Depends(require_admin)):
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    new_state = not c.get("is_active", True)
    await db.clients.update_one({"id": client_id}, {"$set": {"is_active": new_state}})
    await db.users.update_many({"client_id": client_id}, {"$set": {"is_active": new_state}})
    c["is_active"] = new_state
    return c


@api.delete("/admin/clients/{client_id}")
async def delete_client(client_id: str, _: dict = Depends(require_admin)):
    res = await db.clients.delete_one({"id": client_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.users.delete_many({"client_id": client_id})
    await db.channels.delete_many({"client_id": client_id})
    await db.posts.delete_many({"client_id": client_id})
    await db.competitors.delete_many({"client_id": client_id})
    await db.competitor_posts.delete_many({"client_id": client_id})
    await db.geo_queries.delete_many({"client_id": client_id})
    await db.geo_results.delete_many({"client_id": client_id})
    await db.seo_keywords.delete_many({"client_id": client_id})
    await db.seo_ranks.delete_many({"client_id": client_id})
    return {"ok": True}


# ====================================================
# CHANNELS
# ====================================================
@api.get("/channels")
async def list_channels(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    return await db.channels.find({"client_id": cid}, {"_id": 0}).to_list(200)


@api.post("/channels")
async def create_channel(payload: ChannelIn, client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    ch = Channel(
        client_id=cid,
        platform=payload.platform,
        handle=payload.handle,
        url=payload.url,
        sync_mode="auto" if payload.platform in AUTO_PLATFORMS else "manual",
        status="pending",
    )
    # Best-effort fetch of OpenGraph metadata for the URL so manual-entry
    # channels (LinkedIn, Instagram, X, Pinterest, custom) at least have a
    # name, headline and profile picture cached.
    meta_url = payload.url or ""
    if not meta_url and payload.platform.startswith("linkedin") and payload.handle:
        meta_url = f"https://www.linkedin.com/in/{payload.handle.lstrip('/').replace('in/', '')}"
    og = fetch_og_metadata(meta_url) if meta_url else {}
    if og and any(og.values()):
        ch.status = "metadata"  # profile metadata cached, but no posts yet
    doc = ch.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if og:
        doc["og"] = og
    await db.channels.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/channels/{channel_id}")
async def delete_channel(channel_id: str, user: dict = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if user["role"] != "admin" and ch["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.channels.delete_one({"id": channel_id})
    await db.posts.delete_many({"channel_id": channel_id})
    return {"ok": True}


# ====================================================
# POSTS (own channel)
# ====================================================
@api.get("/posts")
async def list_posts(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    return await db.posts.find({"client_id": cid}, {"_id": 0}).sort("posted_at", -1).to_list(500)


@api.post("/posts")
async def create_post(payload: PostIn, client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    ch = await db.channels.find_one({"id": payload.channel_id, "client_id": cid}, {"_id": 0})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    post = Post(
        client_id=cid,
        platform=ch["platform"],
        source="manual",
        **payload.model_dump(),
    )
    doc = post.model_dump()
    doc["posted_at"] = _dt(doc["posted_at"])
    doc["created_at"] = _dt(doc["created_at"])
    await db.posts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/posts/{post_id}")
async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if user["role"] != "admin" and post["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.posts.delete_one({"id": post_id})
    return {"ok": True}


# ====================================================
# SYNC (auto-pull)
# ====================================================
@api.post("/sync/channel/{channel_id}")
async def sync_channel(channel_id: str, user: dict = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if user["role"] != "admin" and ch["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    platform = ch["platform"]
    posts, is_real = [], False
    if platform == "youtube":
        posts, is_real = fetch_youtube(ch.get("handle") or ch.get("url", ""))
    elif platform in {"medium", "substack", "blog"}:
        posts, is_real = fetch_rss(ch.get("url") or ch.get("handle", ""))
    elif platform == "reddit":
        posts, is_real = fetch_reddit(ch.get("handle") or "")
    else:
        raise HTTPException(status_code=400, detail=f"Auto sync not available for {platform}")

    # wipe previous auto posts for the channel, keep manual ones
    await db.posts.delete_many({"channel_id": channel_id, "source": "auto"})
    inserted = 0
    for p in posts:
        post = Post(
            client_id=ch["client_id"],
            platform=platform,
            channel_id=channel_id,
            source="auto" if is_real else "mock",
            title=p.get("title", ""),
            snippet=p.get("snippet", ""),
            url=p.get("url", ""),
            posted_at=datetime.fromisoformat(p["posted_at"].replace("Z", "+00:00")) if isinstance(p["posted_at"], str) else p["posted_at"],
            likes=p.get("likes", 0),
            comments=p.get("comments", 0),
            shares=p.get("shares", 0),
            views=p.get("views", 0),
            media_type=p.get("media_type", "text"),
            hashtags=p.get("hashtags", []),
        )
        doc = post.model_dump()
        doc["posted_at"] = _dt(doc["posted_at"])
        doc["created_at"] = _dt(doc["created_at"])
        await db.posts.insert_one(doc)
        inserted += 1

    now = datetime.now(timezone.utc).isoformat()
    await db.channels.update_one(
        {"id": channel_id},
        {"$set": {"last_sync": now, "status": "connected" if is_real else "mocked"}},
    )
    return {"inserted": inserted, "is_real": is_real, "status": "connected" if is_real else "mocked"}


# ====================================================
# COMPETITORS
# ====================================================
@api.get("/competitors")
async def list_competitors(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    return await db.competitors.find({"client_id": cid}, {"_id": 0}).to_list(200)


@api.post("/competitors")
async def create_competitor(payload: CompetitorIn, client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    count = await db.competitors.count_documents({"client_id": cid, "platform": payload.platform})
    if count >= 5:
        raise HTTPException(status_code=400, detail="Max 5 competitors per platform")
    comp = Competitor(client_id=cid, **payload.model_dump())
    doc = comp.model_dump()
    doc["created_at"] = _dt(doc["created_at"])
    await db.competitors.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/competitors/{competitor_id}")
async def delete_competitor(competitor_id: str, user: dict = Depends(get_current_user)):
    comp = await db.competitors.find_one({"id": competitor_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and comp["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.competitors.delete_one({"id": competitor_id})
    await db.competitor_posts.delete_many({"competitor_id": competitor_id})
    return {"ok": True}


@api.post("/competitors/{competitor_id}/sync")
async def sync_competitor(competitor_id: str, user: dict = Depends(get_current_user)):
    comp = await db.competitors.find_one({"id": competitor_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and comp["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    platform = comp["platform"]
    posts, is_real = [], False
    if platform == "youtube":
        posts, is_real = fetch_youtube(comp.get("handle") or comp.get("url", ""))
    elif platform in {"medium", "substack", "blog"}:
        posts, is_real = fetch_rss(comp.get("url") or comp.get("handle", ""))
    elif platform == "reddit":
        posts, is_real = fetch_reddit(comp.get("handle") or "")
    else:
        raise HTTPException(status_code=400, detail=f"Auto sync not available for {platform}")

    await db.competitor_posts.delete_many({"competitor_id": competitor_id})
    for p in posts:
        cp = CompetitorPost(
            client_id=comp["client_id"],
            platform=platform,
            competitor_id=competitor_id,
            source="auto" if is_real else "mock",
            title=p.get("title", ""),
            snippet=p.get("snippet", ""),
            url=p.get("url", ""),
            posted_at=datetime.fromisoformat(p["posted_at"].replace("Z", "+00:00")) if isinstance(p["posted_at"], str) else p["posted_at"],
            likes=p.get("likes", 0),
            comments=p.get("comments", 0),
            shares=p.get("shares", 0),
            views=p.get("views", 0),
            media_type=p.get("media_type", "text"),
            hashtags=p.get("hashtags", []),
        )
        doc = cp.model_dump()
        doc["posted_at"] = _dt(doc["posted_at"])
        doc["created_at"] = _dt(doc["created_at"])
        await db.competitor_posts.insert_one(doc)

    return {"inserted": len(posts), "is_real": is_real}


@api.get("/competitors/{competitor_id}/posts")
async def list_competitor_posts(competitor_id: str, user: dict = Depends(get_current_user)):
    comp = await db.competitors.find_one({"id": competitor_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and comp["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    return await db.competitor_posts.find({"competitor_id": competitor_id}, {"_id": 0}).sort("posted_at", -1).to_list(200)


@api.post("/competitors/{competitor_id}/manual-snapshot")
async def add_manual_competitor_post(competitor_id: str, payload: CompetitorPostIn, user: dict = Depends(get_current_user)):
    comp = await db.competitors.find_one({"id": competitor_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and comp["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    cp = CompetitorPost(
        client_id=comp["client_id"],
        platform=comp["platform"],
        source="manual",
        **payload.model_dump(),
    )
    doc = cp.model_dump()
    doc["posted_at"] = _dt(doc["posted_at"])
    doc["created_at"] = _dt(doc["created_at"])
    await db.competitor_posts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/competitors/{competitor_id}/cluster")
async def cluster_topics(competitor_id: str, user: dict = Depends(get_current_user)):
    comp = await db.competitors.find_one({"id": competitor_id}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and comp["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    posts = await db.competitor_posts.find({"competitor_id": competitor_id}, {"_id": 0, "title": 1, "snippet": 1}).to_list(60)
    if not posts:
        return {"clusters": [], "note": "No posts to cluster yet."}
    titles = "\n".join(f"- {p.get('title') or p.get('snippet','')[:120]}" for p in posts[:50])
    prompt = (
        "Cluster the following social/blog post titles into 4-7 themes. "
        "Return ONLY a short numbered list like '1. Theme name — short description'.\n\n"
        f"{titles}"
    )
    text = await ask_engine(
        "claude-sonnet-4.5",
        "You are a brand analytics assistant for a media agency.",
        prompt,
        session_id=f"cluster-{competitor_id}",
    )
    return {"clusters_text": text, "post_count": len(posts)}


# ====================================================
# GEO mention tracker
# ====================================================
@api.get("/geo/queries")
async def list_geo_queries(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    return await db.geo_queries.find({"client_id": cid}, {"_id": 0}).to_list(100)


@api.post("/geo/queries")
async def create_geo_query(payload: GeoQueryIn, client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    q = GeoQuery(client_id=cid, query=payload.query, brand_terms=payload.brand_terms)
    doc = q.model_dump()
    doc["created_at"] = _dt(doc["created_at"])
    await db.geo_queries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/geo/queries/{query_id}")
async def delete_geo_query(query_id: str, user: dict = Depends(get_current_user)):
    q = await db.geo_queries.find_one({"id": query_id}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and q["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.geo_queries.delete_one({"id": query_id})
    return {"ok": True}


class GeoScanIn(BaseModel):
    query_ids: Optional[List[str]] = None
    engines: Optional[List[str]] = None  # subset of ENGINES.keys()


@api.post("/geo/scan")
async def run_geo_scan(payload: GeoScanIn, client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    queries_q = {"client_id": cid}
    if payload.query_ids:
        queries_q["id"] = {"$in": payload.query_ids}
    queries = await db.geo_queries.find(queries_q, {"_id": 0}).to_list(50)
    if not queries:
        raise HTTPException(status_code=400, detail="No queries to scan")

    engines = payload.engines or list(ENGINES.keys())
    competitors = await db.competitors.find({"client_id": cid}, {"_id": 0}).to_list(100)
    competitor_handles = [c["handle"] for c in competitors]

    import asyncio

    async def _run(q: dict, engine: str) -> dict:
        try:
            text = await asyncio.wait_for(
                ask_engine(
                    engine,
                    "You are an unbiased general-knowledge assistant. Answer concisely.",
                    q["query"],
                    session_id=f"geo-{cid}-{q['id']}-{engine}",
                ),
                timeout=40,
            )
            error = None
        except Exception as exc:
            log.warning("Engine %s failed: %s", engine, exc)
            text = ""
            error = str(exc)
        mentioned = detect_mentions(text, q.get("brand_terms", []))
        comp_hits = extract_competitor_mentions(text, competitor_handles)
        r = GeoResult(
            client_id=cid,
            query_id=q["id"],
            query=q["query"],
            engine=engine,
            response=text[:4000] if not error else f"[ERROR] {error}",
            mentioned=mentioned,
            competitor_mentions=comp_hits,
        )
        doc = r.model_dump()
        doc["ran_at"] = _dt(doc["ran_at"])
        await db.geo_results.insert_one(doc)
        doc.pop("_id", None)
        doc["error"] = error
        return doc

    tasks = [_run(q, engine) for q in queries for engine in engines]
    results = await asyncio.gather(*tasks)
    failed = [r["engine"] for r in results if r.get("error")]
    return {"results": results, "count": len(results), "failed_engines": failed}


@api.get("/geo/results")
async def list_geo_results(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    return await db.geo_results.find({"client_id": cid}, {"_id": 0}).sort("ran_at", -1).to_list(500)


# ---- Action plans (LLM, structured JSON) ----
import json as _json
import re as _re


def _parse_plan_json(text: str) -> dict | None:
    """Try hard to extract the JSON object the LLM emitted."""
    if not text:
        return None
    # strip code fences
    cleaned = _re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=_re.MULTILINE).strip()
    try:
        return _json.loads(cleaned)
    except Exception:
        pass
    # last-ditch: grab the largest {...} block
    m = _re.search(r"\{[\s\S]*\}", cleaned)
    if not m:
        return None
    try:
        return _json.loads(m.group(0))
    except Exception:
        return None


@api.post("/geo/recommendations/{query_id}")
async def generate_geo_plan(query_id: str, client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    q = await db.geo_queries.find_one({"id": query_id, "client_id": cid}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Query not found")

    # gather context: latest scan results per engine + competitors mentioned
    results = await db.geo_results.find(
        {"client_id": cid, "query_id": query_id}, {"_id": 0}
    ).sort("ran_at", -1).to_list(30)
    latest_by_engine: dict[str, dict] = {}
    for r in results:
        if r["engine"] not in latest_by_engine:
            latest_by_engine[r["engine"]] = r
    competitors = await db.competitors.find({"client_id": cid}, {"_id": 0}).to_list(100)
    client = await db.clients.find_one({"id": cid}, {"_id": 0})

    mention_summary = []
    competitor_hits: list[str] = []
    for engine, r in latest_by_engine.items():
        mention_summary.append(
            f"- {engine}: {'MENTIONED' if r['mentioned'] else 'NOT MENTIONED'} brand "
            f"(competitors surfaced: {', '.join(r.get('competitor_mentions') or []) or 'none'})"
        )
        competitor_hits.extend(r.get("competitor_mentions") or [])

    competitor_handles = [c["handle"] for c in competitors]
    company = (client or {}).get("company") or (client or {}).get("name", "the brand")

    system = (
        "You are a Generative Engine Optimisation (GEO) strategist. "
        "You output ONLY valid JSON. No prose before or after."
    )
    user_prompt = f"""
Brand: {company}
Brand terms tracked: {", ".join(q.get("brand_terms", [])) or "(none)"}
Target GEO query: "{q["query"]}"
Latest engine snapshot:
{chr(10).join(mention_summary) or "- (no scans yet — assume brand is not appearing)"}
Competitors being mentioned by engines / tracked: {", ".join(set(competitor_hits + competitor_handles)) or "(none provided)"}

Produce a JSON object EXACTLY in this shape, no extra keys:

{{
  "summary": "2-3 sentence diagnosis of why the brand is or isn't surfacing for this query and what the realistic path looks like",
  "estimated_months": <integer 1-12 — realistic time-to-first-mention if the plan is followed>,
  "confidence": "Low" | "Medium" | "High",
  "actions": [
    {{
      "title": "Short action title (max 8 words)",
      "rationale": "1-2 sentences on why this moves the needle for GEO specifically",
      "effort": "Low" | "Medium" | "High",
      "timeframe": "Month 1" | "Month 1-2" | "Month 2-3" | "Month 3-4" | "Month 4-6" | "Ongoing"
    }}
  ],
  "timeline": [
    {{ "month": 1, "milestone": "..." }},
    {{ "month": 2, "milestone": "..." }},
    {{ "month": 3, "milestone": "..." }},
    {{ "month": 4, "milestone": "..." }},
    {{ "month": 5, "milestone": "..." }},
    {{ "month": 6, "milestone": "..." }}
  ]
}}

Rules:
- 5 to 7 actions, ordered by impact.
- timeline must have one entry per month from 1 through estimated_months (max 6).
- Be specific to GEO (LLM citation surfaces, Reddit/Wikipedia/listicle presence, structured data, schema markup, expert quotes, Substack/Medium presence, podcast guesting) — NOT generic SEO platitudes.
- If competitors are mentioned, reference how to displace or co-appear with them.
"""

    text = await ask_engine(
        "claude-sonnet-4.5",
        system,
        user_prompt,
        session_id=f"geo-plan-{cid}-{query_id}",
    )
    parsed = _parse_plan_json(text) or {}

    rec = GeoRecommendation(
        client_id=cid,
        query_id=query_id,
        query=q["query"],
        summary=parsed.get("summary", "")[:1000],
        estimated_months=int(parsed.get("estimated_months") or 6) if isinstance(parsed.get("estimated_months"), (int, float, str)) else 6,
        confidence=str(parsed.get("confidence") or "Medium"),
        actions=parsed.get("actions") or [],
        timeline=parsed.get("timeline") or [],
        raw_payload=text[:8000],
    )
    doc = rec.model_dump()
    doc["created_at"] = _dt(doc["created_at"])
    # overwrite any previous plan for this query
    await db.geo_recommendations.delete_many({"client_id": cid, "query_id": query_id})
    await db.geo_recommendations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/geo/recommendations")
async def list_geo_plans(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    return await db.geo_recommendations.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.delete("/geo/recommendations/{plan_id}")
async def delete_geo_plan(plan_id: str, user: dict = Depends(get_current_user)):
    rec = await db.geo_recommendations.find_one({"id": plan_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and rec["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.geo_recommendations.delete_one({"id": plan_id})
    return {"ok": True}


# ====================================================
# SEO ranking (manual + optional Programmable Search)
# ====================================================
@api.get("/seo/keywords")
async def list_seo_keywords(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    return await db.seo_keywords.find({"client_id": cid}, {"_id": 0}).to_list(200)


@api.post("/seo/keywords")
async def add_seo_keyword(payload: SeoKeywordIn, client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    k = SeoKeyword(client_id=cid, **payload.model_dump())
    doc = k.model_dump()
    doc["created_at"] = _dt(doc["created_at"])
    await db.seo_keywords.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/seo/keywords/{keyword_id}")
async def delete_seo_keyword(keyword_id: str, user: dict = Depends(get_current_user)):
    k = await db.seo_keywords.find_one({"id": keyword_id}, {"_id": 0})
    if not k:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and k["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.seo_keywords.delete_one({"id": keyword_id})
    await db.seo_ranks.delete_many({"keyword_id": keyword_id})
    return {"ok": True}


@api.post("/seo/keywords/{keyword_id}/manual-rank")
async def manual_rank(keyword_id: str, payload: SeoRankIn, user: dict = Depends(get_current_user)):
    k = await db.seo_keywords.find_one({"id": keyword_id}, {"_id": 0})
    if not k:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and k["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    r = SeoRank(client_id=k["client_id"], keyword_id=keyword_id, rank=payload.rank, note=payload.note, source="manual")
    doc = r.model_dump()
    doc["recorded_at"] = _dt(doc["recorded_at"])
    await db.seo_ranks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/seo/keywords/{keyword_id}/auto-rank")
async def auto_rank(keyword_id: str, user: dict = Depends(get_current_user)):
    k = await db.seo_keywords.find_one({"id": keyword_id}, {"_id": 0})
    if not k:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and k["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    rank, is_real = google_search_rank(k["keyword"], k.get("domain", ""))
    if not is_real:
        raise HTTPException(status_code=400, detail="Google Programmable Search key not configured")
    r = SeoRank(client_id=k["client_id"], keyword_id=keyword_id, rank=rank or 0, note="auto", source="google_cse")
    doc = r.model_dump()
    doc["recorded_at"] = _dt(doc["recorded_at"])
    await db.seo_ranks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/seo/ranks")
async def list_seo_ranks(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    return await db.seo_ranks.find({"client_id": cid}, {"_id": 0}).sort("recorded_at", -1).to_list(1000)


# ====================================================
# Recommendations (keywords + 6-month plan)
# ====================================================
class KeywordRecIn(BaseModel):
    seed_text: str = ""
    geography: str = "India"


@api.post("/recommendations/keywords")
async def recommend_keywords(payload: KeywordRecIn, client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    seed = payload.seed_text.strip()
    if not seed:
        # build seed from latest 20 posts
        posts = await db.posts.find({"client_id": cid}, {"_id": 0, "title": 1, "snippet": 1}).sort("posted_at", -1).to_list(20)
        seed = "\n".join(f"- {p.get('title') or p.get('snippet','')[:120]}" for p in posts) or "general digital marketing brand authority"
    prompt = (
        f"Suggest exactly 20 long-tail keywords, low difficulty, {payload.geography}-focused, "
        "semantically close to the content/topics below. Return ONLY a numbered list, no extra text.\n\n"
        f"{seed}"
    )
    text = await ask_engine(
        "gpt-5.2",
        "You are an SEO strategist. Be concise and specific.",
        prompt,
        session_id=f"kw-{cid}",
    )
    rec = Recommendation(client_id=cid, kind="keywords", payload=text)
    doc = rec.model_dump()
    doc["created_at"] = _dt(doc["created_at"])
    await db.recommendations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.post("/recommendations/plan")
async def recommend_plan(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    channels = await db.channels.find({"client_id": cid}, {"_id": 0}).to_list(50)
    client = await db.clients.find_one({"id": cid}, {"_id": 0})
    channels_summary = ", ".join(f"{c['platform']} ({c.get('handle','')})" for c in channels) or "no channels yet"
    company = (client or {}).get("company") or (client or {}).get("name", "the brand")
    prompt = (
        f"Build a realistic 6-month content + outreach plan for {company}. "
        f"Active channels: {channels_summary}. "
        "For each month, list: (a) primary theme, (b) 4 content drops with channel + format, "
        "(c) 2 outreach moves, (d) one KPI to watch. "
        "Plain text, month-by-month headings, no markdown asterisks."
    )
    text = await ask_engine(
        "gemini-3-flash",
        "You are a brand strategist for B2B/India-focused brands.",
        prompt,
        session_id=f"plan-{cid}",
    )
    rec = Recommendation(client_id=cid, kind="plan", payload=text)
    doc = rec.model_dump()
    doc["created_at"] = _dt(doc["created_at"])
    await db.recommendations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/recommendations")
async def list_recommendations(client_id: Optional[str] = None, kind: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    q: dict = {"client_id": cid}
    if kind:
        q["kind"] = kind
    return await db.recommendations.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)


# ====================================================
# Dashboard summary
# ====================================================
@api.get("/dashboard/summary")
async def dashboard_summary(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    cid = await _client_scope(user, client_id)
    posts = await db.posts.find({"client_id": cid}, {"_id": 0}).to_list(1000)
    channels = await db.channels.find({"client_id": cid}, {"_id": 0}).to_list(100)
    now = datetime.now(timezone.utc)
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = this_month_start
    prev_month_start = (prev_month_end.replace(day=1) - timedelta_days(1)).replace(day=1)

    def _parse_dt(value) -> datetime:
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return now

    this_month_posts = [p for p in posts if _parse_dt(p["posted_at"]) >= this_month_start]
    last_month_posts = [p for p in posts if prev_month_start <= _parse_dt(p["posted_at"]) < prev_month_end]

    def _engagement(items: list[dict]) -> int:
        return sum(p.get("likes", 0) + p.get("comments", 0) + p.get("shares", 0) for p in items)

    this_eng = _engagement(this_month_posts)
    last_eng = _engagement(last_month_posts)
    delta_pct = 0 if last_eng == 0 else round((this_eng - last_eng) * 100.0 / max(last_eng, 1), 1)

    # Consistency: posts per week over last 4 weeks
    cutoff = now - timedelta_days(28)
    recent = [p for p in posts if _parse_dt(p["posted_at"]) >= cutoff]
    posts_per_week = len(recent) / 4.0
    consistency = min(100, int(posts_per_week * 20))  # 5 posts/wk = 100

    by_platform = {}
    for ch in channels:
        plt = ch["platform"]
        plt_posts = [p for p in posts if p["platform"] == plt]
        by_platform[plt] = {
            "channel": ch,
            "post_count": len(plt_posts),
            "engagement": _engagement(plt_posts),
            "last_sync": ch.get("last_sync"),
            "status": ch.get("status", "pending"),
        }

    top = sorted(posts, key=lambda p: p.get("likes", 0) + p.get("comments", 0) + p.get("shares", 0), reverse=True)
    return {
        "this_month": {"posts": len(this_month_posts), "engagement": this_eng},
        "last_month": {"posts": len(last_month_posts), "engagement": last_eng},
        "delta_pct": delta_pct,
        "consistency_score": consistency,
        "by_platform": by_platform,
        "top_post": top[0] if top else None,
        "total_posts": len(posts),
        "channels_count": len(channels),
    }


@api.get("/dashboard/scores")
async def dashboard_scores(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Composite scores for the Pulse overview tab."""
    cid = await _client_scope(user, client_id)
    posts = await db.posts.find({"client_id": cid}, {"_id": 0}).to_list(2000)
    channels = await db.channels.find({"client_id": cid}, {"_id": 0}).to_list(100)
    geo_results = await db.geo_results.find({"client_id": cid}, {"_id": 0}).to_list(1000)
    sentiment_doc = await db.brand_sentiment.find_one({"client_id": cid}, {"_id": 0})

    now = datetime.now(timezone.utc)
    cutoff_30 = now - timedelta_days(30)

    def _parse_dt(value) -> datetime:
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return now

    posts_30d = [p for p in posts if _parse_dt(p["posted_at"]) >= cutoff_30]
    eng_30d = sum(p.get("likes", 0) + p.get("comments", 0) + p.get("shares", 0) for p in posts_30d)

    # ----- AI Visibility -----
    latest_by_pair: dict[str, dict] = {}
    for r in geo_results:
        k = f"{r['query_id']}::{r['engine']}"
        if k not in latest_by_pair or _parse_dt(r["ran_at"]) > _parse_dt(latest_by_pair[k]["ran_at"]):
            latest_by_pair[k] = r
    total_pairs = len(latest_by_pair)
    hit_pairs = sum(1 for r in latest_by_pair.values() if r.get("mentioned"))
    ai_visibility = round((hit_pairs / total_pairs) * 100) if total_pairs else 0

    # per-engine breakdown for the score card
    engines_seen = {"gpt-5.2", "claude-sonnet-4.5", "gemini-3-flash"}
    engine_breakdown = []
    for eng in engines_seen:
        eng_pairs = [r for r in latest_by_pair.values() if r["engine"] == eng]
        eng_hits = sum(1 for r in eng_pairs if r.get("mentioned"))
        engine_breakdown.append({
            "engine": eng,
            "total": len(eng_pairs),
            "hits": eng_hits,
            "rate": round((eng_hits / len(eng_pairs)) * 100) if eng_pairs else 0,
        })

    # ----- Brand Score (overall presence) -----
    # weighted blend: channels connected (max 40), posts in last 30d (max 30),
    # ai_visibility (max 30). Clamp 0-100.
    channel_subscore = min(40, len(channels) * 8)
    posts_subscore = min(30, len(posts_30d) * 1.5)
    ai_subscore = ai_visibility * 0.3
    brand_score = round(channel_subscore + posts_subscore + ai_subscore)
    brand_score = max(0, min(100, brand_score))

    # ----- Sentiment -----
    sentiment_score = (sentiment_doc or {}).get("score", 0)
    sentiment_summary = (sentiment_doc or {}).get("summary", "")
    sentiment_updated_at = (sentiment_doc or {}).get("updated_at")
    sentiment_breakdown = (sentiment_doc or {}).get("breakdown", {})

    # ----- Channel Performance (visibility across channels) -----
    perf = []
    max_eng = max(
        [
            sum(p.get("likes", 0) + p.get("comments", 0) + p.get("shares", 0)
                for p in posts_30d if p["platform"] == ch["platform"])
            for ch in channels
        ] or [1]
    )
    for ch in channels:
        plt_posts = [p for p in posts_30d if p["platform"] == ch["platform"]]
        eng = sum(p.get("likes", 0) + p.get("comments", 0) + p.get("shares", 0) for p in plt_posts)
        visibility = round((eng / max_eng) * 100) if max_eng else 0
        cadence_score = min(100, len(plt_posts) * 12)  # ~8 posts/mo = 100
        perf.append({
            "id": ch["id"],
            "platform": ch["platform"],
            "handle": ch.get("handle") or ch.get("url", ""),
            "posts_30d": len(plt_posts),
            "engagement_30d": eng,
            "visibility": visibility,
            "cadence": cadence_score,
            "status": ch.get("status", "pending"),
            "sync_mode": ch.get("sync_mode", "manual"),
            "last_sync": ch.get("last_sync"),
            "og": ch.get("og") or {},
        })
    # Sort by engagement, highest first
    perf.sort(key=lambda r: r["engagement_30d"], reverse=True)

    return {
        "brand_score": brand_score,
        "brand_subscores": {
            "channels": round(channel_subscore),
            "cadence": round(posts_subscore),
            "ai": round(ai_subscore),
        },
        "ai_visibility": {
            "score": ai_visibility,
            "hits": hit_pairs,
            "total": total_pairs,
            "engines": engine_breakdown,
        },
        "sentiment": {
            "score": sentiment_score,
            "summary": sentiment_summary,
            "breakdown": sentiment_breakdown,
            "updated_at": sentiment_updated_at,
            "ready": bool(sentiment_doc),
        },
        "channel_performance": perf,
        "posts_30d": len(posts_30d),
        "engagement_30d": eng_30d,
    }


@api.post("/dashboard/sentiment/refresh")
async def refresh_sentiment(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Ask the LLM to analyse recent post titles/snippets and produce a 0-100 sentiment."""
    cid = await _client_scope(user, client_id)
    posts = await db.posts.find(
        {"client_id": cid}, {"_id": 0, "title": 1, "snippet": 1, "platform": 1}
    ).sort("posted_at", -1).to_list(40)
    if not posts:
        return {"score": 0, "summary": "No posts yet — connect a channel first.", "ready": False}

    sample = "\n".join(
        f"- [{p['platform']}] {(p.get('title') or '')[:120]} :: {(p.get('snippet') or '')[:160]}"
        for p in posts[:30]
    )
    prompt = (
        "Analyse the overall public-facing brand sentiment based on these recent posts. "
        "Output STRICT JSON only (no prose) in this exact shape:\n"
        '{ "score": <0-100 integer, 0=very negative, 50=neutral, 100=very positive>, '
        '"summary": "<2-3 sentences>", "breakdown": {"positive": <int>, "neutral": <int>, "negative": <int>} }\n'
        "The three breakdown values must sum to 100.\n\nPosts:\n" + sample
    )
    text = await ask_engine(
        "claude-sonnet-4.5",
        "You are a brand sentiment analyst. Output ONLY valid JSON.",
        prompt,
        session_id=f"sentiment-{cid}",
    )
    import json as _json
    import re as _re
    cleaned = _re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=_re.MULTILINE).strip()
    parsed = {}
    try:
        parsed = _json.loads(cleaned)
    except Exception:
        m = _re.search(r"\{[\s\S]*\}", cleaned)
        if m:
            try:
                parsed = _json.loads(m.group(0))
            except Exception:
                parsed = {}

    score = int(parsed.get("score") or 50) if isinstance(parsed.get("score"), (int, float, str)) else 50
    score = max(0, min(100, score))
    summary = str(parsed.get("summary") or "")[:600]
    breakdown = parsed.get("breakdown") or {}
    if not isinstance(breakdown, dict):
        breakdown = {}

    doc = {
        "client_id": cid,
        "score": score,
        "summary": summary,
        "breakdown": breakdown,
        "raw": text[:4000],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.brand_sentiment.replace_one({"client_id": cid}, doc, upsert=True)
    doc.pop("_id", None)
    return {**doc, "ready": True}


@api.post("/channels/{channel_id}/refresh-metadata")
async def refresh_channel_metadata(channel_id: str, user: dict = Depends(get_current_user)):
    """Re-pull OpenGraph metadata for a channel. Useful when a profile updates
    its picture/headline or when LinkedIn momentarily un-blocks us."""
    ch = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if user["role"] != "admin" and ch["client_id"] != user.get("client_id"):
        raise HTTPException(status_code=403, detail="Forbidden")
    url = ch.get("url") or ""
    if not url and ch["platform"].startswith("linkedin") and ch.get("handle"):
        handle = ch["handle"].lstrip("/").replace("in/", "")
        url = f"https://www.linkedin.com/in/{handle}"
    if not url:
        raise HTTPException(status_code=400, detail="No URL on channel to fetch metadata from")
    og = fetch_og_metadata(url)
    await db.channels.update_one(
        {"id": channel_id},
        {"$set": {"og": og, "status": "metadata" if any(og.values()) else ch.get("status", "pending")}},
    )
    return {"og": og, "ok": True}


# small helper to avoid importing timedelta inline above
def timedelta_days(n: int):
    from datetime import timedelta
    return timedelta(days=n)


# ====================================================
from strategy_routes import get_strategy_router
app.include_router(get_strategy_router(db))
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_origin_regex=r"https?://.*\.preview\.emergentagent\.com|http://localhost(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
