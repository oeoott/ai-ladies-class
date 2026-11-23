from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .config import settings
from .routers import auth, children, devices, emotion, mirror, report, story, walks

app = FastAPI(title="마음숲 API", version="0.1.0",
              description="하루 한 감정 산책: 학습 1 감정 탐색 → 학습 2 표정 거울 → 학습 3 동화·대화")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, auth.me_router, children.router, report.router, devices.router, walks.router, emotion.router, mirror.router, story.router):
    app.include_router(r)


@app.get("/health")
def health():
    s = config.settings
    return {"ok": True, "openai": s.openai_enabled, "language": s.language_enabled,
            "content_safety": s.content_safety_enabled, "store": s.store, "auth": s.auth_enabled}
