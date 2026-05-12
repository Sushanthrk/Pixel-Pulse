"""Free third-party integrations: YouTube, RSS, Reddit. Each function returns a list of
normalised post dicts: title, snippet, url, posted_at(iso), likes, comments, shares,
views, media_type, hashtags. If a real API key is missing, returns a clearly-labelled
mock sample so the UI can demo the flow.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import List
from urllib.parse import urlparse

import feedparser
import requests

log = logging.getLogger(__name__)
HASHTAG_RE = re.compile(r"#(\w+)")
OG_META_RE = re.compile(
    r"<meta\s+[^>]*(?:property|name)=[\"'](og:[^\"']+|twitter:[^\"']+|description)[\"'][^>]*content=[\"']([^\"']+)[\"']",
    re.IGNORECASE,
)


def _hashtags(text: str) -> List[str]:
    return [h.lower() for h in HASHTAG_RE.findall(text or "")]


def fetch_og_metadata(url: str) -> dict:
    """Pull OpenGraph + Twitter card meta tags from a public URL.
    Returns {title, description, image, site_name} — empty strings if unavailable.
    LinkedIn often gates this with a login wall but most platforms expose OG."""
    out = {"title": "", "description": "", "image": "", "site_name": ""}
    if not url:
        return out
    try:
        resp = requests.get(
            url,
            timeout=8,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; PixelgrokPulseBot/1.0; +https://pixelgrok.com)",
                "Accept-Language": "en-US,en;q=0.9",
            },
            allow_redirects=True,
        )
        if resp.status_code >= 400:
            return out
        html = resp.text[:200000]  # cap response size
        for prop, content in OG_META_RE.findall(html):
            p = prop.lower()
            if p == "og:title" and not out["title"]:
                out["title"] = content
            elif p in ("og:description", "twitter:description", "description") and not out["description"]:
                out["description"] = content
            elif p in ("og:image", "twitter:image") and not out["image"]:
                out["image"] = content
            elif p == "og:site_name" and not out["site_name"]:
                out["site_name"] = content
    except Exception as exc:
        log.warning("OG fetch failed for %s: %s", url, exc)
    return out


def fetch_public_page_text(url: str, max_chars: int = 8000) -> tuple[str, str]:
    """Fetch a public URL and return (visible_text, fail_reason).
    fail_reason is empty on success, else describes why we couldn't extract content.
    """
    if not url:
        return "", "no_url"
    try:
        resp = requests.get(
            url,
            timeout=10,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; PixelgrokPulseBot/1.0; +https://pixelgrok.com) like Gecko",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
            allow_redirects=True,
        )
        if resp.status_code >= 400:
            return "", f"http_{resp.status_code}"
        html = resp.text[:400000]
        # Strip script + style + head metadata blocks
        cleaned = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
        cleaned = re.sub(r"<style[\s\S]*?</style>", " ", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"<noscript[\s\S]*?</noscript>", " ", cleaned, flags=re.IGNORECASE)
        # Extract visible text
        text = re.sub(r"<[^>]+>", " ", cleaned)
        text = re.sub(r"&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) < 200:
            return text, "too_short_or_gated"
        # Detect login walls
        lt = text.lower()
        signals = ["sign in to continue", "please log in", "join now to view", "create a free account to view"]
        if any(s in lt for s in signals) and len(text) < 1500:
            return text[:max_chars], "login_wall"
        return text[:max_chars], ""
    except Exception as exc:
        log.warning("Public page fetch failed for %s: %s", url, exc)
        return "", f"exception:{type(exc).__name__}"


def _mock_posts(label: str, n: int = 8, media_type: str = "video") -> list[dict]:
    now = datetime.now(timezone.utc)
    items = []
    for i in range(n):
        items.append({
            "title": f"[MOCK] {label} sample post #{i+1}",
            "snippet": f"This is a mock data point so the UI can render without {label} API keys.",
            "url": f"https://example.com/{label.lower()}/{i+1}",
            "posted_at": (now - timedelta(days=i * 3, hours=i)).isoformat(),
            "likes": 120 + i * 17,
            "comments": 8 + i * 3,
            "shares": 4 + i,
            "views": 1500 + i * 230,
            "media_type": media_type,
            "hashtags": ["mock", label.lower()],
        })
    return items


# ----------------- YouTube -----------------
def fetch_youtube(channel_handle_or_id: str) -> tuple[list[dict], bool]:
    """Return (posts, is_real). Uses YOUTUBE_API_KEY if set, else mock."""
    api_key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        return _mock_posts("YouTube", media_type="video"), False
    try:
        from googleapiclient.discovery import build

        yt = build("youtube", "v3", developerKey=api_key, cache_discovery=False)

        channel_id = channel_handle_or_id
        if channel_handle_or_id.startswith("@"):
            r = yt.search().list(
                q=channel_handle_or_id, type="channel", part="snippet", maxResults=1
            ).execute()
            items = r.get("items") or []
            if not items:
                return [], True
            channel_id = items[0]["snippet"]["channelId"]
        elif "youtube.com" in channel_handle_or_id:
            # accept full channel URL
            parts = channel_handle_or_id.rstrip("/").split("/")
            channel_id = parts[-1]
            if channel_id.startswith("@"):
                return fetch_youtube(channel_id)

        ch = yt.channels().list(part="contentDetails", id=channel_id).execute()
        ch_items = ch.get("items") or []
        if not ch_items:
            return [], True
        uploads = ch_items[0]["contentDetails"]["relatedPlaylists"]["uploads"]
        pl = yt.playlistItems().list(part="snippet,contentDetails", playlistId=uploads, maxResults=20).execute()
        video_ids = [it["contentDetails"]["videoId"] for it in pl.get("items", [])]
        if not video_ids:
            return [], True
        stats = yt.videos().list(part="snippet,statistics", id=",".join(video_ids)).execute()
        posts: list[dict] = []
        for v in stats.get("items", []):
            sn = v["snippet"]
            st = v.get("statistics", {})
            posts.append({
                "title": sn.get("title", ""),
                "snippet": (sn.get("description") or "")[:240],
                "url": f"https://www.youtube.com/watch?v={v['id']}",
                "posted_at": sn.get("publishedAt") or datetime.now(timezone.utc).isoformat(),
                "likes": int(st.get("likeCount", 0)),
                "comments": int(st.get("commentCount", 0)),
                "shares": 0,
                "views": int(st.get("viewCount", 0)),
                "media_type": "video",
                "hashtags": _hashtags(sn.get("description", "")),
            })
        return posts, True
    except Exception as exc:
        log.warning("YouTube fetch failed for %s: %s", channel_handle_or_id, exc)
        return _mock_posts("YouTube", media_type="video"), False


# ----------------- RSS (Medium / Substack / Blog) -----------------
def fetch_rss(url: str) -> tuple[list[dict], bool]:
    if not url:
        return _mock_posts("RSS", media_type="text"), False
    try:
        feed = feedparser.parse(url)
        if feed.bozo and not feed.entries:
            return _mock_posts("RSS", media_type="text"), False
        posts: list[dict] = []
        for e in feed.entries[:30]:
            try:
                posted_at = datetime(*e.published_parsed[:6], tzinfo=timezone.utc).isoformat()
            except Exception:
                posted_at = datetime.now(timezone.utc).isoformat()
            summary = (e.get("summary") or e.get("description") or "")[:240]
            posts.append({
                "title": e.get("title", ""),
                "snippet": re.sub(r"<[^>]+>", "", summary),
                "url": e.get("link", ""),
                "posted_at": posted_at,
                "likes": 0,
                "comments": 0,
                "shares": 0,
                "views": 0,
                "media_type": "text",
                "hashtags": _hashtags(summary),
            })
        return posts, True
    except Exception as exc:
        log.warning("RSS fetch failed for %s: %s", url, exc)
        return _mock_posts("RSS", media_type="text"), False


# ----------------- Reddit (public JSON, no auth required) -----------------
def fetch_reddit(handle: str) -> tuple[list[dict], bool]:
    """Handle can be either a subreddit name (r/foo) or a username (u/foo)."""
    h = handle.strip().lstrip("/")
    if not h:
        return _mock_posts("Reddit", media_type="text"), False
    if h.startswith("r/"):
        target = f"https://www.reddit.com/{h}/new.json?limit=25"
    elif h.startswith("u/") or h.startswith("user/"):
        username = h.split("/", 1)[1]
        target = f"https://www.reddit.com/user/{username}/submitted.json?limit=25"
    else:
        target = f"https://www.reddit.com/r/{h}/new.json?limit=25"
    try:
        resp = requests.get(target, headers={"User-Agent": "pixelgrok-pulse/1.0"}, timeout=10)
        if resp.status_code != 200:
            return _mock_posts("Reddit", media_type="text"), False
        data = resp.json().get("data", {}).get("children", [])
        posts: list[dict] = []
        for child in data:
            d = child.get("data", {})
            ts = d.get("created_utc")
            posted_at = (
                datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
                if ts else datetime.now(timezone.utc).isoformat()
            )
            posts.append({
                "title": d.get("title", ""),
                "snippet": (d.get("selftext") or "")[:240],
                "url": f"https://www.reddit.com{d.get('permalink', '')}",
                "posted_at": posted_at,
                "likes": int(d.get("ups", 0)),
                "comments": int(d.get("num_comments", 0)),
                "shares": 0,
                "views": 0,
                "media_type": "image" if d.get("post_hint") == "image" else "text",
                "hashtags": _hashtags(d.get("title", "")),
            })
        return posts, True
    except Exception as exc:
        log.warning("Reddit fetch failed for %s: %s", handle, exc)
        return _mock_posts("Reddit", media_type="text"), False


# ----------------- Google Programmable Search (SEO rank) -----------------
def google_search_rank(keyword: str, domain: str) -> tuple[int | None, bool]:
    cse_id = os.environ.get("GOOGLE_CSE_ID", "").strip()
    cse_key = os.environ.get("GOOGLE_CSE_KEY", "").strip()
    if not cse_id or not cse_key or not domain:
        return None, False
    try:
        resp = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"q": keyword, "cx": cse_id, "key": cse_key, "num": 10},
            timeout=10,
        )
        items = resp.json().get("items", [])
        domain_norm = urlparse(domain).netloc or domain
        for idx, it in enumerate(items, start=1):
            link = it.get("link", "")
            if domain_norm.lower() in link.lower():
                return idx, True
        return None, True
    except Exception as exc:
        log.warning("Google CSE failed: %s", exc)
        return None, False
