# 마음숲 인수인계 (6팀)

담당별로 **이미 된 것 / 채울 곳 / 확인 방법 / 주의할 점**을 적었습니다. 여기 있는 내용은 `backend/README.md`, `AGENTS.md`, `PRD.md`와 코드에 있는 것만 옮겼습니다. 자세한 규칙은 각 문서를 봅니다.

## 공통

**실행**

```sh
# 백엔드
cd backend
python -m venv .venv && .venv\Scripts\activate      # macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload                         # http://localhost:8000/docs
# 프론트 (새 터미널)
cd frontend
npm ci
npm run dev                                           # frontend/.env의 VITE_API_URL=http://localhost:8000
```

**검사 (모두 통과해야 합니다)**

| 명령 | 위치 | 내용 |
| --- | --- | --- |
| `pytest -q` | backend | API, 저장소(메모리·Cosmos 가짜), 대화·안전 검사, 탈퇴, 시연 데이터 |
| `npm test` | frontend | 진행 상태, API 모듈, 동화 데이터, 배포 설정 |
| `npm run build` | frontend | 정적 빌드 |
| `npm run e2e` | frontend | 브라우저 테스트. 처음 한 번 `npx playwright install chromium`, `backend/.venv` 필요 |

**모두 지키는 규칙**
- 서버가 없어도(`VITE_API_URL` 비움) 아이 화면은 지금처럼 동작합니다. API 실패는 아이 화면에 오류로 보이지 않습니다.
- 영상·얼굴 특징·음성은 서버로 보내지 않습니다. 대화는 마스킹된 문장만 저장합니다.
- 키·비밀값은 환경 변수(App Service 앱 설정)로만 둡니다. 이름은 `backend/.env.example`에 있습니다.
- 백엔드 응답은 snake_case, 프론트는 `frontend/src/api.js`에서 camelCase로 바꿉니다.
- 감정·동화 내용은 `backend/app/content/emotions.json`, `tales.json` 한 곳에만 있습니다. 프론트도 같은 파일을 읽습니다.

---

## 백엔드 1 (계정·리포트)

**이미 된 것**
- 보호자 가입·로그인(JWT, 14일), `/me`, 탈퇴 `DELETE /me`(비밀번호 다시 확인, 중간에 실패해도 다시 하면 남는 것 없음)
- 아이 프로필(보호자당 1명, 별명·출생 연도·캐릭터만), 아이 소유 확인(`deps.check_child`)
- 레벨 테스트 저장, 리포트(`/report`, 숫자만), 월별 산책 수(`/report/monthly`)

**채울 곳**

| 할 일 | 파일·함수 |
| --- | --- |
| 이메일 인증, 비밀번호 재설정 | `routers/auth.py` |
| 로그인·탈퇴 비밀번호 시도 제한 | `routers/auth.py`의 `login`, `delete_me` |
| 보호자 동의 기록 | `routers/auth.py`, `store.py` |
| 리포트 항목 확정(기간별 추이 등) | `services/report.py`의 `build_report`, `schemas.py`의 `Report` |
| 레벨 기준 확정 후 서버 판정 | `routers/report.py` (지금은 화면이 정한 `level`을 그대로 저장) |
| 자동 리포트 발송 | 아직 없음 (지금은 보호자가 메일 앱에서 보냄) |

**확인 방법**: `pytest -q tests/test_auth.py tests/test_report.py tests/test_delete_account.py`, `/docs`에서 가입 → `/children` → `/report`.

**주의할 점**
- `JWT_SECRET`이 비어 있으면 가입·로그인은 503이고 기기 기록 산책은 그대로 됩니다.
- 리포트에는 대화 문장·고른 낱말을 넣지 않습니다.
- 틀린 비밀번호로 탈퇴하면 403입니다. 401은 프론트가 '다시 로그인'으로 처리합니다.

## 백엔드 2 (저장소·기기 연결)

**이미 된 것**
- 저장소 인터페이스 `Store`와 메모리·Cosmos 구현(`STORE`로 고름), 컨테이너 8개와 파티션 키
- 스티커 하루 1장(문서 id = `child_id_날짜`), 이메일 중복 막기(`guardian_emails`)
- 기기 기록 연결 `link-device`(중간에 실패해도 다시 하면 중복·누락 없음, 기기 id는 처음 연결한 프로필에만), 오늘 산책 재개 `walks/today`

**채울 곳**

| 할 일 | 파일·함수 |
| --- | --- |
| 실제 Cosmos 계정으로 확인, 처리량(RU)·인덱스 정책 | `store_cosmos.py`의 `CONTAINERS` |
| 기간 조회 쿼리 (지금은 아이 파티션 전체를 읽고 거름) | `store_cosmos.py`의 `list_walks` 등, `services/report.py` |
| 연결 코드 등 기기 확인 강화, 큰 기록 나눠 옮기기, 연결 취소 | `routers/devices.py`, `store_cosmos.py`의 `move_child_records` |

**확인 방법**: `pytest -q tests/test_store.py tests/test_devices.py`. Cosmos 에뮬레이터 확인 순서는 `backend/README.md` '저장소' 절에 있습니다.

**주의할 점**
- 라우터는 `Store` 메서드만 씁니다. 새 메서드는 `Store`, `MemoryStore`, `CosmosStore` 세 곳에 함께 넣고, `tests/test_store.py`의 저장소 두 개 테스트에 추가합니다.
- Cosmos의 id·고유 키는 파티션 안에서만 중복을 막습니다. `children`의 고유 키는 컨테이너를 만들 때만 정할 수 있습니다.

## 백엔드 3 (학습 3 동화·AI 대화)

**이미 된 것**
- 학습 3 API: 행동 선택, 대화 시작(`/talk`, 선택 본문 `{character}`), 턴(`/conversations/{id}/turn`), 종료
- 대화 엔진 `services/conversation.py`: 보기와 보기와 같은 말은 대본. 보기와 다른 말은 마스킹 → 입력 안전 검사 → Azure OpenAI(JSON `{match, offTopic, reply, expression}`) → `prompts.resolve` → (모델 말이면) 출력 안전 검사. 형식이 틀리면 한 번 다시 묻고, 한 턴의 외부 호출 전체는 4초(`TURN_TIMEOUT`). 정하지 못하면 `fallback_to_picture`
- 대화 기록 턴마다 `resolved_by`(button·exact·llm·fallback). 그림으로 돌아간 턴은 문장 없이 남기고, 리포트 `story.resolved_by`·`fallback_to_picture`가 이 값으로 셉니다
- Azure OpenAI·AI Language PII·Content Safety 호출 자리(`services/azure.py`, `safety.py`). 키가 없으면 대본·로컬 규칙으로 동작
- 하루 모델 호출 제한 `prompts.DAILY_GENERATION_LIMIT`(30), 리포트 `story.generation_limited`
- 프론트 연결: 보기·말로 답하기·인식 실패·서버 오류·늦은 응답이 모두 기존 화면 안에서 처리됨(`frontend/src/storyTalk.js`, `StoryVoice.jsx`, `Activities.jsx`)

**채울 곳**: 실제 키로 확인(`backend/README.md` '실제 키로 확인'). 특히 그 배포가 structured outputs(`response_format` json_schema, strict)를 받는지 봅니다. 프롬프트·응답 기준은 AI 담당 영역입니다.

**확인 방법**: `pytest -q tests/test_conversation_ai.py tests/test_generation_limit.py tests/test_talk_friend.py`, `npm run e2e`의 `story-talk.spec.js`.

**주의할 점**
- 저장·로그에는 마스킹된 문장만 남깁니다. 차단 기록은 차단 여부와 범주만 남깁니다.
- 질문(`ask`·`again`)에만 `{친구}`를 씁니다. 친구의 대사에는 쓰지 않습니다(테스트가 확인함).

## AI (대화·표정)

**이미 된 것 (계획서대로 연결함)**
- 대화: 아이 말이 보기와 다를 때만 모델을 부릅니다. 모델은 JSON `{"match": 0|1|null, "offTopic": bool, "reply": str|null, "expression": str}`로 답합니다.
  - `match`가 있으면 그 보기의 대본 답(replies·ends)과 대본 표정
  - `match`가 null이고 `offTopic`이 false면 `reply`
  - 그 밖은 그림 선택으로 돌아감
- 요청 값: temperature 0.3, max_tokens 150, structured outputs(strict). 형식이 틀리면 4초 안에서 한 번 다시 묻습니다.
- 말투 규칙(1~2문장, 질문 최대 1개, 반말, 비유·반어·농담·관용구 금지, 이야기 밖 주제·개인정보 질문 금지)은 프롬프트에 있습니다. 코드는 문장 수·질문 수·길이(60자)·금지어만 검사합니다.
- API 모양(`/conversations/{id}/turn`)과 프론트 연결은 바뀌지 않았습니다.
- 표정 거울: `POST /lessons/mirror/walks/{id}/record`가 선택 항목 `score`, `score_version`, `stars`(0~3), `tracked_sec`, `attempts`, `end_reason`(locked·skipped·cameraDenied·exit)을 받습니다. 프론트는 지금 `score: null`만 보냅니다.

**채울 곳: `backend/app/services/prompts.py` 한 파일만 고칩니다**

| 할 일 | 함수·값 |
| --- | --- |
| 친구 역할·말투·장면 제한 | `SYSTEM_PROMPT` |
| 모델에 넘기는 정보 | `build_messages(tale, turn, friend_name, transcript)` (friend_name: 라온이·보리·두리, transcript: 마스킹된 아이 말) |
| 응답 모양 / 형식 확인 | `RESPONSE_SCHEMA` / `parse(content)` |
| 응답으로 친구 답 정하기 | `resolve(tale, turn, llm_output)` |
| 생성 값 | `GENERATION` |
| 코드 검사 기준 | `MAX_SENTENCES`, `MAX_QUESTIONS`, `MAX_REPLY_CHARS`, `BANNED_WORDS`, `check_reply()` |
| 안전 검사 기준 | `INPUT_MAX_SEVERITY`, `OUTPUT_MAX_SEVERITY` |
| 하루 모델 호출 수 | `DAILY_GENERATION_LIMIT` |
| 표정 유사도 점수 | 기기에서 계산해 학습 2 기록의 선택 항목으로 보냄 (`frontend/src/Activities.jsx`의 `api.recordMirror`) |

호출 순서·시간 제한·재시도·비용 제한·기록(`conversation.py`)과 안전 검사 호출(`safety.py`)은 고치지 않아도 됩니다. 자세한 흐름은 `backend/README.md` '학습 3 대화와 Azure'에 있습니다.

**확인 방법**: `pytest -q tests/test_conversation_ai.py tests/test_mirror_record.py` (모델 응답은 가짜 JSON). 기준을 바꾸면 `test_conversation_ai.py`의 예시도 함께 고칩니다. 실제 키 확인은 `backend/README.md` '실제 키로 확인'.

**주의할 점**
- 영상·얼굴 특징점·blendshape 값은 서버로 보내지 않습니다. 보내면 422입니다.
- 모델이 고른 `match`는 대본 답을 쓰므로 출력 안전 검사를 하지 않고, 모델이 만든 `reply`만 검사합니다.
- 감정은 지금 네 가지(기쁨·놀람·슬픔·화남)입니다. 두려움·싫음·평온은 교수님 자문 회신 전이라 넣지 않았습니다. 넣을 때는 `backend/README.md`의 '감정 추가 체크리스트'를 따릅니다.

## 프론트

**이미 된 것**
- 아이 화면 전체(첫 방문 → 학습 진단 → 학습 1·2·3 → 스티커판), 보호자 설정
- 서버 연결 `src/api.js`(5초 제한, 실패하면 null), 산책·학습 1·2·3·대화 기록
- 보호자 화면(서버 주소가 있을 때만): 로그인, 계정 만들기, 보호자 계정, 계정과 기록 삭제, 학습 대시보드(주간·월간)

**채울 곳**: 실제 iPad Safari에서 음성 인식(기기 안 인식)과 카메라 권한 확인.

**확인 방법**: `npm test`, `npm run build`, `npm run e2e`(서버 끈 상태·켠 상태·학습 3 대화·탈퇴, 가로 1180×820·세로 820×1180). 학습 3 대화 장면 스크린샷은 `npm run e2e:shots`(저장소 밖 `screenshots-final/lesson3/`).

**주의할 점**
- 디자인은 `DESIGN-SYSTEM.md` 토큰과 기존 컴포넌트·클래스만 씁니다. 아이 문구는 `UX-WRITING.md`의 짧은 존댓말을 따릅니다.
- 감정을 늘릴 때는 `backend/README.md`의 '감정 추가 체크리스트'를 따릅니다. 코드의 감정 목록은 고치지 않습니다.

## 배포

준비만 했고 실제 배포는 하지 않았습니다. 순서는 루트 `README.md`의 '배포 순서'에 있습니다(`backend/startup.sh`, `frontend/public/staticwebapp.config.json`, `.github/workflows/`의 직접 실행용 초안).

## 시연

`cd backend && python scripts/seed_demo.py --serve`로 시연 데이터가 든 서버를 띄웁니다. 계정은 `demo@example.com` / `maeum-demo-2026`입니다(메모리 시연). Cosmos에 넣는 방법은 `backend/README.md` '발표용 시연 데이터'에 있습니다.
