# 동화 장면 배경 이미지 프롬프트 (12장)

학습 3 동화 배경을 장면별로 새로 만들 때 이미지 생성 도구에 붙여 넣는 프롬프트입니다.

## 쓰는 방법

1. 항목마다 **참고 이미지**를 이미지 생성 도구에 함께 올리고, **프롬프트**를 그대로 붙여 넣습니다.
2. 결과를 1536×1024 WebP로 저장해 **파일 이름** 그대로 `frontend/public/art/tale/`에 넣습니다.
3. 넣은 그림은 자동으로 그 장면에 쓰입니다. 아직 없는 장면은 지금처럼 원본(`art/tale-{감정}.webp`)을 차분하게 보정해서 보여 줍니다. 장면 연결은 `frontend/src/taleBackgrounds.js`에 있습니다.

| 배경 | 쓰이는 장면 |
| --- | --- |
| 이야기 장면 | 동화 1·2·3장, 상황, 행동 고르기 |
| 결과 1 | 첫째 행동의 결과, 그 뒤 대화(질문·친구 답·조금 더·마무리) |
| 결과 2 | 둘째 행동의 결과, 그 뒤 대화 |

## 모든 프롬프트에 들어간 규칙

- 참고 이미지와 같은 수채 동화 그림체, 같은 빛과 색감
- 장소 하나와 꼭 필요한 사물만. 꽃·돌·덤불·구름은 크게 줄임
- 왼쪽 아래는 비워 둠 (숲 친구가 서는 자리)
- 오른쪽 절반은 하늘과 땅만 (안내 카드가 놓이는 자리)
- 사람·동물·글자 없음, 3:2 가로, 1536×1024
- 화면에서 움직이는 소품(편지, 우체통, 블록, 나비 등)은 그리지 않음. 앱이 그 위에 따로 올립니다.
- 같은 동화의 세 장은 장소·시점·빛을 똑같이 하고, 프롬프트에 적은 차이만 둡니다. 결과 1·2는 이야기 장면 그림을 참고 이미지로 한 장 더 넣으면 이어지기 쉽습니다.

---

## 기쁨 《바람 우체국의 첫 편지》

참고 이미지: `frontend/public/art/original/tale-joy.webp`
그리지 않을 것(소품): 편지, 종이비행기, 빨간 우체통, 바람개비

### 1. 이야기 장면 — `frontend/public/art/tale/joy-yard.webp`
참고 이미지: `frontend/public/art/original/tale-joy.webp`

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Scene: a small Korean hanok post office with a blue-grey tiled roof and one large tree beside it, placed in the upper-left area, with a sandy yard in front. Keep it calm and simple: only this one place and the essential objects; greatly reduce flowers, rocks, bushes and clouds (at most one small cloud), no windsock. Leave the lower-left area as empty open ground. Keep the right half of the picture only sky and ground with no objects. Do not draw any letters, paper planes, postboxes or pinwheels. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

### 2. 결과 1 '언덕으로 날려요' — `frontend/public/art/tale/joy-hill.webp`
참고 이미지: `frontend/public/art/original/tale-joy.webp` (+ `joy-yard.webp`가 있으면 함께)

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Same place and the same viewpoint as the reference: the small Korean hanok post office with a blue-grey tiled roof and one large tree in the upper-left area. The only change: a gentle green hill in the middle distance, left of centre, catches warm sunlight, and a narrow sandy path leads toward it. Keep it calm and simple: greatly reduce flowers, rocks, bushes and clouds (at most one small cloud). Leave the lower-left area as empty open ground. Keep the right half of the picture only sky and ground with no objects. Do not draw any letters, paper planes, postboxes or pinwheels. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

### 3. 결과 2 '우체통에 넣어요' — `frontend/public/art/tale/joy-post.webp`
참고 이미지: `frontend/public/art/original/tale-joy.webp` (+ `joy-yard.webp`가 있으면 함께)

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Same place and the same viewpoint as the reference: the small Korean hanok post office with a blue-grey tiled roof and one large tree in the upper-left area. The only change: the post office door is open with a soft warm light inside. Keep it calm and simple: greatly reduce flowers, rocks, bushes and clouds (at most one small cloud). Leave the lower-left area as empty open ground. Keep the right half of the picture only sky and ground with no objects. Do not draw any letters, paper planes, postboxes or pinwheels. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

---

## 슬픔 《도토리 등대》

참고 이미지: `frontend/public/art/original/tale-sad.webp`
그리지 않을 것(소품): 나무 블록, 등대, 도토리 등불, 돗자리, 배

### 4. 이야기 장면 — `frontend/public/art/tale/sad-shore.webp`
참고 이미지: `frontend/public/art/original/tale-sad.webp`

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image, with the same soft sunset light. Scene: a quiet shallow stream with a sandy bank in front and one weeping willow tree in the upper-left area. Keep it calm and simple: only this one place and the essential objects; greatly reduce stepping stones, rocks, tall grasses, flowers and clouds (at most one small cloud). Leave the lower-left area as empty sandy bank. Keep the right half of the picture only sky, distant hills, water and ground with no objects. Do not draw any wooden blocks, lighthouse, lamp, mat or boat. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

### 5. 결과 1 '곁에서 쉴까?' — `frontend/public/art/tale/sad-rest.webp`
참고 이미지: `frontend/public/art/original/tale-sad.webp` (+ `sad-shore.webp`가 있으면 함께)

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Same place and the same viewpoint as the reference: the quiet shallow stream, sandy bank and one weeping willow in the upper-left area. The only change: the water is very still and the light is a little softer and calmer, a peaceful place to sit and listen. Keep it calm and simple: greatly reduce stepping stones, rocks, tall grasses, flowers and clouds (at most one small cloud). Leave the lower-left area as empty sandy bank. Keep the right half of the picture only sky, distant hills, water and ground with no objects. Do not draw any wooden blocks, lighthouse, lamp, mat or boat. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

### 6. 결과 2 '함께 다시 쌓을까?' — `frontend/public/art/tale/sad-light.webp`
참고 이미지: `frontend/public/art/original/tale-sad.webp` (+ `sad-shore.webp`가 있으면 함께)

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Same place and the same viewpoint as the reference: the quiet shallow stream, sandy bank and one weeping willow in the upper-left area. The only change: the sky is a little later in the evening, and a soft warm golden glow is reflected on the water just left of centre. Keep it calm and simple: greatly reduce stepping stones, rocks, tall grasses, flowers and clouds (at most one small cloud). Leave the lower-left area as empty sandy bank. Keep the right half of the picture only sky, distant hills, water and ground with no objects. Do not draw any wooden blocks, lighthouse, lamp, mat or boat. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

---

## 놀람 《잎사귀 속 작은 손님》

참고 이미지: `frontend/public/art/original/tale-surprise.webp`
그리지 않을 것(소품): 큰 잎, 나비, 코스모스 꽃, 작은 돌

### 7. 이야기 장면 — `frontend/public/art/tale/surprise-garden.webp`
참고 이미지: `frontend/public/art/original/tale-surprise.webp`

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Scene: a quiet Korean garden with a low stone wall topped with dark roof tiles running across the back, one tree in the upper-left area and a sandy path in front. Keep it calm and simple: only this one place and the essential objects; greatly reduce flowers, bushes, rocks and clouds (at most one small cloud). Leave the lower-left area as empty open ground. Keep the right half of the picture only sky, the far end of the wall and ground with no objects. Do not draw any large leaves, butterflies, cosmos flowers or small rocks. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

### 8. 결과 1 '돌담에서 바라봐요' — `frontend/public/art/tale/surprise-wall.webp`
참고 이미지: `frontend/public/art/original/tale-surprise.webp` (+ `surprise-garden.webp`가 있으면 함께)

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Same place and the same viewpoint as the reference: the quiet Korean garden with a low tiled stone wall across the back and one tree in the upper-left area. The only change: the part of the stone wall just left of centre is in soft sunlight, a calm spot to stand and watch from. Keep it calm and simple: greatly reduce flowers, bushes, rocks and clouds (at most one small cloud). Leave the lower-left area as empty open ground. Keep the right half of the picture only sky, the far end of the wall and ground with no objects. Do not draw any large leaves, butterflies, cosmos flowers or small rocks. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

### 9. 결과 2 '꽃을 내밀어요' — `frontend/public/art/tale/surprise-flower.webp`
참고 이미지: `frontend/public/art/original/tale-surprise.webp` (+ `surprise-garden.webp`가 있으면 함께)

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Same place and the same viewpoint as the reference: the quiet Korean garden with a low tiled stone wall across the back and one tree in the upper-left area. The only change: a single small, soft patch of pale flowers along the foot of the wall, left of centre. Keep it calm and simple: greatly reduce other flowers, bushes, rocks and clouds (at most one small cloud). Leave the lower-left area as empty open ground. Keep the right half of the picture only sky, the far end of the wall and ground with no objects. Do not draw any large leaves, butterflies, cosmos flowers or small rocks. No people, no animals, no text or lettering. Landscape 3:2, 1536x1024.
```

---

## 화남 《구름 미끄럼틀의 차례》

참고 이미지: `frontend/public/art/original/tale-anger.webp`
그리지 않을 것(소품): 구름 모양 계단, 작은 구름 친구, 숫자 적힌 은행잎 차례표

### 10. 이야기 장면 — `frontend/public/art/tale/anger-playground.webp`
참고 이미지: `frontend/public/art/original/tale-anger.webp`

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image, with the same clear autumn light. Scene: a small autumn playground under one large yellow ginkgo tree in the upper-left area, with a small wooden slide with a cloud-shaped roof just left of centre, on wide sandy ground. Keep it calm and simple: only this one place and the essential objects; greatly reduce fallen leaves, trees, bushes, rocks and clouds (at most one small cloud). Leave the lower-left area as empty sandy ground. Keep the right half of the picture only sky, distant hills and ground with no objects. Do not draw any cloud-shaped stairs, small cloud figures or ginkgo leaves with numbers. No people, no animals, no text, numbers or lettering. Landscape 3:2, 1536x1024.
```

### 11. 결과 1 '내 차례라고 말해요' — `frontend/public/art/tale/anger-turn.webp`
참고 이미지: `frontend/public/art/original/tale-anger.webp` (+ `anger-playground.webp`가 있으면 함께)

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Same place and the same viewpoint as the reference: the small autumn playground under one large yellow ginkgo tree in the upper-left area, with the small wooden slide with a cloud-shaped roof just left of centre. The only change: the ground at the foot of the slide is clear, smooth and open, ready for taking turns. Keep it calm and simple: greatly reduce fallen leaves, trees, bushes, rocks and clouds (at most one small cloud). Leave the lower-left area as empty sandy ground. Keep the right half of the picture only sky, distant hills and ground with no objects. Do not draw any cloud-shaped stairs, small cloud figures or ginkgo leaves with numbers. No people, no animals, no text, numbers or lettering. Landscape 3:2, 1536x1024.
```

### 12. 결과 2 '나뭇잎 차례표를 놓아요' — `frontend/public/art/tale/anger-leaves.webp`
참고 이미지: `frontend/public/art/original/tale-anger.webp` (+ `anger-playground.webp`가 있으면 함께)

```
Watercolor children's picture-book illustration in exactly the same painting style, light and colour palette as the reference image. Same place and the same viewpoint as the reference: the small autumn playground under one large yellow ginkgo tree in the upper-left area, with the small wooden slide with a cloud-shaped roof just left of centre. The only change: a few golden ginkgo leaves lie neatly near the foot of the slide, without any marks. Keep it calm and simple: greatly reduce other fallen leaves, trees, bushes, rocks and clouds (at most one small cloud). Leave the lower-left area as empty sandy ground. Keep the right half of the picture only sky, distant hills and ground with no objects. Do not draw any cloud-shaped stairs, small cloud figures or ginkgo leaves with numbers. No people, no animals, no text, numbers or lettering. Landscape 3:2, 1536x1024.
```
