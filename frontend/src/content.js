// The one place the emotions and their tales come from, shared with the backend.
// Add an emotion by adding one entry to each JSON file (see backend/README.md, '감정 추가 체크리스트').
// Key order in emotions.json is the daily rotation order.
import emotionData from '../../backend/app/content/emotions.json' with { type: 'json' }
import taleData from '../../backend/app/content/tales.json' with { type: 'json' }
import draftEmotions from '../../backend/app/content/drafts/emotions.json' with { type: 'json' }
import draftTales from '../../backend/app/content/drafts/tales.json' with { type: 'json' }

// Drafts (fear, disgust, neutral before review) join only in a preview build: VITE_CONTENT_DRAFTS=1.
// Children's builds and the tests use the reviewed emotions only. Reviewed entries win over drafts.
export const draftsOn = typeof import.meta.env !== 'undefined' && import.meta.env?.VITE_CONTENT_DRAFTS === '1'
export const mergeDrafts = (base, drafts) => ({
  ...base, ...Object.fromEntries(Object.entries(drafts.entries).filter(([id]) => !(id in base))),
})
export const emotions = draftsOn ? mergeDrafts(emotionData, draftEmotions) : emotionData
export const tales = draftsOn ? mergeDrafts(taleData, draftTales) : taleData
export const draftIds = Object.keys(draftEmotions.entries).filter((id) => !(id in emotionData))
