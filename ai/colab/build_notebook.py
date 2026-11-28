"""ai/tagging/photo_tagging.py를 담아 Colab 노트북 photo_tagging.ipynb를 만든다.
모듈을 고친 뒤에는 `python ai/colab/build_notebook.py`를 다시 실행한다 (테스트가 둘이 같은지 확인함)."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULE = HERE.parent / "tagging" / "photo_tagging.py"
OUT = HERE / "photo_tagging.ipynb"


def md(text):
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(keepends=True)}


def code(text):
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
            "source": text.strip("\n").splitlines(keepends=True)}


CELLS = [
    md("""
# 마음숲 학습 1 — 감정 카드 사진 태깅 (trpakov/vit-face-expression)

생성한 **가상 성인 얼굴 사진**에 7감정 태그를 **추천**하고, 사람이 검수해 JSON으로 내려받는다.

| 감정 코드 | anger | disgust | fear | joy | neutral | sad | surprise |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 이름 | 화남 | 혐오 | 두려움 | 기쁨 | 무표정 | 슬픔 | 놀람 |

- 모델 라벨(angry·happy 등)은 위 코드로 바꾼다 (happy → joy, angry → anger). 실행할 때 모델 config의 라벨을 다시 확인한다.
- 넣지 않는 것: 삽화·캐릭터·상황 그림, 실제 아동 사진.
- **모델 추천(aiTag)·생성 의도(intended)·사람 검수(confirmedTag)는 서로 다른 칸이다.** 검수 전 결과를 확정으로 쓰지 않는다.
- **모델 점수로 퀴즈 난이도를 정하지 않는다.** 난이도는 팀·특수교사가 검수 후 정한다.
- 이 모델은 FER2013으로 학습됐다. 여기 결과는 성인 사진에 대한 추천이고 **아동 대상 성능 검증이 아니다.**

순서: 1 설치 → 2 도구 → 3 모델 → 4 사진 올리기 → 5 태깅 → 6 결과 보기 → 7 사람 검수 → 8 JSON 내려받기
"""),
    md("## 1. 설치 (런타임: CPU로 충분, GPU면 더 빠름)"),
    code("!pip -q install transformers torch pillow opencv-python-headless ipywidgets matplotlib"),
    md("## 2. 도구 (저장소 `ai/tagging/photo_tagging.py`와 같은 코드)\n고치려면 저장소 파일을 고치고 `ai/colab/build_notebook.py`로 노트북을 다시 만든다."),
    None,  # %%writefile 셀 (모듈 그대로)
    code("""
import importlib, photo_tagging as pt
importlib.reload(pt)
config = pt.ReviewConfig(min_top_score=0.5, require_intended=True)  # 검토 기준 (바꾸면 결과 JSON에 남음)
config
"""),
    md("## 3. 모델 불러오기\n라벨이 예상과 다르면 여기서 멈춘다."),
    code("""
classify, model_info = pt.hf_classifier()  # 특정 버전으로 고정하려면 revision="커밋 해시"
detect = pt.opencv_detector()
model_info
"""),
    md("""
## 4. 사진 올리기
- 파일 이름에 의도한 감정을 넣는다: `person03_sad.png`, `p01_joy.webp` (이전 표기 happy·angry·평온·싫음도 읽음)
- 또는 메타데이터 JSON `{"파일이름.png": {"intendedEmotion": "sad"}, ...}`을 함께 올린다 (파일 이름보다 우선)
- Google Drive 폴더를 쓰려면 아래 `PHOTO_DIR`을 Drive 경로로 바꾸고 업로드 셀은 건너뛴다
"""),
    code("""
from pathlib import Path
import json
PHOTO_DIR = Path('/content/photos')
PHOTO_DIR.mkdir(parents=True, exist_ok=True)
metadata = {}
try:
    from google.colab import files
    for name, data in files.upload().items():
        if name.endswith('.json'):
            metadata.update(json.loads(data.decode('utf-8')))
        else:
            (PHOTO_DIR / name).write_bytes(data)
except ImportError:
    print('Colab이 아니에요. PHOTO_DIR에 사진을 직접 넣어 주세요.')
sorted(p.name for p in PHOTO_DIR.iterdir())
"""),
    md("## 5. 태깅 (얼굴 1개 검출 → 자르기 → RGB → 7감정 점수 → 검토 사유)"),
    code("""
records = pt.tag_folder(PHOTO_DIR, detect, classify, config, metadata=metadata)
pt.summarize(records)
"""),
    md("""
## 6. 결과 보기
왼쪽 원본(검출 상자), 가운데 잘라낸 얼굴, 오른쪽 7감정 점수. 제목에 의도·추천·검토 사유.
사유: noFace(얼굴 없음) · multiFace(여러 얼굴) · fileError · detectError · inferenceError ·
lowConfidence(1위 < 기준) · mismatch(추천 ≠ 의도) · noIntended(의도를 모름)
"""),
    code("""
import matplotlib.pyplot as plt
from matplotlib import patches
plt.rcParams['font.family'] = 'DejaVu Sans'  # 한글 글꼴이 없으면 코드로 표시
for r in records:
    fig, axes = plt.subplots(1, 3, figsize=(11, 3.2))
    try:
        img = pt.load_rgb(PHOTO_DIR / r['file'])
        axes[0].imshow(img)
        if r['faceBox']:
            l, t, rr, b = r['faceBox']
            axes[0].add_patch(patches.Rectangle((l, t), rr - l, b - t, fill=False, color='lime', lw=2))
            axes[1].imshow(img.crop(tuple(r['faceBox'])))
    except Exception as e:
        axes[0].text(0.1, 0.5, 'cannot open: ' + type(e).__name__)
    if r['aiScores']:
        axes[2].barh(list(r['aiScores']), list(r['aiScores'].values()), color=['tab:green' if k == r['aiTag'] else 'tab:gray' for k in r['aiScores']])
        axes[2].set_xlim(0, 1)
    for ax in axes[:2]:
        ax.axis('off')
    fig.suptitle(f"{r['file']} | intended={r['intended']} | ai={r['aiTag']} | review={','.join(r['reviewReasons']) or '-'}")
    plt.show()
"""),
    md("""
## 7. 사람 검수
사진마다 검수 라벨(7감정 코드 또는 reject=쓰지 않음)을 고르고, 검수자 이름을 적은 뒤 **검수 저장**을 누른다.
'미검수'로 둔 사진은 confirmedTag가 비어 있고, 앱 콘텐츠에 넣지 않는다.
"""),
    code("""
import ipywidgets as w
from IPython.display import display
reviewer = w.Text(description='검수자', placeholder='이름')
choices = [('미검수', None)] + [(f'{e} {pt.LABELS_KO[e]}', e) for e in pt.EMOTIONS] + [('reject 쓰지 않음', 'reject')]
pickers = []
for r in records:
    default = r['confirmedTag']
    pick = w.Dropdown(options=choices, value=default, description=r['file'][:18], layout=w.Layout(width='420px'))
    note = w.Text(placeholder='메모 (선택)', layout=w.Layout(width='300px'))
    pickers.append((r, pick, note))
    display(w.HBox([pick, note, w.HTML(f"추천 <b>{r['aiTag']}</b>, 의도 {r['intended']}, 사유 {','.join(r['reviewReasons']) or '-'}")]))
out = w.Output()
def apply(_):
    out.clear_output()
    with out:
        if not reviewer.value.strip():
            print('검수자 이름을 적어 주세요.'); return
        done = 0
        for i, (r, pick, note) in enumerate(pickers):  # pickers는 records와 같은 순서
            if pick.value:
                records[i] = pt.confirm(r, pick.value, reviewer.value.strip(), note.value or None)
                pickers[i] = (records[i], pick, note)
                done += 1
        print(f'검수 저장: {done}장')
button = w.Button(description='검수 저장', button_style='success')
button.on_click(apply)
display(reviewer, button, out)
"""),
    md("## 8. JSON 저장·내려받기"),
    code("""
from datetime import datetime
doc = pt.build_document(records, config, model_info)
path = pt.save(doc, Path(f"/content/photo_tags_{datetime.now():%Y%m%d_%H%M}.json"))
print(doc['summary'])
try:
    from google.colab import files
    files.download(str(path))
except ImportError:
    print('저장:', path)
"""),
    md("""
## 전달 절차
1. 내려받은 `photo_tags_*.json`을 AI 담당에게 전달한다 (사진 원본은 팀 드라이브, 저장소에 넣지 않음).
2. AI 담당은 `docs/ai/tagging/`에 결과를 두고, **confirmedTag가 있고 reject가 아닌 사진만** 콘텐츠 후보로 쓴다.
3. 앱에 넣을 때는 `docs/ai/HANDOFF-AI.md` '학습 1 — 앱 콘텐츠 반영'을 따르고 `docs/ai/content/asset-manifest.json`에 기록한다 (`python ai/content/asset_manifest.py`).
4. 요약의 agreeWithIntended(추천과 의도의 일치)는 정확도가 아니다. 사람 검수 후 agreeWithConfirmed를 본다.
"""),
]


def build() -> dict:
    source = MODULE.read_text(encoding="utf-8")
    cells = [c if c is not None else code("%%writefile photo_tagging.py\n" + source) for c in CELLS]
    return {"cells": cells, "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3"},
                                         "language_info": {"name": "python"}, "colab": {"provenance": []}},
            "nbformat": 4, "nbformat_minor": 5}


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(OUT)
