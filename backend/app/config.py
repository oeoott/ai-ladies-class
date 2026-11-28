"""설정. 환경 변수(App Service 앱 설정)를 먼저 읽고, 없으면 backend/.env를 읽는다 (.env.example 참고)."""
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


@dataclass(frozen=True)
class Settings:
    cors_origins: list[str] = field(default_factory=lambda: ["http://localhost:5173"])
    openai_endpoint: str = ""
    openai_key: str = ""
    openai_deployment: str = ""
    language_endpoint: str = ""
    language_key: str = ""
    safety_endpoint: str = ""
    safety_key: str = ""
    store: str = "memory"  # memory | cosmos
    cosmos_endpoint: str = ""
    cosmos_key: str = ""
    cosmos_database: str = ""
    jwt_secret: str = ""
    # true면 안전 서비스가 빠지거나 실패할 때 모델을 부르지 않는다 (배포 권장). 비우면 false (로컬·시연).
    ai_safety_required: bool = False

    @property
    def openai_enabled(self) -> bool:
        return bool(self.openai_endpoint and self.openai_key and self.openai_deployment)

    @property
    def language_enabled(self) -> bool:
        return bool(self.language_endpoint and self.language_key)

    @property
    def content_safety_enabled(self) -> bool:
        return bool(self.safety_endpoint and self.safety_key)

    @property
    def auth_enabled(self) -> bool:
        return bool(self.jwt_secret)

    @property
    def cosmos_enabled(self) -> bool:
        return bool(self.cosmos_endpoint and self.cosmos_key and self.cosmos_database)


def load_settings(path: Path = ENV_FILE, environ: Mapping[str, str] | None = None) -> Settings:
    environ = os.environ if environ is None else environ
    file = {k: (v or "").strip() for k, v in dotenv_values(path).items()} if path.exists() else {}
    names = ("CORS_ORIGINS", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY", "AZURE_OPENAI_DEPLOYMENT",
             "AZURE_LANGUAGE_ENDPOINT", "AZURE_LANGUAGE_KEY", "AZURE_CONTENT_SAFETY_ENDPOINT", "AZURE_CONTENT_SAFETY_KEY",
             "STORE", "COSMOS_ENDPOINT", "COSMOS_KEY", "COSMOS_DATABASE", "JWT_SECRET", "AI_SAFETY_REQUIRED")
    env = {name: (environ.get(name) or "").strip() or file.get(name, "") for name in names}
    store = env.get("STORE", "").lower() or "memory"
    if store not in ("memory", "cosmos"):
        raise ValueError(f"STORE는 memory 또는 cosmos여야 해요: {store}")
    origins = [v.strip() for v in env.get("CORS_ORIGINS", "").split(",") if v.strip()]
    return Settings(
        **({"cors_origins": origins} if origins else {}),
        openai_endpoint=env.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/"),
        openai_key=env.get("AZURE_OPENAI_KEY", ""),
        openai_deployment=env.get("AZURE_OPENAI_DEPLOYMENT", ""),
        language_endpoint=env.get("AZURE_LANGUAGE_ENDPOINT", "").rstrip("/"),
        language_key=env.get("AZURE_LANGUAGE_KEY", ""),
        safety_endpoint=env.get("AZURE_CONTENT_SAFETY_ENDPOINT", "").rstrip("/"),
        safety_key=env.get("AZURE_CONTENT_SAFETY_KEY", ""),
        store=store,
        cosmos_endpoint=env.get("COSMOS_ENDPOINT", "").rstrip("/"),
        cosmos_key=env.get("COSMOS_KEY", ""),
        cosmos_database=env.get("COSMOS_DATABASE", ""),
        jwt_secret=env.get("JWT_SECRET", ""),
        ai_safety_required=env.get("AI_SAFETY_REQUIRED", "").lower() in ("1", "true", "yes"),
    )


settings = load_settings()
