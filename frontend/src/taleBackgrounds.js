// One background picture per tale, used in every lesson 3 scene of that tale (public/art/tale/{name}.webp,
// 1536×1024). The earlier pictures are kept in public/art/backup/. Prompts: prompts/tale-backgrounds.md
// A new emotion adds its picture here; without one the scene shows the forest gate picture.
export const TALE_BACKGROUNDS = {
  joy: 'joy-yard',
  sad: 'sad-shore',
  surprise: 'surprise-garden',
  anger: 'anger-playground',
}

export function taleBackground(topicId) {
  const name = TALE_BACKGROUNDS[topicId]
  return name ? 'art/tale/' + name + '.webp' : 'art/forest-gate.webp'
}
