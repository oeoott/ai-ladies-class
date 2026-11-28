# AI 파트 인수인계 (브랜치 `feat/ai-learning`)

기준: `origin/feat/backend-story-talk` `f06ab3a` (11/24). 이 문서는 코드에서 확인한 내용만 적는다.
실제 Azure 호출, 웹캠·실기기 확인은 따로 표시한다. 표시가 없으면 가짜 응답·자동 검사로만 확인한 것이다.

## 검사 숫자

| 시점 | 백엔드 `pytest -q` | 프론트 `npm test` | 브라우저 `npm run e2e` | 비고 |
| --- | --- | --- | --- | --- |
| 기준 (`f06ab3a`) | 276 통과 | 63 통과 | 48 통과 | 로컬 Node 20.20.2 (권장 22.12 미만이지만 모두 통과) |
| 학습 3 후 | 485 통과 | 63 통과 | 48 통과 | 기존 테스트 파일은 고치지 않음 |

## 학습 3 대화

### 바뀐 것

| 항목 | 내용 | 파일 |
| --- | --- | --- |
| `match: 0.0` | `type(match) is int`만 받는다. 0.0·1.0·True는 형식 오류 → 한 번 다시 묻기. 이전에는 `resolve`에서 TypeError(500) | `services/prompts.py` `parse` |
| 고른 행동 연결 | **방법: `/talk` 시점에 그 산책의 `story_action` 기록을 읽어 `conv["actions"]`(순서대로, 마지막이 지금 결과)에 저장.** 프론트·API 변경 없음. 기록이 늦게 도착해 없으면 문맥에 "(아직 고르지 않음)" | `routers/story.py` `start_talk` |
| 모델 문맥 | 고른 행동 label → event, 친구 한마디(line), 먼저 해 본 다른 행동, 이전 턴의 마스킹된 말·답(그림으로 돌아간 턴 제외) | `prompts.build_messages(..., context)`, `conversation.model_context` |
| 마지막 턴 | 2턴째 생성 답은 대본 `ends`처럼 **일어난 일을 짧은 존댓말로 서술**, 질문 0개(코드 검사). 화면의 마무리 장면(카드 안 서술)과 맞춘다. API·화면 변경 없음 | `prompts.REPLY_RULES`, `MAX_QUESTIONS_BY_TURN` |
| 첫 턴 | 기존대로 친구 반말 1~2문장, 질문 1개까지. 다음에 화면이 고정 질문(again)을 하므로 겹치지 않게 하라는 규칙 추가 | `REPLY_RULES[0]` |
| 끝난 산책 | 완료·중단된 산책의 대화 턴은 409, 외부 호출 없음. `/end`는 계속 받음(화면이 끝내기와 완료를 함께 보냄) | `deps.open_conversation` |
| 동시 요청 (턴) | `Store.update_conversation`: 읽은 `rev`가 그대로일 때만 저장. 모델을 기다리는 사이 다른 턴이 저장되면 늦은 턴은 409로 버림 | `store.py`, `store_cosmos.py` |
| 동시 요청 (하루 제한) | `Store.reserve_generation(child, day, limit)`: 확인과 증가를 한 번에(메모리 잠금, Cosmos `usage_날짜` 문서 etag 조건부 교체). 대화가 여러 개여도 넘지 않음 | 같음 |
| 기기 기록 이동 | usage 문서는 프로필의 같은 날짜에 더한다. `merged_from`으로 한 번만 더하고, 더하기가 실패하면 원본을 지우지 않음 | `CosmosStore._merge_usage` |
| 안전 정책 | `AI_SAFETY_REQUIRED`(기본 false). true면 PII를 Azure로 가리지 못했을 때·Content Safety 키가 없을 때 모델을 부르지 않음(보기와 같은 말은 대본 답). false는 기존 동작 그대로 | `config.py`, `safety.py`, `conversation._may_send` |
| 프롬프트 버전 | `PROMPT_VERSION`(`friend-v0.2-draft`)을 모델 답이 있던 대화 문서에 `prompt_version`으로 남김 | `prompts.py`, `routers/story.py` |

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

### 평가 자료

- `docs/ai/eval/talk_cases.json`: 동화별 20개(보기와 같은 뜻 6, 이야기 안의 다른 답 5, 이야기 밖 4, 개인정보 3, 부적절 2), 기대 결과 포함. **기대값은 초안이라 팀 검토가 필요하다.**
- 가짜 응답 검사: `pytest -q tests/test_talk_eval_cases.py` — 형식, 그리고 모델이 기대대로 답한다고 가정했을 때 엔진이 대본·생성·그림으로 맞게 보내는지. 모델 품질은 재지 않는다.
- 실제 모델 평가: `cd backend && python -m scripts.eval_talk [--deployment 이름] [--out 경로]`. 결과는 `docs/ai/eval/results/`. match·offTopic·결과 정확도, 형식 오류 수, 시간 p50·p95, 4초 초과 수. **아직 실행하지 않았다 (모델 배포 전).** `--dry-run`은 키 없이 메시지 모양만 출력.
- 모델 비교: 배포마다 `--deployment gpt-6.1-terra`, `gpt-6.2-sol`, `gpt-5.4-mini`로 같은 사례를 돌려 요약을 비교한다.

### 결정·전달이 필요한 것 (나·ChatGPT)

1. 최종 프롬프트: `prompts.SYSTEM_PROMPT`와 `REPLY_RULES` 두 값만 바꾸고 `PROMPT_VERSION`을 올린다. 자리 이름: `{title} {friend_name} {story} {situation} {explanation} {action} {history} {ask} {choice0} {choice1} {expressions} {reply_rules}`(`REPLY_RULES` 안은 `{max_chars}`).
2. 마지막 턴 생성 답을 **서술형 존댓말**로 정했다(대본 ends와 맞춤). 친구 반말로 하려면 화면의 마무리 장면도 말풍선으로 바꿔야 한다.
3. 첫 턴 질문 허용(최대 1개)이 화면의 고정 추가 질문과 겹칠 수 있다. 0개로 할지 결정 (`MAX_QUESTIONS_BY_TURN`).
4. 평가 사례의 기대값 검토, 특히 '바보 멍청이'처럼 차단은 안 되지만 이야기 밖인 입력, 화남 주제의 '때리고 싶어'(통과해야 함).
5. 배포할 모델과 API 버전. 코드는 `2024-10-21`, structured outputs(json_schema strict)를 쓴다. 다른 버전이 필요하면 `conversation.OPENAI_API_VERSION`.

### Foundry 가드레일과 Azure Speech (코드에 없음)

| 구분 | 지금 코드 | Backend 3 담당이 준비할 것 | 코드에서 연결할 것 |
| --- | --- | --- | --- |
| Foundry(Azure OpenAI) 콘텐츠 필터·가드레일 | 없음. 앱이 PII·Content Safety를 직접 부른다 | 배포에 필터 정책(아동 대상 엄격), 차단 시 응답 형태 확인 | 필터 차단은 HTTP 400(`content_filter`) 또는 `finish_reason: content_filter`로 온다. 지금도 예외·형식 오류로 fallback되지만, 차단 기록(`safety`)에 남기려면 `_ask_model`에서 구분 필요 |
| 앱의 직접 검사 | `safety.mask_pii`(Language PII), `safety.check`(Content Safety) 입력·출력 | 리소스와 키, 한국어 PII 정확도 확인 | 그대로 유지 권장(가드레일과 이중) |
| 음성 인식 | 기기 안 인식(`StoryVoice.jsx`, ko-KR, processLocally). 음성은 서버로 안 감 | Azure Speech로 바꾼다면 리소스·지역, 토큰 발급 API, 음성 저장 여부 정책 | 브라우저에 키를 두지 않도록 서버가 짧은 토큰 발급(새 API), 프론트 인식기 교체. 원칙(음성·원문 저장 안 함) 재검토 필요 |

## 공통 기능에 영향을 주는 변경 (팀 공유)

| 대상 | 변경 | 보존한 것 |
| --- | --- | --- |
| `Store` 인터페이스 (백엔드 2) | 새 메서드 `update_conversation`, `reserve_generation`, `generations_on`. 세 곳(Store·Memory·Cosmos) 모두 구현, 두 저장소 테스트는 `tests/test_conversation_flow.py` | `save_conversation`은 그대로(시연 데이터·테스트용) |
| `conversations` 컨테이너 (백엔드 2) | 대화 문서 외에 `kind: "usage"`, id `usage_날짜` 문서가 생긴다. `list_conversations`·`get_conversation`·탈퇴 지운 수에서 제외 | 컨테이너 수 8개 그대로, 리포트 숫자 그대로 |
| 대화 문서 모양 | 새 칸 `actions`, `rev`, (모델 답이 있으면) `prompt_version`. 턴 기록 모양은 그대로 | 이전 문서(칸 없음)도 읽힘 |
| 기기 기록 연결 | usage 문서 이동(합산) 추가. 실패 후 다시 하기 보장 | 기존 연결 쓰기 수·중복 없음 테스트 그대로 통과 |
| API `/conversations/{id}/turn` | 409 두 경우 추가(끝난 산책, 동시 턴). 응답 모양 그대로 | 프론트 변경 없음 |
| 설정 | `AI_SAFETY_REQUIRED` 추가 (`.env.example`) | `/health` 모양 그대로 |
| 가짜 Cosmos (테스트) | `replace_item`(etag 조건), 저장마다 바뀌는 `_etag` | |

인증 정책, 화면, 콘텐츠(emotions·tales)는 바꾸지 않았다.
