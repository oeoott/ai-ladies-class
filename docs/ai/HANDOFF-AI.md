# AI 파트 인수인계 (브랜치 `feat/ai-learning`, 푸시 전)

기준: `origin/feat/backend-story-talk` `f06ab3a` (11/24). 코드와 실행한 검사에서 확인한 내용만 적는다.
**자동 검사는 가짜 응답·합성 입력·가짜 SDK로 돈다. 실제 모델·사진·Azure·실기기로 확인한 것은 아직 없다.**

공통 7감정 코드: `anger` 화남 · `disgust` 혐오 · `fear` 두려움 · `joy` 기쁨 · `neutral` 무표정 · `sad` 슬픔 · `surprise` 놀람.
이전 표기 평온·싫음은 `aliases`로만 남아 이전 기록이 읽힌다. 표정 거울의 `rest`는 보정용 얼굴 사진을 가리키는 자료 역할이고 감정이 아니다.

---

## 1. 구현 완료

### 학습 1 — 사진 태깅 (Colab)
- `ai/tagging/photo_tagging.py`: 얼굴 1개 검출(OpenCV Haar)·여백 자르기·RGB → `trpakov/vit-face-expression` → 7감정 점수.
  모델 config의 라벨(`angry, disgust, fear, happy, neutral, sad, surprise`, 11/28 확인)을 실행할 때 다시 확인하고 `happy→joy`, `angry→anger`로 바꾼다.
- 검토 사유: `noFace`·`multiFace`·`fileError`·`detectError`·`inferenceError`·`lowConfidence`(1위 < 0.5, 설정)·`mismatch`(추천 ≠ 의도)·`noIntended`.
- 칸 분리: 생성 의도 `intended`(파일 이름 `person03_sad.png` 또는 메타데이터 `intendedEmotion`) / 모델 추천 `aiTag`·`aiScores`·`aiNeedsReview` / 사람 검수 `confirmedTag`·`confirmedBy`·`confirmedAt`·`reviewNote`.
- 결과 JSON `photo-tags-v1`: 난이도 칸이 없다(모델 점수로 퀴즈 난이도를 정하지 않음). `scope`에 '아동 대상 성능 검증이 아니다'.
- `ai/colab/photo_tagging.ipynb`: `build_notebook.py`가 모듈을 그대로 담아 만든다. 설치 → 모델 → 업로드 → 태깅 → 원본·얼굴·점수·사유 보기 → 검수(드롭다운) → JSON 내려받기 → 전달 절차.
- 관리자 웹 화면은 만들지 않았다(추가 기능).

### 학습 2 — 표정 거울
- `facePreview.js`(blendshape·얼굴 2개·100ms) → `mirrorSession.js` → `mirrorScore.js`(보정 3초, err·cos, 중지 사유, 3초 유지 확정, 안내 문구) → 마칠 때 요약만 `api.recordMirror`.
- `mirrorBaselineBuild.js` + `scripts/mirror-baseline.mjs build|approve`, `ai/mirror/extract_blendshapes.py`(사진 → blendshape, 앱과 같은 모델 파일).
- **기준값 승인 조건(이번 보완)**
  - 자료 역할 3가지를 서로 다른 사람으로: 기준값 계산 `targetPersons`(5명 이상), 별 기준·err/cos 비교 `starPersons`(3명 이상, 팀원 웹캠 포함 가능), 최종 성능 평가 `evalPersons`. 겹치면 문제로 보고.
  - 사람마다 `rest` + 7감정 사진 8장이 모두 있어야 '완전'. `neutral` 평가 사진이 `rest`와 같은 파일이거나 같은 값이면 거부(평가가 저절로 높아짐).
  - 구분 약함(같은 표정 중간값 − 다른 표정 상위 10% < 5점), 별 기준을 정할 사진 부족, 별 순서를 임의로 맞춘 경우도 문제로 보고.
  - 빌드는 계산·측정만 한다: `status` = `measured`(문제 없음) / `measured-with-issues` / `incomplete`. `approval.approved`는 항상 false.
  - `approve`는 `measured`이고 eval 평가가 있을 때만, 그 `version`에만. 아이 화면 채점은 **승인된 기준**(`mirrorSession.baselineApproved`)에서만 켜진다. 팀 시험은 `?mirrorScore=1`.
  - 평가 범위: neutral을 포함한 7감정 모두 감정별 평가(`evaluation`). err·cos top-1 비교는 neutral을 뺀 6감정(두 방법이 같은 변화량 공식).
  - 보고서 `built.scope`: '가상 성인·팀원 얼굴로 계산했다. 아동 대상 검증이 아니다.'
- 지금 `mirrorBaseline.json`은 손으로 정한 임시값(`provisional`, 승인 없음) → 아이 화면은 기존처럼 얼굴 안내만, 서버에는 `score`·`stars`·`score_version` null.

### 학습 3 — 대화
- 행동 연결(`/talk`의 `action_index`), 이전 턴은 역할 메시지(user·assistant), 첫·마지막 턴 질문 0개, 마지막 턴 존댓말 서술, `match` 정수 검사, 끝난 산책 409, 동시 요청 보호(`update_conversation`, `reserve_generation`), `AI_SAFETY_REQUIRED`, `prompt_version` 기록.
- **이번 보완:** Azure OpenAI 콘텐츠 필터 차단(HTTP 400 `content_filter`, `finish_reason: content_filter`)을 안전 기록 `AzureOpenAIContentFilter`(`where: input|output`)로 남기고 그림 선택으로 돌아간다(재시도 없음).
- 평가 사례 `talk-eval-v3`(`docs/ai/eval/talk_cases.json`): 검수 동화 20개씩 + 초안 동화(두려움·혐오·무표정) 12개씩 = 116개, 동화마다 두 턴 대화 2개 = 14개.
  사례마다 친구(lion·rabbit·bear)와 고른 행동 순서(`[0]`·`[1]`·`[1,0]`·`[0,1]` = 다른 행동을 먼저 해 봄), 개인정보 사례의 `no_pii_echo`(최종 답에 다시 나오면 안 되는 문자열·가린 자리 표시).
- `backend/scripts/eval_talk.py`: 문맥 반영, 초안 동화는 평가 안에서만 `CONTENT_DRAFTS` 켬, `run_dialog`(첫 자유 발화의 실제 결과를 기록에 남기고 두 번째 턴), 개인정보 재출력·필터 차단·시간 초과·HTTP 오류 집계, 답을 받은 사례 정확도(`accuracy_when_answered`)와 전체 사례 성공률(`overall_rate`) 구분.

### 7감정 연결
| 부분 | 상태 |
| --- | --- |
| 감정 목록·학습 순서 | 검수된 4개는 `emotions.json`(아이 순환 그대로). 두려움·혐오·무표정은 `backend/app/content/drafts/`(초안) → `CONTENT_DRAFTS=true`·`VITE_CONTENT_DRAFTS=1`일 때만 기존 4개 뒤에 합쳐져 7개 순환 |
| 감정 탐색(학습 1 화면) | 초안에 낱말·단서·장면 문구·표현 2개. 그림 없는 카드는 단서 문구 카드로 대신(미리보기) |
| 표정 거울 | 7감정 목표값(임시)·채점·별 기준 |
| 동화 | 초안 동화 3개(3장, 행동 2개, 대화 대본). 배경은 숲 입구 그림으로 대신 |
| 친구 표정 | `PaintedFriend.DRAWN_FEELINGS` 7개(두려움·혐오 얼굴과 몸 움직임은 초안, 동작 줄이기면 없음) |
| 대화 스키마·검사 | `prompts.EXPRESSIONS`·`storyTalk.FACES` 7개, 서버 응답 `expression` 설명 갱신 |
| 평가 사례 | 초안 동화 포함(위) |
| 확인 | 백엔드: 초안을 켜면 7감정이 주제·학습 1·2·3·대화·완료까지. 프론트: 순환·동화·표정·거울·필요한 그림 목록. 미리보기 빌드 화면을 헤드리스로 찍어 두려움·혐오 얼굴을 눈으로 확인 |

### Azure Speech (한국어 STT·TTS)
- 백엔드: `GET /speech/status`(`{available, language}`), `POST /speech/token`(`{child_id}` → `{token, region, language, voice, expires_in}`).
  학습 기록과 같은 아이 접근 규칙(`check_child`), 아이당 하루 60회(`SPEECH_TOKENS_PER_DAY`, `reserve_generation`의 `speech-날짜` 키), 9분 서버 캐시, `Cache-Control: no-store`, 키·토큰은 응답·로그에 없음.
- 프론트: `microsoft-cognitiveservices-speech-sdk` 1.53.0(필요할 때만 불러오는 별도 파일), `azureSpeech.js`(`SpeechConfig.fromAuthorizationToken`, `ko-KR`, `recognizeOnceAsync`, `SpeakerAudioDestination` 재생·중지, 토큰은 만료 30초 전까지 재사용).
- `StoryVoice`: 보호자가 Azure를 골랐고 서버가 가능할 때만 Azure 인식. 마이크는 '말로 답하기'를 누를 때만. 쉬기·탭 숨김·이탈·'듣기 멈추기'면 인식 종료·늦은 결과 무시. 키 없음·권한 거부·통신 오류·인식 실패 → '화면에서 하고 싶은 말을 눌러 보아요.'
- 읽어 주기(`narration.js`): 녹음된 라온 음성 → Azure TTS → 실패 시 브라우저 음성. 마이크가 열린 동안은 아무것도 읽지 않고, 듣기 시작 전에 재생을 멈춘다(되울림 방지).
- 보호자 설정 > '음성 기능': 이 기기 인식(기본) / Azure(전송 안내와 동의 체크 후). 서버에 설정이 없으면 '(서버 연결 안 됨)'이고 사용하지 않는다. 화면에 '아직 아이패드에서 확인하지 않은 기능'이라고 적었다.
- 음성은 브라우저에서 Azure로 바로 간다(앱 서버를 거치지 않음). 앱 DB·로그에 음성·인식 원문을 저장하지 않는다(보기와 다른 말은 기존처럼 개인정보를 가린 문장만 대화 기록에). AGENTS.md·PRD.md·HANDOFF.md의 '기기 안에서만' 문구를 실제 동작에 맞게 고쳤다.

### 콘텐츠 이력
- `ai/content/asset_manifest.py` → `docs/ai/content/asset-manifest.json`(`asset-manifest-v1`): 그림·음성 88개. 칸: 파일·종류·의도한 감정(그림)·주제(음성)·모델{이름, 버전}·프롬프트·프롬프트 출처·생성일·검수{결과, 검수자, 검수일, 메모}·저장소 추가 커밋·출처·`unknown`.
- 채운 값: 카드 4장(남자아이) 모델 ImageGen·생성일 11/20(PRD.md), 동화 배경 4장 프롬프트 출처 `prompts/tale-backgrounds.md`. 나머지는 확인할 기록이 없어 비워 두고 `unknown`에 적었다. 검수 기록은 하나도 없다.

---

## 2. 자동 검사 완료

| 시점 | 백엔드 `pytest -q` | `ai/tests` | 프론트 `npm test` | 브라우저 `npm run e2e` |
| --- | --- | --- | --- | --- |
| 기준 `f06ab3a` | 276 | — | 63 | 48 |
| 이번 작업 끝 | 616 | 38 | 114 | 58 |

`npm run build`(아이용)와 `VITE_CONTENT_DRAFTS=1` 미리보기 빌드 모두 성공. 로컬 Node 20.20.2(권장 22.12 미만).

무엇을 검사했는지:
- 학습 1: 라벨 매핑, 점수 7개·합 1, 의도 감정(파일 이름·메타데이터·이전 표기), 자르기, 검토 사유 전부, 검수 칸 분리, 결과 형식, 노트북이 모듈과 같은지·문법(35개). **가짜 검출기·분류기라 정확도 검증이 아니다.**
- 학습 2: 채점 규칙, 세션·서버 요약, 승인 조건(합성 입력으로 역할 중복·인원 부족·사진 누락·rest=neutral·구분 불가능 표정에서 승인되지 않음, 깨끗한 자료는 measured이지만 미승인), 승인 명령, 추출 도구(MediaPipe 없이).
- 학습 3: 대화 엔진·동시 요청·필터 차단, 평가 사례 형식·문맥 범위, 가짜 모델로 사례별 경로·두 턴 대화의 역할 메시지·개인정보 재출력 판정·필터·시간 초과 집계.
- 7감정: 위 '확인' 줄.
- Speech: 토큰 발급(키 없음 503, 접근 401·403, 하루 제한 429, 실패 502, 캐시, 로그에 키·토큰 없음), 가짜 SDK로 인식·취소·늦은 결과·재생 중지·되울림 방지·토큰 재사용, 브라우저에서 보호자 선택·동의·서버 미설정 시 미사용·Azure 실패 시 문구 선택(모든 microsoft.com 요청을 막고).
- manifest: 모든 자산 등재, 값에는 출처, 사람이 채운 값 유지.

### 바꾼 기존 테스트 (요구사항 변경과 이유)
| 테스트 | 바꾼 것 | 이유 |
| --- | --- | --- |
| `test_conversation_ai.py` 규칙 문구·질문 1개 허용 사례 | '질문하지 않는다', 질문 1개 답은 거부 | 첫 턴 질문 0개 결정 |
| `e2e/online.spec.js` 학습 2 기록 본문 | 요약 칸 8개를 정확히 비교 | `recordMirror`가 요약 칸을 모두 보냄 |
| `mirrorSession.test.js` 'measured면 채점' | '승인된 기준이면 채점', measured만으로는 꺼짐 | 측정과 승인 분리 |
| `mirrorBaselineBuild.test.js` 'partial' 상태 | `incomplete`, 역할·인원·완전성 검사 추가 | 승인 조건 보완 |
| `test_talk_eval_cases.py` '동화별 20개'·'위협 4개' | 검수 20·초안 12, 위협 6 | 평가 사례 v3 |

---

## 3. 실제 모델·사진·실기기 검증 완료

**없음.** 아래는 모두 '대기'다.

---

## 4. 외부 자료·설정 대기

| 항목 | 필요한 것 | 받으면 할 일 |
| --- | --- | --- |
| 학습 3 Azure OpenAI | 최종 프롬프트 본문, 배포 이름·API 버전(코드는 `2024-10-21`, json_schema strict) | `prompts.SYSTEM_PROMPT`·`REPLY_RULES` 교체, `PROMPT_VERSION` 올림 → `python -m scripts.eval_talk --deployment …`를 후보 모델(`gpt-6.1-terra`, `gpt-6.2-sol`, `gpt-5.4-mini`)마다 → `docs/ai/eval/results/` |
| 학습 3 안전 서비스 | AI Language·Content Safety 키, Foundry 필터 정책 | `safety.mask_pii`·`check` 실제 확인(README '실제 키로 확인'), 평가의 실제 차단 결과 기록 |
| 학습 1 | Colab 실행 결과(`photo_tags_*.json`) | `docs/ai/tagging/`에 두고 요약 확인. **성인 사진 결과이며 아동 대상 성능이 아님** |
| 학습 2 | 기준 사진: 가상 성인 기준 5명 + 별 기준 3명 이상 + 최종 평가 인원 × (rest + 7감정), 팀원 웹캠 | 추출 → `build` → 보고서 검토 → 문제 없으면 `approve` |
| Speech | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`(필요하면 `AZURE_SPEECH_VOICE`) | `/speech/status` 확인 → 보호자 설정에서 Azure 선택 → 말로 답하기·읽어 주기 |
| 실기기 | iPad Safari | 마이크 권한·Azure 인식·Azure 읽어 주기·쉬기/탭 숨김 때 중단, 카메라와 `?mirrorScore=1` 프레임 속도, 기기 안 인식 |
| 그림 | 두려움·혐오·무표정의 `cards/{id}.webp`·`girl-{id}.webp`, `practice/{id}-before·after.webp`, 동화 배경 `tale/{id}-{장소}.webp`(1536×1024) + `taleBackgrounds.js` 한 줄 | 넣은 뒤 manifest 갱신(`python ai/content/asset_manifest.py`) |

## 5. 팀 검수·승인 대기

- 초안 콘텐츠: 두려움·혐오·무표정의 낱말(특히 혐오 `kin: 역겨워요`, 무표정 `phrase: 덤덤한 마음`), 단서·동작, 동화 상황의 강도 → 특수교사·교수님 자문. 검수 후 `drafts/`에서 `emotions.json`·`tales.json`으로 옮긴다.
- 친구 표정 두려움·혐오 그림(초안).
- 표정 거울: 안내 문구(`feedback`, 초안), 기준값 보고서 검토 후 승인, 3초 유지 확정이 아이에게 과제처럼 느껴지는지.
- 학습 3 평가 기대값(특히 `feeling` 사례의 생성 답은 사람이 판정).
- 학습 1 검수 라벨(노트북 7단계)과 앱 반영 여부.
- 생성 자산 manifest의 모델·프롬프트·생성일·검수 칸(알고 있는 팀원이 채움).
- Azure 음성 사용 안내 문구(보호자 설정 '음성 기능')와 보호자 동의 방식.

---

## 남은 항목 (영역별)

| 영역 | 남은 것 |
| --- | --- |
| 학습 1 | Colab 실제 실행, 결과 검수, 앱 콘텐츠 반영(아래 절차), 관리자 화면(추가 기능) |
| 학습 2 | 기준 사진·웹캠 자료, 기준값 계산·승인, iPad 성능, 웹캠 프레임 → blendshape 저장 도구(필요하면) |
| 학습 3 | 최종 프롬프트, 실제 모델 평가·비교, 안전 서비스 실제 확인, 평가 기대값 검토 |
| 7감정 | 그림 9종×3, 콘텐츠 검수 후 이동, 녹음 음성(선택), 동화 소품(선택) |
| Speech | 키·지역 설정 후 실제 연결 확인, iPad Safari 마이크·재생·중단, 보호자 안내 검토 |

### 학습 1 — 앱 콘텐츠 반영 절차
1. 노트북 결과 JSON에서 `confirmedTag`가 있고 `reject`가 아닌 사진만 후보.
2. 그 감정의 카드로 쓸 사진을 팀이 고르고 626×626 WebP로 `frontend/public/art/cards/{id}.webp`(남자아이)·`girl-{id}.webp`(여자아이)에 넣는다.
3. `python ai/content/asset_manifest.py`로 항목을 만들고 모델·프롬프트·생성일·의도한 감정·검수(태그 JSON의 confirmedBy·confirmedAt)를 채운다.
4. 카드 단서 문구(`emotions.json`의 `clue`)가 새 사진과 맞는지 확인.

---

## 환경 변수 (이름만)

| 위치 | 이름 | 기본 |
| --- | --- | --- |
| 백엔드 | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT` | 비면 대본만 |
| 백엔드 | `AZURE_LANGUAGE_ENDPOINT`, `AZURE_LANGUAGE_KEY`, `AZURE_CONTENT_SAFETY_ENDPOINT`, `AZURE_CONTENT_SAFETY_KEY` | 비면 로컬 규칙·통과 |
| 백엔드 | `AI_SAFETY_REQUIRED` | false (배포는 true 권장) |
| 백엔드 | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_SPEECH_VOICE` | 비면 음성 기능 꺼짐, 음성 `ko-KR-SunHiNeural` |
| 백엔드 | `CONTENT_DRAFTS` | false (미리보기만 true) |
| 프론트 빌드 | `VITE_API_URL`, `VITE_CONTENT_DRAFTS` | 초안 꺼짐 |

비밀값은 `backend/.env`(git 제외)나 App Service 앱 설정에만 둔다.

## 실행 방법

```sh
# 검사
cd backend && .venv/bin/python -m pytest -q          # 백엔드
cd .. && backend/.venv/bin/python -m pytest -q ai/tests   # 태깅·추출·manifest 도구
cd frontend && npm test && npm run build && npm run e2e

# 7감정 미리보기
CONTENT_DRAFTS=true uvicorn app.main:app --reload     # backend
VITE_CONTENT_DRAFTS=1 npm run dev                      # frontend

# 학습 3 실제 평가 (키 필요)
cd backend && python -m scripts.eval_talk --dry-run
python -m scripts.eval_talk --deployment <배포 이름> --out ../docs/ai/eval/results/<이름>.json

# 학습 2 기준값
python ai/mirror/extract_blendshapes.py <사진폴더> --out docs/ai/mirror/blendshapes.json
cd frontend && node scripts/mirror-baseline.mjs build --input ../docs/ai/mirror/blendshapes.json \
  --target-persons p01,p02,p03,p04,p05 --star-persons p06,p07,p08,team1 --eval-persons p09,team2 \
  --report ../docs/ai/mirror/report.json            # 확인 후 --out src/mirrorBaseline.json
node scripts/mirror-baseline.mjs approve --file src/mirrorBaseline.json --by <검토자>

# 학습 1: ai/colab/photo_tagging.ipynb를 Colab에서 열기 (모듈을 고치면 python ai/colab/build_notebook.py)
# 자산 이력: python ai/content/asset_manifest.py  (--check로 누락 확인)
```

## 공통 인터페이스 변경 (팀 공유)

| 대상 | 변경 | 보존한 것 |
| --- | --- | --- |
| `Store` (백엔드 2) | `update_conversation`, `reserve_generation`, `generations_on` (세 구현·두 저장소 테스트) | `save_conversation` 그대로 |
| `conversations` 컨테이너 | `kind: usage` 문서(`usage_날짜`, 음성 토큰은 `usage_speech-날짜`). 대화 목록·조회·탈퇴 수에서 제외, 기기 이동 시 한 번만 합산 | 컨테이너 8개, 리포트 숫자 |
| 대화 문서 | `actions`, `rev`, `prompt_version`, 안전 기록에 `AzureOpenAIContentFilter`(`where`) | 턴 기록 모양 |
| `/lessons/story/walks/{id}/talk` | 선택 칸 `action_index` | 빈 본문·`character`만도 동작 |
| `/conversations/{id}/turn` | 409(끝난 산책·동시 턴), `expression`에 `fear`·`disgust` 가능 | 응답 모양 |
| 새 API | `GET /speech/status`, `POST /speech/token` | `/health` 모양 그대로 |
| 콘텐츠 | `content/drafts/`, `EMOTION_CODES`, `draft_ids()`, 프론트 `content.draftIds`·`mergeDrafts` | `emotions.json`·`tales.json`의 4개 |
| 프론트 | `api.recordMirror`(요약 8칸), `api.speechStatus`·`speechToken`, `facePreview`의 `onFrame`, `narration.setSpeechProvider`·`setMicOpen`, `StoryVoice`의 Azure 경로, 보호자 설정 '음성 기능', `PaintedFriend` 7표정 | 기존 화면·문구(음성 안내 문구만 실제 동작에 맞게) |
| 설정 | `AI_SAFETY_REQUIRED`, `CONTENT_DRAFTS`, `AZURE_SPEECH_*`, `VITE_CONTENT_DRAFTS` | |
| 의존성 | `microsoft-cognitiveservices-speech-sdk` 1.53.0 (npm audit 0건) | |

인증 정책은 바꾸지 않았다.

---

## 부록: 세부 규칙 (이전 판에서 옮김)

### 안전 서비스 정책 표

| 서비스 | 키 없음 | 키 있음 + 실패 | `AI_SAFETY_REQUIRED=true` |
| --- | --- | --- | --- |
| Azure OpenAI | 부르지 않음 → 그림 선택 | 그림 선택 (형식 오류만 1회 재시도) | 같음 |
| AI Language PII | 로컬 규칙(전화·이메일)으로 가리고 계속 | 같음 | 모델을 부르지 않음 |
| Content Safety | 통과 | 막음 | 키 없어도 막음 |

**권장: 배포(App Service)에서는 `AI_SAFETY_REQUIRED=true`.** 로컬 규칙은 이름·주소·학교를 가리지 못한다.

### 오류·늦은 응답 처리 (확인한 경로)

| 경우 | 서버 | 프론트 |
| --- | --- | --- |
| 형식 오류 | 4초 안에서 1회 재시도, 그래도 틀리면 fallback | 그림 선택 |
| 안전 차단 | fallback, `safety`에 범주만 | 그림 선택 |
| 통신 오류·시간 초과 | 재시도 없이 fallback (턴 전체 `TURN_TIMEOUT` 4초) | 그림 선택 |
| 늦은 응답 (5초 넘음) | — | `api.js` 5초 제한 → null → 로컬 대본. `isCurrent`로 장면이 바뀐 뒤 온 답은 버림 (e2e `story-talk.spec.js`) |
| 409 (끝난 산책·동시 턴) | 저장하지 않음 | null과 같음 → 로컬 대본. 그 뒤 `talkId`를 비워 이후 턴은 로컬 |

제한 시간(서버 4초·프론트 5초)은 바꾸지 않았다.

### 채점 규칙 (계획서대로, 코드 확인)

- 보정: 카메라를 켠 뒤 얼굴 하나가 안정적으로 보이는 3초 평균을 저장하고 이후 프레임에서 뺀다. 보정 중에 멈추면 보정을 처음부터 다시 한다.
- 특징: MediaPipe 실제 이름(`cheekSquintLeft`, `mouthSmileLeft` 등, 모델 파일에서 52개 이름 확인).
- 오차 방식(기본 `err`): 특징별 오차 = |보정값 − 목표값| ÷ 목표값을 0~1로 자르고, 목표값의 80% 이상이면 0. 점수 = 100 × (1 − 평균 오차). 목표를 넘으면 감점하지 않는다.
- 코사인 방식(`cos`): 같은 입력·출력. 코사인 × 크기(|보정| ÷ 0.8|목표|, 최대 1). 움직임이 없으면(0 벡터) 0점. 별 기준은 방법마다 따로 둔다(`stars.err`, `stars.cos`).
- neutral(무표정): 100 × (1 − 변화량 ÷ 상한 0.15). 변화량은 눈 깜빡임·시선(`eyeBlink*`, `eyeLook*`)을 뺀 blendshape의 평균 |값 − 보정값|.
- 0에 가까운 목표값(`minTarget` 0.05 미만)은 빼고 경고, 쓸 특징이 없으면 오류. 별 기준이 거꾸로면 앞 기준으로 올리고 경고.
- 중지: 얼굴 없음(noFace), 두 얼굴(multiFace), 불안정(unstable: 프레임 간격 500ms 초과 또는 특징 평균 변화 0.35 초과). 중지하면 점수 대신 안내하고 3초 유지가 처음부터 다시 시작한다.
- 확정: 별 1개 이상을 3초 유지하면 확정, 그 유지 구간의 최고 점수. 피드백은 기준과 차이가 가장 큰 특징의 문구(별 3개면 없음).
- 카메라 끄기·쉬기·탭 숨김·화면 이탈: 채점 상태와 보정·유지 시간을 모두 지운다. 다시 켜면 보정부터. 방문 한 번의 최고 결과·카메라 횟수·추적 시간은 기록용으로 남긴다.

### 아이 화면 (임시 기준값 동안은 보이지 않음)

AGENTS.md의 "유사도와 별 점수는 AI 담당의 기준이 확정되기 전까지 산출하지 않는다"에 따라, **승인된 기준(`status: measured` + 그 버전의 `approval.approved`)일 때만** 채점하고 보여 주고 보낸다. 지금(`provisional`)은 기존처럼 얼굴 안내만 하고, 서버에는 `score`·`stars`·`score_version`을 null로 보낸다. 팀 웹캠 시험은 주소에 `?mirrorScore=1`을 붙이면 임시 기준값으로 채점한다(이때 기록의 `score_version`은 `err-v1-prov`).

| 상태 | 문구 (UX-WRITING 짧은 존댓말, 숫자·카운트다운 없음) |
| --- | --- |
| 보정 | 평소 얼굴로 잠깐 있어 봐요. |
| 얼굴 없음 / 두 얼굴 / 불안정 | 얼굴이 화면에 보이게 해 봐요. / 한 사람만 화면에 보이게 해 봐요. / 잠깐 가만히 있어 봐요. |
| 채점 | 기준값 JSON의 `feedback` 문구(예: 입꼬리를 위로 올려 봐요.). 별 3개면 '표정을 잘 따라 하고 있어요.' |
| 확정 | 표정을 잘 따라 했어요! |

별은 `★☆` 모양으로 보여 주기만 하고(`aria-hidden`), 낭독·화면 읽기는 상태 문구 한 줄이 맡는다(프레임마다 읽지 않음). 색 말고 모양으로 구분한다. 새 클래스는 `.edu-mirror-stars` 하나(토큰 `--forest-ink`, `--forest-prompt-size`).

**'시간 제한·압박 없음' 원칙과 3초 유지 확정:** 부딪히지 않게 했다. 카운트다운·남은 시간·실패 표시가 없고, 3초 유지는 아이에게 보이지 않는 내부 판정이다. '표정 연습 마쳤어요'는 언제든 누를 수 있고 확정하지 않아도 다음으로 간다. 다만 확정 순간에 문구가 바뀌는 것이 아이에게 '해내야 하는 과제'로 느껴지는지는 특수교사·사용자 검토가 필요하다.

### 서버 기록 (`api.recordMirror`, 바뀐 인터페이스)

`{mode, score, skipped, score_version, stars, tracked_sec, attempts, end_reason}`을 모두 보낸다. 서버 `MirrorRecord`는 그대로다.

- `mode`: 카메라가 한 번이라도 켜졌으면 camera, 아니면 touch
- `score`·`stars`: 확정 결과, 없으면 채점 중 최고값, 채점하지 않았으면 null
- `end_reason`: locked(확정) · exit(카메라를 썼지만 확정 없이 마침) · cameraDenied(카메라를 요청했지만 열리지 않음) · skipped(그림으로만 연습)
- `tracked_sec`: 얼굴 하나가 보인 시간의 합(방문 한 번, 카메라를 여러 번 켜면 더함). `attempts`: 카메라가 켜진 횟수
- blendshape·영상·랜드마크는 보내지 않는다(서버도 422)
