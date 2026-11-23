// The one place the emotions and their tales come from, shared with the backend.
// Add an emotion by adding one entry to each JSON file (see backend/README.md, '감정 추가 체크리스트').
// Key order in emotions.json is the daily rotation order.
import emotionData from '../../backend/app/content/emotions.json' with { type: 'json' }
import taleData from '../../backend/app/content/tales.json' with { type: 'json' }

export const emotions = emotionData
export const tales = taleData
