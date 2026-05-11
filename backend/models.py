"""Pydantic models for Pixelgrok Pulse."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _id() -> str:
    return str(uuid.uuid4())


# ---------- Users / Clients ----------
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    email: EmailStr
    name: str
    role: str  # "admin" | "client"
    client_id: Optional[str] = None  # for role=client, link to clients
    is_active: bool = True
    created_at: datetime = Field(default_factory=_now)


class CreateClientIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    company: str = ""


class ClientAccount(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    name: str
    company: str = ""
    email: EmailStr
    is_active: bool = True
    created_at: datetime = Field(default_factory=_now)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


# ---------- Channels ----------
PLATFORMS = [
    "youtube", "instagram", "facebook", "linkedin", "linkedin_company",
    "medium", "reddit", "pinterest", "blog", "substack", "twitter", "custom",
]
AUTO_PLATFORMS = {"youtube", "medium", "reddit", "blog", "substack"}


class ChannelIn(BaseModel):
    platform: str
    handle: str
    url: str = ""


class Channel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_id: str
    platform: str
    handle: str
    url: str = ""
    sync_mode: str = "manual"  # "auto" | "manual"
    last_sync: Optional[datetime] = None
    status: str = "pending"  # "connected" | "pending" | "error"
    created_at: datetime = Field(default_factory=_now)


# ---------- Posts ----------
class PostIn(BaseModel):
    channel_id: str
    title: str = ""
    snippet: str = ""
    url: str = ""
    posted_at: datetime
    likes: int = 0
    comments: int = 0
    shares: int = 0
    views: int = 0
    media_type: str = "text"  # text | image | video
    hashtags: List[str] = []


class Post(PostIn):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_id: str
    platform: str
    source: str = "manual"  # "manual" | "auto"
    created_at: datetime = Field(default_factory=_now)


# ---------- Competitors ----------
class CompetitorIn(BaseModel):
    platform: str
    handle: str
    url: str = ""


class Competitor(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_id: str
    platform: str
    handle: str
    url: str = ""
    created_at: datetime = Field(default_factory=_now)


class CompetitorPostIn(BaseModel):
    competitor_id: str
    title: str = ""
    snippet: str = ""
    url: str = ""
    posted_at: datetime
    likes: int = 0
    comments: int = 0
    shares: int = 0
    views: int = 0
    media_type: str = "text"
    hashtags: List[str] = []


class CompetitorPost(CompetitorPostIn):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_id: str
    platform: str
    source: str = "manual"
    created_at: datetime = Field(default_factory=_now)


# ---------- GEO ----------
class GeoQueryIn(BaseModel):
    query: str
    brand_terms: List[str] = []  # words counted as a brand mention


class GeoQuery(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_id: str
    query: str
    brand_terms: List[str] = []
    created_at: datetime = Field(default_factory=_now)


class GeoResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_id: str
    query_id: str
    query: str
    engine: str  # "gpt-5.2" | "claude-sonnet-4.5" | "gemini-3-flash"
    response: str
    mentioned: bool = False
    competitor_mentions: List[str] = []
    ran_at: datetime = Field(default_factory=_now)


# ---------- SEO ----------
class SeoKeywordIn(BaseModel):
    keyword: str
    domain: str = ""


class SeoKeyword(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_id: str
    keyword: str
    domain: str = ""
    created_at: datetime = Field(default_factory=_now)


class SeoRankIn(BaseModel):
    keyword_id: str
    rank: int
    note: str = ""


class SeoRank(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_id: str
    keyword_id: str
    rank: int
    note: str = ""
    source: str = "manual"  # "manual" | "google_cse"
    recorded_at: datetime = Field(default_factory=_now)


# ---------- Recommendations / Plan ----------
class Recommendation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    client_id: str
    kind: str  # "keywords" | "plan"
    payload: str  # LLM text/JSON output
    created_at: datetime = Field(default_factory=_now)
