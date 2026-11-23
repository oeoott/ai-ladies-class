#!/bin/sh
# Azure App Service (Linux, Python 3.12) 시작 명령: 앱 설정 > 시작 명령에 `sh startup.sh`
# 설정은 모두 앱 설정(환경 변수)으로 넣는다. backend/.env.example의 이름과 같다.
# - STORE=memory(기본값)는 워커마다 저장소가 따로 생겨 기록이 갈라지므로 워커 1개로만 돈다.
# - STORE=cosmos면 WEB_CONCURRENCY(기본 2)만큼 워커를 띄운다.
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8000}"
if [ "${STORE:-memory}" = "cosmos" ]; then
  WORKERS="${WEB_CONCURRENCY:-2}"
else
  WORKERS=1
fi
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers "$WORKERS" \
  --proxy-headers --forwarded-allow-ips='*'
