"""Azure Speech 토큰 발급 (/speech/status, /speech/token). 실제 Azure는 부르지 않는다 (가짜 post_text)."""
import logging

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.routers import speech as speech_router
from app.services import azure, speech
from app.store import MemoryStore, get_store

from .test_auth import SECRET
from .test_report import guardian

KEYS = config.Settings(jwt_secret=SECRET, speech_key="speech-secret-key", speech_region="koreacentral")
TOKEN = "eyJ.fake.token"


@pytest.fixture(autouse=True)
def fresh_cache():
    speech.clear_cache()
    yield
    speech.clear_cache()


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(config, "settings", KEYS)
    calls = []

    def fake_post_text(url, headers, deadline=None):
        calls.append((url, headers))
        return TOKEN

    monkeypatch.setattr(azure, "post_text", fake_post_text)
    store = MemoryStore()
    app.dependency_overrides[get_store] = lambda: store
    yield TestClient(app), store, calls
    app.dependency_overrides.clear()


def test_status_without_keys_and_token_is_503():
    c = TestClient(app)
    assert c.get("/speech/status").json() == {"available": False, "language": "ko-KR"}
    assert c.post("/speech/token", json={"child_id": "device-a"}).status_code == 503


def test_token_for_a_device_child_has_no_key_and_is_not_cached(env, caplog):
    c, _, calls = env
    caplog.set_level(logging.DEBUG)
    assert c.get("/speech/status").json()["available"] is True
    r = c.post("/speech/token", json={"child_id": "device-a"})
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    assert r.json() == {"token": TOKEN, "region": "koreacentral", "language": "ko-KR", "voice": "ko-KR-SunHiNeural",
                        "expires_in": 540}
    url, headers = calls[0]
    assert url == "https://koreacentral.api.cognitive.microsoft.com/sts/v1.0/issueToken"
    assert headers == {"Ocp-Apim-Subscription-Key": "speech-secret-key"}
    assert "speech-secret-key" not in r.text
    assert TOKEN not in caplog.text and "speech-secret-key" not in caplog.text


def test_token_is_reused_for_nine_minutes(env, monkeypatch):
    c, _, calls = env
    c.post("/speech/token", json={"child_id": "device-a"})
    c.post("/speech/token", json={"child_id": "device-b"})
    assert len(calls) == 1
    speech._cache["until"] = 0  # 9분이 지남
    c.post("/speech/token", json={"child_id": "device-a"})
    assert len(calls) == 2


def test_profile_child_needs_its_guardian_token(env):
    c, store, _ = env
    headers, child_id = guardian(c)
    assert c.post("/speech/token", json={"child_id": child_id}).status_code == 401  # 토큰 없이 프로필 아이
    assert c.post("/speech/token", json={"child_id": child_id}, headers=headers).status_code == 200
    other, _ = guardian(c, "other@example.com")
    assert c.post("/speech/token", json={"child_id": child_id}, headers=other).status_code == 403


def test_daily_limit_per_child(env, monkeypatch):
    c, store, _ = env
    monkeypatch.setattr(speech_router, "SPEECH_TOKENS_PER_DAY", 2)
    assert [c.post("/speech/token", json={"child_id": "device-a"}).status_code for _ in range(3)] == [200, 200, 429]
    assert c.post("/speech/token", json={"child_id": "device-b"}).status_code == 200
    # 모델 생성 수와 같은 저장 방식이지만 다른 키라 서로 섞이지 않는다
    from app.deps import today_kst
    assert store.generations_on("device-a", str(today_kst())) == 0


def test_issue_failure_is_502_and_only_the_error_type_is_logged(env, monkeypatch, caplog):
    c, _, _ = env

    def fail(url, headers, deadline=None):
        raise TimeoutError("speech-secret-key in message")

    monkeypatch.setattr(azure, "post_text", fail)
    caplog.set_level(logging.DEBUG)
    assert c.post("/speech/token", json={"child_id": "device-a"}).status_code == 502
    assert "TimeoutError" in caplog.text and "speech-secret-key" not in caplog.text


def test_body_accepts_only_the_child_id(env):
    c, _, _ = env
    assert c.post("/speech/token", json={"child_id": "device-a", "audio": "..."}).status_code == 422


def test_settings_read_speech_names(tmp_path):
    s = config.load_settings(tmp_path / "none.env", {"AZURE_SPEECH_KEY": "k", "AZURE_SPEECH_REGION": "KoreaCentral",
                                                    "AZURE_SPEECH_VOICE": "ko-KR-InJoonNeural"})
    assert (s.speech_region, s.speech_voice, s.speech_enabled) == ("koreacentral", "ko-KR-InJoonNeural", True)
    assert config.load_settings(tmp_path / "none.env", {}).speech_voice == "ko-KR-SunHiNeural"
