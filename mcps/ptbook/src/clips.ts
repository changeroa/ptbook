import index from "../assets/video-index.json";

export function findClips(query: string, limit: number) {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return { clips: index.map(clip => {
    const name = `${clip.exercise} ${clip.bodyPart} ${clip.creator}`.toLocaleLowerCase();
    const cues = clip.cues.join(" ").toLocaleLowerCase();
    return { clip, score: terms.reduce((sum, term) =>
      sum + (name.includes(term) ? 3 : 0) + (cues.includes(term) ? 1 : 0), 0) };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score)
    .slice(0, limit).map(item => item.clip),
    indexedSegments: index.length, source: "youtube_public_captions",
    limitation: "제공된 19개 구간만 검색합니다. 자동자막 기반 설명이며 웹 전체 검색이 아닙니다." };
}
