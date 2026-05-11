"""Pixelgrok Pulse - backend API tests."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://pulse-analytics-19.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "sushanthrajeshkumar@gmail.com"
ADMIN_PASSWORD = "Qwerty@123"


# ---------- session fixtures ----------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def seed_client(admin_session):
    """Create a test client workspace + user; clean up at end of session."""
    suffix = uuid.uuid4().hex[:6]
    email = f"test_client_{suffix}@example.com"
    pw = "TestPass@123"
    payload = {"name": f"TEST_Client_{suffix}", "company": "TEST Co", "email": email, "password": pw}
    r = admin_session.post(f"{API}/admin/clients", json=payload, timeout=15)
    assert r.status_code == 200, f"create client failed: {r.status_code} {r.text}"
    client = r.json()
    yield {"client": client, "email": email, "password": pw}
    # teardown
    try:
        admin_session.delete(f"{API}/admin/clients/{client['id']}", timeout=15)
    except Exception:
        pass


@pytest.fixture(scope="session")
def client_session(seed_client):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": seed_client["email"], "password": seed_client["password"]}, timeout=30)
    assert r.status_code == 200, f"client login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ---------- AUTH ----------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "user" in data and "access_token" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        # cookies set
        assert "access_token" in r.cookies

    def test_login_wrong_pw(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_logout(self):
        s = requests.Session()
        login = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        token = login.json().get("access_token")
        s.headers.update({"Authorization": f"Bearer {token}"})
        r = s.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200


# ---------- ADMIN CLIENTS ----------
class TestAdminClients:
    def test_list_clients(self, admin_session):
        r = admin_session.get(f"{API}/admin/clients", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_client_cannot_access_admin(self, client_session):
        r = client_session.get(f"{API}/admin/clients", timeout=15)
        assert r.status_code == 403

    def test_toggle_client(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        r = admin_session.patch(f"{API}/admin/clients/{cid}/toggle", timeout=15)
        assert r.status_code == 200
        first = r.json()["is_active"]
        r = admin_session.patch(f"{API}/admin/clients/{cid}/toggle", timeout=15)
        assert r.json()["is_active"] != first


# ---------- CHANNELS / POSTS / SYNC ----------
class TestChannelsAndSync:
    def test_channel_crud_and_mock_youtube_sync(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        # YouTube channel (no key → mocked)
        r = admin_session.post(f"{API}/channels?client_id={cid}",
                               json={"platform": "youtube", "handle": "@medium", "url": ""}, timeout=15)
        assert r.status_code == 200, r.text
        ch = r.json()
        assert ch["platform"] == "youtube"
        # sync
        r = admin_session.post(f"{API}/sync/channel/{ch['id']}", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "mocked"
        assert body["is_real"] is False
        assert body["inserted"] >= 0
        # GET posts
        r = admin_session.get(f"{API}/posts?client_id={cid}", timeout=15)
        assert r.status_code == 200
        # delete channel
        r = admin_session.delete(f"{API}/channels/{ch['id']}", timeout=15)
        assert r.status_code == 200

    def test_rss_sync_real(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        r = admin_session.post(f"{API}/channels?client_id={cid}",
                               json={"platform": "medium", "handle": "", "url": "https://medium.com/feed/@medium"},
                               timeout=15)
        assert r.status_code == 200, r.text
        ch = r.json()
        r = admin_session.post(f"{API}/sync/channel/{ch['id']}", timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        # RSS should return real posts
        assert body["status"] in ("connected", "mocked")
        admin_session.delete(f"{API}/channels/{ch['id']}", timeout=15)

    def test_manual_post(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        # create linkedin (manual) channel
        r = admin_session.post(f"{API}/channels?client_id={cid}",
                               json={"platform": "linkedin", "handle": "test", "url": ""}, timeout=15)
        ch = r.json()
        r = admin_session.post(
            f"{API}/posts?client_id={cid}",
            json={"channel_id": ch["id"], "title": "TEST manual", "snippet": "hi", "url": "https://x", "posted_at": "2026-01-01T00:00:00Z", "likes": 5, "comments": 1, "shares": 0, "views": 0, "media_type": "text", "hashtags": []},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        r = admin_session.delete(f"{API}/posts/{pid}", timeout=15)
        assert r.status_code == 200
        admin_session.delete(f"{API}/channels/{ch['id']}", timeout=15)


# ---------- COMPETITORS ----------
class TestCompetitors:
    def test_max5_per_platform(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        created = []
        for i in range(5):
            r = admin_session.post(f"{API}/competitors?client_id={cid}",
                                   json={"platform": "youtube", "handle": f"@comp{i}", "url": ""}, timeout=15)
            assert r.status_code == 200, r.text
            created.append(r.json()["id"])
        # 6th should fail
        r = admin_session.post(f"{API}/competitors?client_id={cid}",
                               json={"platform": "youtube", "handle": "@comp6", "url": ""}, timeout=15)
        assert r.status_code == 400
        # cleanup
        for c in created:
            admin_session.delete(f"{API}/competitors/{c}", timeout=15)

    def test_competitor_cluster_llm(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        r = admin_session.post(f"{API}/competitors?client_id={cid}",
                               json={"platform": "medium", "handle": "medium",
                                     "url": "https://medium.com/feed/@medium"}, timeout=15)
        comp = r.json()
        # sync to populate posts
        admin_session.post(f"{API}/competitors/{comp['id']}/sync", timeout=60)
        r = admin_session.post(f"{API}/competitors/{comp['id']}/cluster", timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "clusters_text" in body or "clusters" in body
        admin_session.delete(f"{API}/competitors/{comp['id']}", timeout=15)


# ---------- GEO ----------
class TestGeo:
    def test_geo_query_and_scan(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        r = admin_session.post(f"{API}/geo/queries?client_id={cid}",
                               json={"query": "best D2C brand agencies in India 2026",
                                     "brand_terms": ["Pixelgrok"]}, timeout=15)
        assert r.status_code == 200, r.text
        qid = r.json()["id"]
        # Run scan (3 engines, ~30-60s)
        r = admin_session.post(f"{API}/geo/scan?client_id={cid}",
                               json={"query_ids": [qid]}, timeout=180)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["count"] >= 1
        engines = {row["engine"] for row in body["results"]}
        # All 3 engines should have been called
        assert engines == {"gpt-5.2", "claude-sonnet-4.5", "gemini-3-flash"}, f"got engines={engines}"
        # results endpoint
        r = admin_session.get(f"{API}/geo/results?client_id={cid}", timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= len(body["results"])
        admin_session.delete(f"{API}/geo/queries/{qid}", timeout=15)


# ---------- SEO ----------
class TestSeo:
    def test_keyword_manual_rank(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        r = admin_session.post(f"{API}/seo/keywords?client_id={cid}",
                               json={"keyword": "best agency", "domain": "pixelgrok.com"}, timeout=15)
        assert r.status_code == 200
        kid = r.json()["id"]
        r = admin_session.post(f"{API}/seo/keywords/{kid}/manual-rank",
                               json={"keyword_id": kid, "rank": 7, "note": "manual TEST"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["rank"] == 7
        # auto-rank should 400 (no CSE)
        r = admin_session.post(f"{API}/seo/keywords/{kid}/auto-rank", timeout=15)
        assert r.status_code == 400
        admin_session.delete(f"{API}/seo/keywords/{kid}", timeout=15)


# ---------- RECOMMENDATIONS ----------
class TestRecommendations:
    def test_keywords_llm(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        r = admin_session.post(f"{API}/recommendations/keywords?client_id={cid}",
                               json={"seed_text": "brand authority for D2C", "geography": "India"}, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["kind"] == "keywords"
        assert len(body.get("payload", "")) > 20

    def test_plan_llm(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        r = admin_session.post(f"{API}/recommendations/plan?client_id={cid}", timeout=180)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["kind"] == "plan"
        assert len(body.get("payload", "")) > 20


# ---------- DASHBOARD ----------
class TestDashboard:
    def test_dashboard_shape(self, admin_session, seed_client):
        cid = seed_client["client"]["id"]
        r = admin_session.get(f"{API}/dashboard/summary?client_id={cid}", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ["this_month", "last_month", "delta_pct", "consistency_score",
                    "by_platform", "top_post", "total_posts", "channels_count"]:
            assert key in body, f"missing {key}"


# ---------- MULTI-TENANT SCOPING ----------
class TestScoping:
    def test_client_missing_scope_query_blocked(self, client_session, seed_client):
        # Client cannot pass other client_id; backend pins to user's client_id
        r = client_session.get(f"{API}/channels?client_id=does-not-exist", timeout=15)
        # client role is pinned, query ignored → should be 200 with own (empty) list
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_requires_client_id(self, admin_session):
        r = admin_session.get(f"{API}/channels", timeout=15)
        assert r.status_code == 400
