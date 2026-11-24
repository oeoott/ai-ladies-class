# 동화 배경 이미지 프롬프트 (최종 4장)

학습 3 동화 배경은 동화마다 그림 1장을 모든 장면(동화 1·2·3장, 상황, 행동 고르기, 행동 결과, 대화)에 씁니다. 아래는 지금 쓰는 4장을 만들 때의 프롬프트입니다. 다시 만들거나 감정을 늘릴 때 그대로 씁니다.

## 쓰는 방법

1. 항목마다 **참고 이미지**를 이미지 생성 도구에 함께 올리고, **프롬프트**를 그대로 붙여 넣습니다.
2. 결과를 1536×1024 WebP로 저장해 **파일 이름** 그대로 `frontend/public/art/tale/`에 넣습니다. 비율이 다르면 가운데 기준으로 잘라 3:2로 맞춥니다.
3. 연결은 `frontend/src/taleBackgrounds.js`에 있습니다(감정 id → 파일 이름). 새 그림은 보정 없이 그대로 쓰고, 카드 뒤에 크림색 덮개만 깔립니다.
4. 이전 그림은 `frontend/public/art/backup/`에 있습니다.

## 모든 프롬프트에 들어간 규칙

- 참고 이미지와 같은 수채 동화 그림체, 같은 빛과 색감
- 장소 하나와 꼭 필요한 사물만. 꽃·돌·덤불·구름은 크게 줄임
- 왼쪽 아래는 비워 둠 (숲 친구가 서는 자리)
- 오른쪽 절반은 하늘과 땅만 (안내 카드가 놓이는 자리)
- 사람·동물·글자 없음, 3:2 가로, 1536×1024
- 화면에서 움직이는 소품은 그리지 않음. 앱이 그 위에 따로 올립니다.

| 동화 | 파일 | 참고 이미지 | 그리지 않을 것(소품) |
| --- | --- | --- | --- |
| 기쁨 《바람 우체국의 첫 편지》 | `frontend/public/art/tale/joy-yard.webp` | `frontend/public/art/backup/tale-joy.webp` | 편지, 종이비행기, 빨간 우체통, 바람개비 |
| 슬픔 《도토리 등대》 | `frontend/public/art/tale/sad-shore.webp` | `frontend/public/art/backup/tale-sad.webp` | 나무 블록, 등대, 도토리 등불, 돗자리, 배 |
| 놀람 《잎사귀 속 작은 손님》 | `frontend/public/art/tale/surprise-garden.webp` | `frontend/public/art/backup/tale-surprise.webp` | 큰 잎, 나비, 코스모스 꽃, 작은 돌 |
| 화남 《구름 미끄럼틀의 차례》 | `frontend/public/art/tale/anger-playground.webp` | `frontend/public/art/backup/tale-anger.webp` | 구름 모양 계단, 작은 구름 친구, 숫자 적힌 은행잎 차례표 |

---

## 기쁨 — `frontend/public/art/tale/joy-yard.webp`
참고 이미지: `frontend/public/art/backup/tale-joy.webp`

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Scene: a small Korean hanok post office with a blue-grey tiled roof and one large tree beside it, placed in the upper-left area, with a sandy yard in front. Keep it calm and simple: only this one place and the essential objects; greatly reduce flowers, rocks, bushes and clouds (at most one small cloud), no windsock. Leave the lower-left area as empty open ground. Keep the right half of the picture only sky and ground with no objects. Do not draw any letters, paper planes, postboxes or pinwheels. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

## 슬픔 — `frontend/public/art/tale/sad-shore.webp`
참고 이미지: `frontend/public/art/backup/tale-sad.webp`

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image, with the same soft sunset light. Scene: a quiet shallow stream with a sandy bank in front and one weeping willow tree in the upper-left area. Keep it calm and simple: only this one place and the essential objects; greatly reduce stepping stones, rocks, tall grasses, flowers and clouds (at most one small cloud). Leave the lower-left area as empty sandy bank. Keep the right half of the picture only sky, distant hills, water and ground with no objects. Do not draw any wooden blocks, lighthouse, lamp, mat or boat. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

## 놀람 — `frontend/public/art/tale/surprise-garden.webp`
참고 이미지: `frontend/public/art/backup/tale-surprise.webp`

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Scene: a quiet Korean garden with a low stone wall topped with dark roof tiles running across the back, one tree in the upper-left area and a sandy path in front. Keep it calm and simple: only this one place and the essential objects; greatly reduce flowers, bushes, rocks and clouds (at most one small cloud). Leave the lower-left area as empty open ground. Keep the right half of the picture only sky, the far end of the wall and ground with no objects. Do not draw any large leaves, butterflies, cosmos flowers or small rocks. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

## 화남 — `frontend/public/art/tale/anger-playground.webp`
참고 이미지: `frontend/public/art/backup/tale-anger.webp`

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image, with the same clear autumn light. Scene: a small autumn playground under one large yellow ginkgo tree in the upper-left area, with a small wooden slide with a cloud-shaped roof just left of centre, on wide sandy ground. Keep it calm and simple: only this one place and the essential objects; greatly reduce fallen leaves, trees, bushes, rocks and clouds (at most one small cloud). Leave the lower-left area as empty sandy ground. Keep the right half of the picture only sky, distant hills and ground with no objects. Do not draw any cloud-shaped stairs, small cloud figures or ginkgo leaves with numbers. No people, no animals, no text, numbers or lettering. Landscape 3:2, 1536x1024.
```
