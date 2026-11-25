import './feeling-practice.css'

export const feelingPractice = {
  joy: {
    meaning: '기쁨은 좋은 일이 생겨서 기분이 좋은 거예요.',
    example: '친구가 와서 활짝 웃었어요.',
    beforeTitle: '친구가 가꾸는 꽃이에요',
    before: '화분을 눌러 꽃봉오리에 물을 줘요.',
    result: '활짝 핀 꽃',
    action: '물 주기',
    beforeImage: '파란 화분에 아직 닫혀 있는 꽃봉오리',
    afterImage: '같은 화분에 활짝 핀 노란 꽃',
    afterTitle: '기다리던 꽃이 폈어요!',
    reaction: '“드디어 꽃이 폈어! 정말 기뻐.”',
    cueQuestion: '활짝 웃을 때 어디가 올라갔나요?',
    cues: ['입꼬리', '눈썹'],
    target: '입꼬리',
    cueHint: '웃고 있는 입의 양쪽 끝을 살펴봐요.',
    expression: [
      {
        action: '“나 정말 기뻐!” 말풍선',
        practice: '“나 정말 기뻐!” 하는 마음을 친구에게 전했어요.',
        answer: '“꽃이 핀 걸 보니 나도 기뻐!”',
      },
      {
        action: '손뼉으로 전하기',
        practice: '소리를 내지 않아도 되니 손바닥을 살며시 마주쳐 봐요.',
        answer: '“손뼉을 쳤네! 나도 같이 기뻐.”',
      },
    ],
  },
  sad: {
    meaning: '보고 싶은 친구가 떠나면 슬플 수 있어요.',
    example: '친구가 집에 가서 조금 더 놀고 싶었어요.',
    beforeTitle: '비에 젖은 그림이에요',
    before: '접힌 종이를 눌러 친구가 그린 그림을 펴 봐요.',
    result: '빗물에 번진 그림',
    action: '그림 펼치기',
    beforeImage: '접힌 그림 종이와 노란 연필',
    afterImage: '빗물에 색이 번진 빨간 지붕 집 그림',
    afterTitle: '그림에 빗물이 번졌어요',
    reaction: '“열심히 그린 집이 흐려졌어. 슬퍼.”',
    cueQuestion: '친구 얼굴에서 아래로 처진 곳을 찾아요.',
    cues: ['코', '입꼬리'],
    target: '입꼬리',
    cueHint: '입의 양쪽 끝이 어느 쪽을 향하는지 살펴봐요.',
    expression: [
      {
        action: '“나 속상해.” 말풍선',
        practice: '“나 속상해.” 하고 친구에게 마음을 전했어요.',
        answer: '“알려 줘서 고마워. 옆에 있어 줄게.”',
      },
      {
        action: '옆자리를 톡톡 두드리기',
        practice: '곁에 있어 달라는 뜻으로 옆자리를 살짝 두드려 봐요.',
        answer: '“여기 앉아 달라는 거구나. 같이 있을게.”',
      },
    ],
  },
  surprise: {
    meaning: '뜻밖의 일이 생기면 깜짝 놀랄 수 있어요.',
    example: '빈 줄 알았던 상자에서 선물이 나왔어요.',
    beforeTitle: '숲길에 상자가 있어요',
    before: '초록 상자를 눌러 안에 무엇이 있는지 봐요.',
    result: '상자 속 종이학',
    action: '상자 열기',
    beforeImage: '뚜껑이 닫힌 초록색 나무 상자',
    afterImage: '상자 속에서 나타난 분홍색 종이학',
    afterTitle: '상자 안에 종이학이 있어요!',
    reaction: '“어? 종이학이네! 깜짝 놀랐어.”',
    cueQuestion: '친구 얼굴에서 동그래진 곳을 찾아요.',
    cues: ['눈과 입', '귀'],
    target: '눈과 입',
    cueHint: '두 눈이 커지고 입이 동그랗게 벌어졌어요.',
    expression: [
      {
        action: '“깜짝 놀랐어.” 말풍선',
        practice: '상자를 열고 깜짝 놀란 마음을 친구에게 전했어요.',
        answer: '“나도 깜짝 놀랐어. 같이 살펴보자.”',
      },
      {
        action: '가슴에 손 올리기',
        practice: '잠깐 멈추고 손을 가슴에 가만히 얹어 봐요.',
        answer: '“많이 놀랐구나. 천천히 기다릴게.”',
      },
    ],
  },
  anger: {
    meaning: '하고 싶은 일이 자꾸 안 되면 화가 날 수 있어요.',
    example: '내 차례인데 다른 친구가 먼저 갔어요.',
    beforeTitle: '돌 앞에 수레가 있어요',
    before: '빨간 수레를 눌러 앞으로 밀어 봐요.',
    result: '돌에 막힌 수레',
    action: '수레 밀기',
    beforeImage: '회색 돌 앞에 놓인 빨간 손수레',
    afterImage: '바퀴가 돌에 닿아 멈춘 빨간 손수레',
    afterTitle: '수레가 돌에 막혔어요',
    reaction: '“또 멈췄어. 가고 싶은데 못 가서 화가 나.”',
    cueQuestion: '친구 얼굴에서 가운데로 모인 곳을 찾아요.',
    cues: ['입술', '눈썹'],
    target: '눈썹',
    cueHint: '눈 위에 있는 두 눈썹 사이가 좁아졌어요.',
    expression: [
      {
        action: '“도와줘.” 말풍선',
        practice: '“수레가 걸렸어. 도와줘.” 하고 친구에게 부탁했어요.',
        answer: '“같이 돌을 피해 가자.”',
      },
      {
        action: '멈춤 손짓 하기',
        practice: '잠깐 멈추고 싶을 때 손바닥을 펴서 앞으로 내밀어요.',
        answer: '“잠깐 멈추자는 거구나. 여기서 기다릴게.”',
      },
    ],
  },
}

export function PracticeObject({ feeling, revealed = false, onAct }) {
  const practice = feelingPractice[feeling]
  const picture = (
    <img
      className="practice-object-image"
      src={
        import.meta.env.BASE_URL +
        'art/practice/' +
        feeling +
        (revealed ? '-after' : '-before') +
        '.webp'
      }
      alt={revealed ? practice.afterImage : practice.beforeImage}
      draggable="false"
    />
  )
  if (onAct) {
    return (
      <button
        type="button"
        className="practice-object practice-object-button"
        onClick={onAct}
        aria-label={practice.action}
      >
        {picture}
        <span className="practice-object-label">{practice.action}</span>
      </button>
    )
  }
  return (
    <div className="practice-object is-revealed">
      {picture}
      <span className="practice-object-label">{practice.result}</span>
    </div>
  )
}
