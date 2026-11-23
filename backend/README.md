# 마음숲 백엔드 (기본 틀)

하루 한 감정 산책의 **학습 1 감정 탐색 → 학습 2 표정 거울 → 학습 3 동화·대화** API 기본 틀입니다.
콘텐츠(감정 낱말·동화)는 `app/content/emotions.json`, `tales.json` 한 곳에만 있고, 프론트엔드(`frontend/src/content.js`)도 같은 파일을 읽습니다.
저장소는 `STORE` 설정으로 메모리(기본값)와 Azure Cosmos DB 중에 고릅니다. 라우터는 저장소 인터페이스(`app/store.py`의 `Store`)만 씁니다.

## 실행

```sh
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload      # http://localhost:8000/docs
pytest -q
```

### 발표용 시연 데이터

```sh
python scripts/seed_demo.py --serve                       # 메모리: 데이터를 채운 서버를 바로 띄움 (끄면 사라짐)
python scripts/seed_demo.py --password '<시연 비밀번호>'   # Cosmos: STORE=cosmos와 COSMOS_* 설정으로 저장
```

- 시연 계정 `demo@example.com`, 아이 '하늘'(라온). 메모리 시연 비밀번호는 `maeum-demo-2026`, Cosmos는 `--password`(또는 `DEMO_PASSWORD`)로 꼭 정합니다.
- 최근 2주: 산책 10번(스티커 10장)과 복습 1번, 네 감정, 정답·오답·단서, 카메라 사용·안 함, 보기·말로 답하기, 그림으로 돌아간 대화 2번. 오늘은 비워 둬서 시연에서 직접 산책할 수 있습니다. 학습 대시보드에서는 슬픔이 '더 연습해 볼 감정'으로 나옵니다.
- 다시 실행하면 같은 이메일의 시연 계정을 탈퇴와 같은 방법으로 모두 지우고 새로 만듭니다.
- 앱에서 보려면 프론트를 서버 주소로 켜고, 보호자 설정 → 보호자 계정 → 로그인합니다. 그 기기의 기록도 시연 아이에게 연결됩니다.

## 구조

```
app/
  main.py            앱 생성, CORS, 라우터 등록
  config.py          환경 변수 (.env.example 참고)
  deps.py            공통 의존성 (보호자 토큰, 아이 소유 확인, 산책·대화 조회, 한국 날짜)
  schemas.py         요청·응답 형식
  store.py           저장소 인터페이스(Store) + 메모리 구현, STORE로 구현 선택
  store_cosmos.py    Azure Cosmos DB 구현 (azure-cosmos)
  content/           emotions.json, tales.json
  routers/
    auth.py          보호자 가입·로그인, /me
    children.py      아이 프로필 (보호자당 1명, 별명·출생 연도(선택)·캐릭터)
    report.py        레벨 테스트 저장·조회, 보호자 리포트
    devices.py       기기 기록 연결, 오늘 산책 재개
    walks.py         산책 시작·중단·완료, 스티커 (날짜당 1장, 복습 제외)
    emotion.py       학습 1 감정 탐색
    mirror.py        학습 2 표정 거울
    story.py         학습 3 동화 행동 선택 + 대화
  services/
    conversation.py  대화 엔진 (대본 + Azure OpenAI 생성, 한 턴 4초 제한)
    prompts.py       시스템 프롬프트·메시지·응답 검사 (AI 담당 수정 영역)
    safety.py        개인정보 마스킹(Azure AI Language)·안전 검사(Azure AI Content Safety)
    azure.py         Azure 외부 호출 공통 지점 (마감 시각 공유)
    auth.py          비밀번호 해시(scrypt), 로그인 토큰(JWT)
    account.py       탈퇴: 지우는 순서 (보호자 계정을 맨 마지막에)
    report.py        리포트 집계 (숫자만, 대화 문장 없음)
scripts/
  seed_demo.py       발표용 시연 데이터 (보호자 하나, 아이 하나, 최근 2주)
tests/
  conftest.py        모든 테스트를 키 없음 + 외부 호출 차단 상태로 시작
  test_walk_flow.py
  test_auth.py       가입·로그인, 아이 프로필, 다른 보호자 접근 403
  test_delete_account.py  탈퇴 (쓰기마다 한 번 실패시킨 뒤 다시 하기)
  test_seed_demo.py  시연 데이터 숫자, 다시 실행하면 바뀜
  test_report.py     레벨 테스트·리포트
  test_devices.py    기기 기록 연결 (실패 후 다시 하기, 다른 집 막기), 산책 재개
  test_store.py      저장소 테스트 (메모리·Cosmos 가짜 클라이언트에 같은 테스트)
  fake_cosmos.py     Cosmos SDK를 흉내 내는 가짜 컨테이너
  test_conversation_ai.py  외부 호출을 가짜로 바꾼 대화 테스트 (모델 응답은 가짜 JSON: match·offTopic·reply·재시도)
  test_mirror_record.py    학습 2 기록 칸 (얼굴 특징 값은 422)
  test_talk_friend.py      질문의 {친구} 자리
  test_generation_limit.py 하루 생성 호출 제한 (비용 제한)
```

## API

| 단계 | 메서드 | 경로 | 내용 |
| --- | --- | --- | --- |
| 보호자 | POST | /auth/signup | {email, password} → {token, guardian}. 같은 이메일(대소문자 무시)이면 409 |
| 보호자 | POST | /auth/login | {email, password} → {token, guardian}. 틀리면 401 |
| 보호자 | GET | /me | 토큰의 보호자 {id, email} |
| 보호자 | DELETE | /me | 탈퇴 {password}. 계정·아이·모든 기록·이메일 문서·기기 연결을 지움. 비밀번호가 틀리면 403, 토큰이 없으면 401. 중간에 실패하면 다시 부르면 됨 |
| 보호자 | POST | /children | {nickname, birth_year?, character} → 아이 프로필. 보호자당 1명, 이미 있으면 409. 다른 칸을 보내면 422 |
| 보호자 | GET | /children | 내 아이 프로필 (0개 또는 1개) |
| 보호자 | PATCH | /children/{id} | {nickname?, birth_year?, character?} 보낸 칸만 바꿈 (숲 친구 꾸미기 완료) |
| 레벨 테스트 | POST | /children/{id}/placement | {answers: [{target, picks, used_hint}], level} 저장. 토큰 없으면 기기 child_id |
| 레벨 테스트 | GET | /children/{id}/placement | 마지막 레벨 테스트 결과 (없으면 404) |
| 보호자 | GET | /children/{id}/report?from=&to= | 리포트 숫자 (보호자 토큰 필수, 기간 비우면 오늘까지 30일) |
| 보호자 | GET | /children/{id}/report/monthly?to=2026-11&months=6 | 월별 산책 수 (스티커 받은 날 수, 달력과 같은 기준). `to` 달까지 `months`개월(1~24, 기본 6), 오래된 달부터. 토큰·소유 확인은 리포트와 같음 |
| 보호자 | POST | /children/{id}/link-device | {device_child_id} 기기 기록을 프로필로 옮김. 여러 번 해도 중복 없음 |
| 공통 | GET | /children/{id}/walks/today | 오늘 진행 중인 산책과 step ({walk: null}이면 없음) |
| 공통 | GET | /topics | 감정 주제 목록 |
| 공통 | POST | /walks | 산책 시작 {child_id, topic_id, level, day?, review?} |
| 공통 | GET | /walks/{id} | 산책 상태 (step 0·1·2, status) |
| 공통 | POST | /walks/{id}/stop | 중단 |
| 공통 | POST | /walks/{id}/complete | 완료, 스티커 지급 (같은 날짜 1장, 복습 제외) |
| 공통 | GET | /children/{child_id}/stickers | 스티커 받은 날짜 |
| 학습 1 | GET | /lessons/emotion/{topic}?level= | 단서, 낱말 보기 (기본 2개, 확장 3개·복수 선택) |
| 학습 1 | POST | /lessons/emotion/walks/{id}/answer | 낱말 채점 (서버 판정), 오답이면 단서 반환 |
| 학습 2 | GET | /lessons/mirror/{topic} | 따라 할 표정 안내 |
| 학습 2 | POST | /lessons/mirror/walks/{id}/record | {mode: camera·touch, score: null, skipped} 기록. 선택: `score_version`, `stars`(0~3), `tracked_sec`, `attempts`, `end_reason`(locked·skipped·cameraDenied·exit). 영상·얼굴 특징·blendshape 값 등 다른 칸은 422 |
| 학습 3 | GET | /lessons/story/{topic} | 동화 3장, 상황, 행동 보기 |
| 학습 3 | POST | /lessons/story/walks/{id}/action | 행동 선택 → 결과 장면 |
| 학습 3 | POST | /lessons/story/walks/{id}/talk | 대화 시작 → 질문, 보기. 본문(선택) `{character: lion·rabbit·bear}`로 질문의 `{친구}`를 정함 (없으면 라온). 아이가 붙인 별명은 받지 않음 |
| 학습 3 | POST | /conversations/{id}/turn | {choice_index 또는 text, input_mode} → 친구 답과 표정 `expression`(joy·surprise·sad·anger·neutral, 그림 선택으로 돌아갈 때는 null) (2턴 후 종료). 기록에는 턴마다 `resolved_by`(button·exact·llm·fallback) |
| 학습 3 | POST | /conversations/{id}/end | 대화 종료 버튼 |

## 프론트 연결 메모

`frontend/src/api.js`에서 지키는 규칙입니다. 서버가 없거나 요청이 실패하면 지금처럼 로컬 데이터로 진행합니다. 보호자 계정 하나에 아이 하나입니다.

| 상태 | 학습·산책·대화·스티커·레벨 테스트 요청 | 보호자 화면 요청 (`/me`, `/children`, report) |
| --- | --- | --- |
| 로그인 안 함 | 토큰 없이 기기 child_id | 보내지 않음 |
| 로그인함, 아이를 아직 못 정함 또는 기기 연결 전 | 토큰 없이 기기 child_id | 토큰 |
| 기기 연결 중 | 보내지 않고 기다림 (아래) | 토큰 |
| 기기 연결 후 | 토큰 + 그 계정의 아이 id | 토큰 |

- **가입하면** 이 기기의 숲 친구(캐릭터)와 이름으로 아이 프로필을 자동으로 만들고(`POST /children`), 바로 기기 기록을 연결합니다(`link-device`). 이름이 비어 있으면 숲 친구 이름(라온·보리·두리)을 별명으로 씁니다.
- **로그인하면** 그 계정의 아이(`GET /children`)로 바로 정하고 기기 기록을 연결합니다. 이 기기의 숲 친구와 이름은 그 아이의 캐릭터·별명으로 바꿉니다(장식은 기기마다 그대로). 아이가 없으면(가입 때 만들기가 실패한 경우) 이 기기의 숲 친구로 만듭니다.
- 다른 기기에서 같은 계정으로 로그인해도 그 기기의 기기 child_id를 같은 아이에게 연결하므로, 각 기기 기록이 그 아이로 모입니다.
- 아이 정하기나 연결이 실패하면 앱을 다시 열 때, 또는 대시보드의 '다시 불러오기'로 다시 합니다(여러 번 불러도 중복 없음).
- 로그인한 상태에서 숲 친구 꾸미기의 '꾸미기 완료'를 누르면 바뀐 숲 친구와 이름을 아이 프로필에도 보냅니다(`PATCH /children/{id}`, 기다리지 않음). 서버가 없거나 실패하면 지금처럼 기기에만 저장합니다.
- 기기 기록을 옮기는 동안 생긴 학습·산책·대화·레벨 테스트 요청은 보내지 않고 기다렸다가, 연결이 끝나면 아이 id와 토큰으로 보냅니다. 연결이 실패하면 원래대로 기기 id로 보냅니다(`guardian.js`의 `createLinkGate`). 화면은 기다리지 않습니다. 대화 시작·턴은 화면이 답을 기다리므로, 연결을 기다리는 시간도 기존 5초 안에 넣고 넘으면 보내지 않습니다. 화면은 지금처럼 로컬 대본으로 이어 갑니다.
- 연결한 뒤에는 학습·산책·대화 요청을 항상 아이 id와 토큰으로 보냅니다. 연결된 기기 child_id로는 다시 보내지 않습니다(서버도 401로 막습니다).
- 산책 도중에 로그인해 연결해도 `walkId`는 그대로 씁니다. 산책 문서가 같은 id로 아이 쪽에 옮겨지므로 이어서 한 기록이 아이에게 남습니다(`tests/test_devices.py`).
- 로그아웃하면 기기 child_id(`maeum-forest.child-id.v1`)를 새로 만듭니다. 그 뒤는 '로그인 안 함'과 같습니다.
- 알려진 한계:
  - 진행 상태와 스티커판(`session.js`, localStorage `maeum-forest.walk.v1`)은 기기마다 따로입니다. 서버 기록은 아이 하나로 모이지만, 다른 기기에서 받은 스티커는 이 기기 스티커판에 나오지 않습니다. 모은 기록은 학습 대시보드에서 봅니다.
  - 로그인이 만료되면 다시 로그인할 때까지 학습 기록을 서버에 보내지 않고 건너뜁니다(연결된 기기 id로는 보낼 수 없음).

### 화면 목록 (0단계에서 정하고 '보호자 하나에 아이 하나'로 고친 것)

| 화면 | 들어갈 내용 | 재사용한 것 |
| --- | --- | --- |
| 보호자 설정 (기존 메뉴에 두 줄 추가) | '보호자 계정'(로그인한 이메일 또는 '로그인 안 함'), '학습 대시보드'. 서버 주소가 있을 때만 보임 | `MenuRow` |
| 보호자 로그인 | 설명 한 문장, 이메일 주소(부모님 이메일 패널에서 저장한 주소로 미리 채움), 비밀번호, '로그인', '계정 만들기' | `Panel`, `forest-account-form`, `forest-field-error`, `forest-panel-primary`, `forest-panel-link` |
| 보호자 계정 만들기 | 같은 입력칸, '가입하기', '이미 계정이 있어요'. 가입하면 아이 프로필 자동 생성 | 위와 같음 |
| 보호자 계정 (로그인 후) | 이메일, 아이 별명, 로그아웃, '계정과 기록 삭제' | `report-recipient`, `forest-panel-secondary` |
| 계정과 기록 삭제 | 되돌릴 수 없다는 설명 한 문장, 비밀번호, '삭제하기', '취소'. 지우면 '계정과 학습 기록을 지웠어요.'와 '설정으로 돌아가기' | `Panel`, `forest-account-form`, `forest-field-error`, `forest-panel-primary`, `forest-panel-link`, `forest-panel-secondary` |
| 학습 대시보드 | 한 칸, 세 가지만: 기간(주간 = 월~일, 월간 = 1일~말일, 이전·다음 화살표) 동안 마친 산책 수와 주간은 스티커 받은 날 동그라미, 월간은 월~일 달력(산책한 날 = 리포트의 `sticker_days`, 오늘은 초록 테두리), 감정별 정답률과 '더 연습해 볼 감정', 동화 대화 수와 말로 답한 비율. 리포트 API의 다른 숫자(표정 거울, 단서, 복습, 그림으로 돌아간 횟수, 안전 검사)는 화면에 보이지 않음 | `forest-panel-note`, `panels.css`에 기존 변수로 막대·점 추가 |

아이 프로필 목록·추가 화면은 없앴습니다. 아이의 별명과 캐릭터는 기존 '숲 친구 꾸미기'에서 바꿉니다.

## 보호자 로그인과 아이 소유 확인

- 로그인하지 않아도 지금처럼 기기 child_id로 산책합니다. 토큰은 `Authorization: Bearer <token>`으로 보냅니다.
- 비밀번호는 scrypt 해시(보호자마다 다른 salt)로만 저장합니다. 토큰은 HS256 JWT이고 14일 뒤 만료됩니다(`services/auth.py`의 `TOKEN_DAYS`).
- `JWT_SECRET`이 비어 있으면 가입·로그인은 503이고, 기기 기록 산책은 그대로 됩니다. `/health`의 `auth`로 켜졌는지 봅니다.
- 아이 프로필은 보호자당 1명입니다. 별명(12자 이내), 출생 연도(선택, 올해부터 15년 전까지), 캐릭터(`lion`·`rabbit`·`bear`)만 받습니다. 이름·사진 같은 다른 칸을 보내면 422, 두 번째 아이를 만들면 409입니다.
- `deps.py`의 `check_child`를 산책·학습 1·2·3·대화·스티커 API에 모두 겁니다.

| 요청 | 결과 |
| --- | --- |
| 토큰 없음 + 기기 child_id | 지금처럼 통과 |
| 토큰 없음 + 보호자 프로필의 아이 | 401 (로그인이 필요해요) |
| 토큰 있음 + 그 보호자의 아이 | 통과 |
| 토큰 있음 + 다른 보호자의 아이 또는 기기 child_id | 403 |
| 토큰이 틀렸거나 만료됨 | 401 (다시 로그인해 주세요) |

기기 기록은 D단계의 `link-device`로 프로필에 옮긴 뒤 토큰과 함께 씁니다.

## 기기 기록 연결

`POST /children/{id}/link-device`는 기기 child_id로 쌓인 산책, 학습 기록(학습 1·2·3, 레벨 테스트), 대화, 스티커를 프로필로 옮깁니다.

**중간에 실패했다가 다시 해도 중복·누락이 없게**
- Cosmos는 파티션을 넘는 트랜잭션이 없어서, 문서마다 "프로필 파티션에 **같은 id로 upsert** → 기기 파티션에서 삭제" 순서로 옮깁니다.
- 실패한 뒤 다시 부르면 기기 파티션에 남은 문서만 다시 옮깁니다. 이미 복사된 문서는 같은 id로 덮어써서 둘이 되지 않고, 원본은 복사가 끝난 뒤에만 지우므로 사라지지 않습니다.
- 스티커는 프로필 id로 새 문서 id(`프로필id_날짜`)를 만듭니다. 이미 있으면(프로필에 같은 날짜가 있거나 앞선 시도에서 옮김) 하나만 남기고 기기 스티커를 지웁니다.
- 테스트는 연결 중 쓰기 27번 각각에서 한 번 실패시키고 다시 연결해, 모든 문서가 프로필에 하나씩만 있고 기기에는 남지 않는지 봅니다.
- 실패 후 다시 하기 전까지는 같은 문서가 기기·프로필 파티션에 함께 있을 수 있습니다. 리포트는 프로필 파티션만 읽으므로 두 번 세지 않습니다.

**남의 기기 child_id로 다른 집 기록을 가져가지 못하게**
1. 보호자 토큰이 있고, 그 보호자의 아이 프로필로만 옮깁니다(401·403).
2. 기기 child_id는 프론트가 만드는 `device-` + UUID v4 형식만 받습니다(422). 짐작해서 맞힐 수 없는 값만 연결합니다.
3. 기기 child_id는 **처음 연결한 프로필 하나에만** 묶입니다. `device_links` 문서(id = 기기 child_id)를 `create_item`으로 만들어서, 동시에 여러 집이 연결해도 한 곳만 성공합니다. 다른 집이면 409입니다. 같은 계정으로 여러 기기에서 로그인하면 기기마다 기기 child_id가 달라 각각 그 아이에게 연결됩니다.
4. 연결한 뒤에는 그 기기 child_id로 토큰 없이 기록을 읽거나 쓸 수 없고(401), 연결한 보호자 토큰만 됩니다(다른 보호자는 403). 연결한 다음에는 기기 id를 알아도 기록을 볼 수 없습니다.
5. 남은 위험: 진짜 보호자가 연결하기 전에 누군가 그 기기의 child_id를 알아내 먼저 연결하는 경우입니다. 기기 child_id는 그 기기의 브라우저 저장소에만 있고 화면에 보이지 않습니다. 더 막으려면 기기에서만 아는 비밀값(연결 코드)을 함께 보내는 방식을 담당자가 정합니다.

## 탈퇴 (계정과 기록 삭제)

`DELETE /me`에 `{password}`를 보내면 비밀번호를 다시 확인한 뒤 지웁니다 (`services/account.py`).

1. 아이 기록: 산책·학습 1·2·3·레벨 테스트·대화·스티커
2. 그 아이에 연결한 기기마다: 기기 쪽에 남은 기록(연결이 중간에 멈춘 경우)과 기기 연결 문서
3. 아이 프로필 → 4. 이메일 문서 → 5. 보호자 계정

- Cosmos에는 여러 문서를 한 번에 지우는 트랜잭션이 없어서 문서마다 지웁니다. 보호자 계정을 맨 마지막에 지우므로, 중간에 실패해도 같은 토큰과 비밀번호로 다시 부르면 남은 문서만 지웁니다. 테스트는 삭제 쓰기 22번 각각에서 한 번 실패시키고 다시 해서 아무것도 남지 않는지 봅니다.
- 같은 이메일로 다시 가입할 수 있고, 지운 기기 id도 다시 연결할 수 있습니다.
- 프론트는 지운 뒤 로그아웃과 같이 기기 id를 새로 만듭니다. 이 기기의 진행 상태와 스티커판(브라우저 저장소)은 계정 기록이 아니라서 그대로 둡니다.
- 연결하지 않은 기기 id의 기록은 계정 것이 아니라서 지우지 않습니다.
- 담당자가 정할 것: 비밀번호 확인 시도 제한, 지우는 도중에 다른 기기에서 쌓인 기록 처리(지금은 다시 부르면 지움).

## 레벨 테스트와 리포트

- 레벨 테스트는 화면이 정한 `level`과 문항별 답(찾을 표정 `target`, 누른 순서 `picks`, `used_hint`)을 그대로 저장합니다. 판정은 지금처럼 화면이 합니다. `attempts` 컨테이너에 `kind: "placement"`로 두며, 다시 하면 새로 쌓이고 조회는 마지막 결과를 돌려줍니다.
- 리포트는 보호자 토큰이 있고 그 보호자의 아이일 때만 봅니다. 기기 child_id 리포트는 볼 수 없습니다(401·403).
- 기간은 산책 날짜(한국 날짜) 기준이며 `from`·`to`를 포함합니다. 최대 366일입니다.
- 대화 문장, 고른 낱말, 생성 응답은 넣지 않고 숫자만 돌려줍니다.

| 항목 | 계산 |
| --- | --- |
| `walks.completed` | 마친 산책 수 (복습 제외). `walks.reviews`는 복습으로 마친 수 |
| `emotion[]` | 감정마다(`emotions.json` 순서) 학습 1 답 수, 정답 수, 정답률(`accuracy`, 0~1, 기록 없으면 null), 단서를 본 뒤 낸 답 수(`hint_used`). 복습과 마치지 않은 산책의 답도 셉니다 |
| `mirror` | 학습 2 기록 수, 카메라·터치 수와 비율 |
| `story` | 대화 수, 친구가 답한 턴 수, 그중 말로 답한 턴 수와 비율, 그림 선택으로 돌아간 수(`fallback_to_picture`), Content Safety 차단 수(`blocked`), 하루 생성 제한에 걸린 수(`generation_limited`), 턴을 무엇으로 정했는지(`resolved_by`: button·exact·llm·fallback 수) |
| `sticker_days` | 기간 안에 스티커를 받은 날짜 |

그림으로 돌아간 수는 대화 기록에서 `resolved_by`가 `fallback`인 턴 수입니다. 키가 없는 경우, 모델이 이야기 밖이라고 본 경우, 형식·검사를 통과하지 못한 경우, 차단된 경우, 하루 생성 제한에 걸린 경우가 모두 들어갑니다. 친구가 답한 턴 수(`turns`)와 말로 답한 비율에는 fallback 턴을 넣지 않습니다. 이전 대화 문서는 턴에 `resolved_by`가 없고 그림으로 돌아간 수가 `fallbacks` 칸에 있어서, 리포트가 그 칸도 함께 셉니다.

## 저장소

`STORE=memory`(기본값)는 서버 메모리에 두며 서버를 끄면 비워집니다. 테스트는 항상 메모리입니다.
`STORE=cosmos`는 `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DATABASE`가 필요합니다. 서버가 처음 저장소를 쓸 때 데이터베이스와 컨테이너가 없으면 만듭니다.

| 컨테이너 | 파티션 키 | 내용 | 읽는 방법 |
| --- | --- | --- | --- |
| guardian_emails | `/id` | 이메일 중복 막기. id = 소문자로 정리한 이메일 | 이메일로 바로 읽어 보호자 id를 얻음 |
| guardians | `/id` | 보호자 계정 | 보호자 id로 바로 읽음 |
| device_links | `/id` | 기기 연결. id = 기기 child_id | 기기 id로 바로 읽음 |
| children | `/guardian_id` (고유 키 `/guardian_id`) | 아이 프로필. 보호자 파티션에 문서 하나 → 보호자당 아이 1명 | 보호자 id + 아이 id로 바로 읽음. 없으면 그 보호자의 아이가 아님 |
| walks | `/child_id` | 산책 | 산책 id로 찾을 때는 교차 파티션, 아이별 목록은 파티션 안 |
| attempts | `/child_id` | 학습 1·2·3 기록 | 아이별 파티션 안 |
| conversations | `/child_id` | 대화 (마스킹된 문장, 차단 범주) | 대화 id로 찾을 때는 교차 파티션 |
| stickers | `/child_id` | 스티커 | 문서 id = `child_id_날짜` |

Cosmos의 id와 고유 키는 **논리 파티션 안에서만** 중복을 막습니다. 그래서 중복을 막을 값을 id로 쓰고, 같은 값이면 같은 파티션에 들어가게 합니다.

이메일 중복 가입은 `guardian_emails`로 막습니다. 이메일은 앞뒤 공백을 빼고 소문자로 정리합니다. 그 이메일을 id이자 파티션 키로 쓰는 문서를 먼저 만들고, 이미 있으면 409라서 가입하지 않습니다. 대소문자만 다른 이메일로 동시에 가입해도 계정은 하나만 생깁니다. 이메일 문서를 만든 뒤 계정 문서 저장이 실패하면 이메일 문서를 바로 지우고 오류를 돌려줍니다. 그래서 같은 이메일로 다시 가입할 수 있습니다. 지우기까지 실패하면 서버 로그에 `이메일 문서 정리 실패`가 남고(이메일은 적지 않음), 그때만 `guardian_emails`에서 그 문서를 직접 지웁니다.

보호자당 아이 1명은 `children`의 고유 키 `/guardian_id`로 지킵니다. 파티션 키도 `/guardian_id`라서 한 보호자 파티션에 문서가 하나만 들어가고, 동시에 두 번 만들어도 하나만 성공합니다(409). 고유 키는 컨테이너를 만들 때만 정할 수 있으므로, 이전에 만든 `children` 컨테이너가 있으면 지우고 서버를 다시 켜서 새로 만듭니다.

스티커 하루 1장은 문서 id로 지킵니다. 같은 파티션에 같은 id는 하나만 만들 수 있어서 완료 요청이 동시에 와도 `create_item` 하나만 성공하고 나머지는 409(이미 있음)로 `sticker_given: false`가 됩니다. 메모리 구현은 잠금으로 같은 동작을 합니다.

문서 예시 (Cosmos가 붙이는 `_rid`, `_etag`, `_ts`는 읽을 때 뺍니다):

```json
// guardian_emails
{"id": "parent@example.com", "guardian_id": "9f1c…", "created_at": "2026-11-22T01:00:00+00:00"}
// device_links
{"id": "device-3f2b8c1e-…", "guardian_id": "9f1c…", "child_id": "c71a…", "created_at": "…"}
// guardians
{"id": "9f1c…", "email": "parent@example.com", "password_hash": "…", "created_at": "2026-11-22T01:00:00+00:00"}
// children
{"id": "c71a…", "guardian_id": "9f1c…", "nickname": "하늘", "birth_year": 2019, "character": "raon", "created_at": "…"}
// walks
{"id": "a3e0…", "child_id": "c71a…", "day": "2026-11-22", "topic_id": "joy", "level": "basic", "review": false, "step": 2, "status": "completed"}
// attempts (kind: emotion · mirror · story_action)
{"id": "5b2d…", "child_id": "c71a…", "walk_id": "a3e0…", "kind": "emotion", "selected": ["기뻐요"], "correct": true, "used_hint": false, "created_at": "…"}
{"id": "6c3e…", "child_id": "c71a…", "walk_id": "a3e0…", "kind": "mirror", "mode": "camera", "score": null, "skipped": false, "created_at": "…"}
// attempts (kind: placement, 레벨 테스트)
{"id": "7d4f…", "child_id": "c71a…", "walk_id": null, "kind": "placement", "level": "basic",
 "answers": [{"target": "joy", "picks": ["sad", "joy"], "used_hint": true}, {"target": "surprise", "picks": ["surprise"], "used_hint": false}], "created_at": "…"}
// conversations (said는 마스킹된 문장, resolved_by는 턴을 무엇으로 정했는지, fallback 턴은 문장 없음,
//                safety에는 차단 여부와 범주만, generated는 한국 날짜별 모델 호출 수, limited는 하루 제한에 걸린 수)
{"id": "d8f4…", "child_id": "c71a…", "walk_id": "a3e0…", "topic_id": "joy", "friend": "lion", "turn": 1,
 "turns": [{"said": null, "reply": null, "input_mode": "voice", "resolved_by": "fallback"},
           {"said": "같이 놀자!", "reply": "…", "input_mode": "picture", "resolved_by": "button"}],
 "safety": [], "generated": {"2026-11-22": 1}, "limited": 0, "ended_by": "button", "created_at": "…"}
// stickers
{"id": "c71a…_2026-11-22", "child_id": "c71a…", "day": "2026-11-22", "created_at": "…"}
```

### Cosmos DB 에뮬레이터로 확인

테스트(`tests/test_store.py`)는 가짜 클라이언트를 씁니다. 실제 SDK 동작은 에뮬레이터로 확인합니다.

1. 에뮬레이터를 켭니다.
   - **Windows (권장):**
     1. 설치: PowerShell에서 `winget install Microsoft.Azure.CosmosEmulator`. winget이 없으면 https://aka.ms/cosmosdb-emulator 에서 설치 파일(.msi)을 받아 실행합니다.
     2. 실행: 시작 메뉴에서 **Azure Cosmos DB Emulator**를 엽니다. 작업 표시줄 알림 영역에 아이콘이 생기고, 잠시 뒤 브라우저에 탐색기(https://localhost:8081/_explorer/index.html)가 열리면 준비된 것입니다. 명령으로 켜려면 `& "C:\Program Files\Azure Cosmos DB Emulator\Microsoft.Azure.Cosmos.Emulator.exe"`를 실행합니다.
     3. 엔드포인트는 `https://localhost:8081`입니다. 에뮬레이터는 자체 서명 인증서를 쓰고 Python SDK는 Windows 인증서 저장소를 읽지 않으므로, 주소가 `localhost`·`127.0.0.1`일 때만 서버가 인증서 검사를 끕니다. Azure의 실제 주소에서는 항상 검사합니다.
   - Docker (Linux 에뮬레이터): `docker run -p 8081:8081 -p 1234:1234 mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview --protocol http` → 엔드포인트 `http://localhost:8081`, 탐색기 http://localhost:1234
2. `backend/.env`에 적습니다. 키는 에뮬레이터 공용 키입니다. Docker를 쓰면 엔드포인트만 `http://localhost:8081`로 바꿉니다.
   ```
   STORE=cosmos
   COSMOS_ENDPOINT=https://localhost:8081
   COSMOS_KEY=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
   COSMOS_DATABASE=maeumforest
   ```
3. `backend` 폴더에서 스티커가 한 번만 생기는지 봅니다. `True False ['2026-11-22']`가 나오면 정상입니다.
   ```sh
   python -c "from datetime import date; from app import config; from app.store import build_store; s = build_store(config.settings); print(s.give_sticker('emulator-kid', date(2026, 11, 22)), s.give_sticker('emulator-kid', date(2026, 11, 22)), s.sticker_days('emulator-kid'))"
   ```
4. `uvicorn app.main:app --reload`로 켜고 `GET /health`의 `store`가 `cosmos`인지 봅니다. 프론트에서 산책을 하나 마친 뒤 에뮬레이터 탐색기에서 `maeumforest` 데이터베이스의 컨테이너 여덟 개와 문서를 봅니다. 탐색기는 Windows는 https://localhost:8081/_explorer/index.html, Docker는 http://localhost:1234 입니다.

## 담당별 채울 부분 (TODO)

| 담당 | 위치 | 할 일 | 상태 |
| --- | --- | --- | --- |
| 백엔드 1 | deps.py, routers/auth.py, routers/children.py, services/auth.py | 가입·로그인, 아이 프로필, 아이 소유 확인 | 기본 틀 완료, 담당자가 채울 부분: 이메일 인증, 비밀번호 재설정, 로그인 시도 제한, 보호자 동의 기록 |
| 백엔드 1 | routers/report.py, services/report.py | 레벨 테스트 저장, 리포트 API | 기본 틀 완료, 담당자가 채울 부분: 리포트 항목 확정(예: 기간별 추이), 레벨 기준 확정 후 서버 판정, 자동 리포트 발송 |
| 백엔드 2 | store.py, store_cosmos.py | Cosmos DB 연결 (컨테이너·파티션 키·스티커 중복 방지) | 기본 틀 완료, 담당자가 채울 부분: 실제 Cosmos 계정으로 확인, 처리량(RU)·인덱스 정책, 기간 조회 쿼리 |
| 백엔드 2 | routers/devices.py | 기기 기록 연결, 오늘 산책 재개 | 기본 틀 완료, 담당자가 채울 부분: 연결 코드 등 기기 확인 강화, 큰 기록 옮기기(나눠 옮기기·진행률), 연결 취소 |
| 백엔드 3 | services/conversation.py, safety.py | Azure OpenAI 응답 생성, Azure AI Language PII, Content Safety | 완료 |
| AI (대화) | services/prompts.py | 대화 프롬프트·응답 기준·안전 검사 기준 | 기본 틀 완료, 담당자가 채울 부분 |
| AI (표정) | mirror.py score | 표정 유사도 기준 확정 후 score 채우기 | 아직 없음 (지금은 null) |

## 감정 추가 체크리스트

감정 데이터는 `app/content/emotions.json`과 `tales.json`에만 있습니다. 같은 id(영문 소문자, 예: `calm`)로 두 파일에 한 항목씩 넣으면 프론트·백엔드가 함께 늘어납니다. 코드의 감정 목록은 고치지 않습니다. `emotions.json`에서 넣은 위치가 날짜별 순환 순서입니다(맨 끝에 넣으면 기존 순서는 그대로).

**`emotions.json` (감정 한 항목)**
- [ ] `label` 감정 이름 (예: 기쁨), `phrase` 마음 표현 (예: 기쁜 마음)
- [ ] `aliases` 같은 감정으로 받을 다른 이름 (영어·비슷한 말, 없으면 `[]`)
- [ ] 낱말: `word` 기본 낱말, `kin` 비슷한 말, `opposite` 반대말, `oppositeFirst` 보기에서 반대말을 앞에 둘지 (`true`/`false`)
- [ ] 단서: `clue` 얼굴 단서 한 문장, `motion` 거울 연습 안내 한 문장
- [ ] `practice` 학습 1 장면: `meaning`, `example`, `beforeTitle`, `before`, `result`, `action`, `beforeImage`, `afterImage`(그림 대체 글), `afterTitle`, `reaction`, `cueQuestion`, `cues`(2개), `target`, `cueHint`, `expression`(표현 방법 2개: `action`, `practice`, `answer`)

**`tales.json` (동화 한 항목)**
- [ ] 동화 3장: `title`, `pages` 3개(`{친구}` 자리에 친구 이름이 들어감), `situation`, `explanation`
- [ ] 행동 2개 `actions`: `label`, `expression`(그 뒤 친구 표정 id 또는 `neutral`), `title`, `event`, `line`
- [ ] 대화 대본 `talk`: `ask`, `choices` 2개와 `replies` 2개(같은 순서), `again`, `extra` 2개와 `ends` 2개. 답하는 사람은 대화 제목의 숲 친구('라온과 나누는 이야기')이고, `choices`·`extra`는 아이가 친구에게 하는 말(반말)입니다.
- [ ] 친구 이름이 필요하면 질문(`ask`·`again`)에만 `{친구}`를 씁니다(라온이·보리·두리로 바뀜). 대사(`choices`·`replies`·`extra`·`ends`)에는 쓰지 않습니다 (테스트가 확인함)
- [ ] 대사별 친구 표정: `replyExpressions`(replies와 같은 수), `endExpressions`(ends와 같은 수). 값은 joy·surprise·sad·anger·neutral 중 하나 (테스트가 확인함)

**그림 파일 (`frontend/public/art/`, WebP)**
- [ ] 감정 카드 `cards/{id}.webp`, `cards/girl-{id}.webp` (테스트가 확인함)
- [ ] 동화 그림 `tale-{id}.webp` (테스트가 확인함)
- [ ] 학습 1 장면 `practice/{id}-before.webp`, `practice/{id}-after.webp`

**없어도 동작하지만 넣으면 좋은 것 (코드)**
- [ ] 친구 얼굴 표정: `frontend/src/PaintedFriend.jsx`의 `DRAWN_FEELINGS`와 눈·입·눈썹 그리기. 없으면 편안한 얼굴(`neutral`)로 보입니다.
- [ ] 동화 장면 소품과 움직임: `frontend/src/ForestTale.jsx`의 `scenery`, `forest-tale.css`의 `[data-world]`. 없으면 동화 그림만 보입니다.
- [ ] 녹음 음성: `frontend/src/raon-audio.js`(문장 → 파일). 없으면 기기 음성으로 읽습니다.

**확인**
- [ ] `frontend`에서 `npm test`: 카드·동화 그림 파일, 동화 형식, 가짜 감정 7개 순환(`tests/emotions.test.js`)
- [ ] `backend`에서 `pytest -q`: `/topics`, 학습 기록, 스티커, 리포트 줄 수(`tests/test_emotion_count.py`)

## 현재 동작 규칙

- 감정 목록과 순서는 `app/content/emotions.json`의 키 순서입니다(지금 joy·surprise·sad·anger). 프론트 날짜별 순환, 스티커, `/topics`, 리포트, 대시보드가 모두 이 순서를 씁니다.
- 학습 1 확장 과제는 화면과 같이 기본·비슷한 낱말 중 하나 이상을 고르고 반대 낱말이 없으면 정답입니다.
- 학습 2 점수는 AI 기준 확정 전까지 null을 받습니다. 영상은 서버로 오지 않습니다.
- 학습 3 대화의 보기 선택과 보기와 같은 말은 동화 대본(`tales.json`의 talk)으로 응답합니다. 보기와 다른 말은 아래 순서로 모델(LLM)에게 묻습니다.
- 대화 기록과 로그에는 마스킹된 문장만 남깁니다. 로그에는 실패한 서비스와 오류 종류만 적습니다.

## 학습 3 대화와 Azure (AI 담당용)

### 한 턴의 순서

API 모양(`POST /conversations/{id}/turn`)과 프론트 연결은 그대로입니다. 친구 답을 무엇으로 정했는지 턴마다 `resolved_by`로 남깁니다.

```
보기 버튼 (choice_index, input_mode picture)                        → 대본 답                     button
기기에서 알아들은 말이 보기와 같음 (choice_index, input_mode voice)  → 대본 답                     exact
말·글 (text) → mask_pii → check(입력, 4 이상 막음)
   → 띄어쓰기·문장부호를 빼고 보기와 글자가 같음                      → 대본 답                     exact
   → 다름: 하루 제한 확인 → Azure OpenAI (JSON) → prompts.parse
        (형식이 틀리면 4초 안에서 한 번 다시) → prompts.resolve
        → match 0·1                  → 그 보기의 대본 답·대본 표정                              llm
        → match null, offTopic false → 모델 reply → check_reply → check(출력, 0 초과 막음)    llm
        → 그 밖 (offTopic, 형식·검사 불통과, 차단, 실패, 제한) → fallback_to_picture          fallback
```

- 모델 응답 모양(`prompts.RESPONSE_SCHEMA`, Azure OpenAI structured outputs strict): `{"match": 0|1|null, "offTopic": bool, "reply": str|null, "expression": str}`
- 요청 값(`prompts.GENERATION`): `temperature` 0.3, `max_tokens` 150, `response_format` json_schema.
- 그림으로 돌아간 턴은 문장 없이 `{"said": null, "reply": null, "input_mode", "resolved_by": "fallback"}`만 남깁니다. 친구가 답한 턴 수(`turn`, 2턴이면 종료)는 늘지 않습니다.
- 친구 표정: 대본 답(button·exact, llm의 match)은 `tales.json`의 `replyExpressions`·`endExpressions`, 모델 말은 JSON의 `expression`(목록에 없으면 `neutral`). 화면은 값이 없으면 고른 행동의 표정을 그대로 씁니다.
- Content Safety에 막히면 대화 기록의 `safety`에 `{"blocked": true, "categories": [...]}`만 남깁니다. 문장은 남기지 않고 보호자 알림도 없습니다. 대본 답은 출력 검사를 하지 않습니다.
- 외부 호출 전체(PII, 입력 검사, 모델 1~2번, 출력 검사)는 한 턴에 `TURN_TIMEOUT`(4초, `conversation.py`) 안에 끝나야 합니다. 형식 오류로 다시 묻는 것도 이 안에서만 합니다. 네트워크 오류·시간 초과는 다시 묻지 않습니다. 프론트 제한은 5초입니다.

### 비용 제한 (하루 모델 호출 수)

- 아이 한 명이 하루(한국 날짜)에 모델을 부를 수 있는 횟수는 `prompts.DAILY_GENERATION_LIMIT`(30)입니다. 넘으면 부르지 않고 `fallback_to_picture: true`로 돌아갑니다. 아이 화면은 지금처럼 보기 버튼으로 돌아갑니다.
- 셉니다: 키가 있어 실제로 부른 호출. 형식 오류로 다시 부른 호출, 실패·시간 초과도 비용이 들 수 있어 셉니다.
- 세지 않습니다: 보기 선택, 보기와 같은 말(대본으로 답함), 키가 없을 때, 모델 전에 입력 안전 검사에서 막힌 경우.
- 횟수는 대화 문서의 `generated`(날짜별)에 두고, 턴마다 그 아이 대화들의 오늘 값을 더해 봅니다. 제한에 걸리면 그 대화의 `limited`를 늘리고 리포트 `story.generation_limited`에 나옵니다.
- 기기 기록을 프로필로 옮기면 대화 문서가 함께 옮겨지므로 그날 센 횟수도 이어집니다.
- 알려진 한계: 같은 아이의 말 턴이 정확히 동시에 오면 둘 다 같은 횟수를 읽어 한두 번 넘을 수 있습니다. 로그아웃으로 기기 id를 새로 만들면 새 아이로 셉니다.

| 서비스 | 키가 없을 때 | 키가 있는데 실패·시간 초과일 때 |
| --- | --- | --- |
| Azure OpenAI (`conversation._ask_model`) | 부르지 않음 → 그림 선택 | 그림 선택 (형식 오류만 한 번 다시) |
| Azure AI Language PII (`mask_pii`) | 로컬 규칙(전화번호·이메일) | 로컬 규칙 |
| Azure AI Content Safety (`check`) | 통과 | 막음 |

Azure로 마스킹한 뒤에도 로컬 규칙을 한 번 더 적용합니다.

### AI 담당이 고칠 곳 (`app/services/prompts.py` 한 파일)

| 하고 싶은 일 | 고칠 부분 |
| --- | --- |
| 친구 역할·말투 규칙·장면 제한 | `SYSTEM_PROMPT` (1~2문장, 질문 최대 1개, 반말, 비유·반어·농담·관용구 금지, 이야기 밖 주제·개인정보 질문 금지) |
| 모델에 넘기는 정보 | `build_messages(tale, turn, friend_name, transcript)`. `turn` 0은 첫 질문과 choices, 1은 again과 extra. `friend_name`은 받침에 따라 라온이·보리·두리(`content.friend_name`). `transcript`는 마스킹된 아이 말 |
| 응답 모양 | `RESPONSE_SCHEMA` (바꾸면 `parse()`도 함께) |
| 응답으로 친구 답 정하기 | `resolve(tale, turn, output)`: match면 대본 답·표정, match null·offTopic false면 reply, 그 밖은 None |
| 형식 확인 | `parse(content)`: 모양이 틀리면 None (conversation.py가 한 번 다시 부름) |
| 생성 값 | `GENERATION` (`temperature`, `max_tokens`, `response_format`) |
| 코드 검사 기준 | `MAX_SENTENCES`(2), `MAX_QUESTIONS`(1), `MAX_REPLY_CHARS`(60), `BANNED_WORDS`, `check_reply()` |
| 하루 모델 호출 수 | `DAILY_GENERATION_LIMIT` (아이 한 명, 한국 날짜 기준, 지금 30) |
| 안전 검사 기준 | `INPUT_MAX_SEVERITY`(아이 입력, 지금 2: 4 이상 막음), `OUTPUT_MAX_SEVERITY`(모델 말, 지금 0) |
| 검사 범주 | `app/services/safety.py`의 `SAFETY_CATEGORIES` |

- 말투(반말, 비유·관용구 등)는 프롬프트로 맡기고, 코드(`check_reply`)는 문장 수·질문 수·길이·금지어만 봅니다.
- 화남 주제에서 아이가 '짜증나', '때리고 싶어'처럼 감정을 말하는 것은 막지 않도록 아이 입력 기준을 모델 말보다 느슨하게 둡니다.
- `conversation.py`(호출 순서, 시간, 재시도, 비용 제한, 기록)와 `safety.py`는 고치지 않아도 됩니다.
- 기준을 바꾸면 `tests/test_conversation_ai.py`의 예시도 함께 고칩니다. 테스트는 모델 응답을 가짜 JSON으로 넣어 match·offTopic·reply·형식 오류·재시도를 확인합니다.

### 학습 2 점수 (AI 표정 담당)

- `POST /lessons/mirror/walks/{id}/record`에 기기에서 계산한 결과만 선택 항목으로 보냅니다: `score`(0~100), `score_version`(기준 버전, 예 `face-v1.0`), `stars`(0~3), `tracked_sec`, `attempts`, `end_reason`(locked·skipped·cameraDenied·exit).
- 영상, 얼굴 특징점, blendshape 값은 받지 않습니다. 정해지지 않은 칸을 보내면 422입니다 (`schemas.MirrorRecord`).
- 프론트는 지금 `score: null`만 보냅니다. 기준이 정해지면 `frontend/src/Activities.jsx`의 `api.recordMirror` 호출에 값을 더합니다.

### 키 설정

1. 로컬: `backend/.env.example`을 `backend/.env`로 복사하고 값을 채웁니다. App Service: 같은 이름으로 앱 설정(환경 변수)에 넣습니다.
   환경 변수를 먼저 읽고, 비어 있는 이름만 `backend/.env`에서 읽습니다.
2. 서버를 다시 시작합니다. 설정은 서버를 시작할 때 한 번 읽습니다. 테스트는 환경 변수와 `.env`를 읽지 않습니다.
3. `GET /health`에서 `openai`, `language`, `content_safety`가 각각 `true`인지 봅니다.

### 실제 키로 확인

테스트(`pytest -q`)는 외부 호출을 모두 가짜로 바꿔서 돌기 때문에 실제 키를 쓰지 않습니다. 실제 키 확인은 서버를 켜고 `/docs`에서 합니다.

1. `POST /walks`에 `{"child_id": "test", "topic_id": "joy"}` → `id`
2. `POST /lessons/story/walks/{id}/talk` → `conversation_id`
3. `POST /conversations/{conversation_id}/turn`에 `{"text": "비행기가 멀리 날아갔으면 좋겠어", "input_mode": "voice"}`
   - 짧은 반말이 `reply`로 오고 `fallback_to_picture: false`이면 모델 답 성공입니다. 보기와 같은 뜻의 말(예: "같이 놀고 싶어")은 대본 답이 옵니다.
   - `fallback_to_picture: true`이면 서버 로그에서 어느 단계가 실패했는지 봅니다. 예: `Azure OpenAI 실패: HTTPStatusError`, `모델 응답 형식이 맞지 않음`, `모델 응답으로 답을 정하지 못함`
   - 처음 연결할 때 structured outputs(`response_format` json_schema, strict)를 그 배포(모델·API 버전 `2024-10-21`)가 받는지 봅니다. 400이 오면 배포 모델을 확인합니다.
4. 개인정보: `backend` 폴더에서 아래 명령으로 `.env`의 Language 키를 써서 가린 결과를 봅니다. 이름과 번호가 `*` 또는 `[전화번호]`로 바뀌면 정상입니다.
   ```sh
   python -c "from app.services import safety; print(safety.mask_pii('내 이름은 김하늘이고 010-1234-5678이야'))"
   ```
5. 안전 검사: `python -c "from app.services import safety, prompts; print(safety.check('때리고 싶어', prompts.INPUT_MAX_SEVERITY))"`가 `(True, [])`, 심한 폭력 문장은 `(False, ['Violence'])`처럼 나오는지 봅니다. 화남 주제의 감정 표현이 막히면 `INPUT_MAX_SEVERITY`를 조정합니다.
