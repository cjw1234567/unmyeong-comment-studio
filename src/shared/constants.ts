export const CHANNELS = [
  { id: "UCxlc0Ky0aWoD8uI09ad44Tg", name: "외롭여" },
  { id: "UC-ee_ziASM251TMXe3P3VZA", name: "리즈시절 LizTV" },
  { id: "UC09L3JxGVcn7SKLa-pjTEmw", name: "러브커넥트 유지연" },
  { id: "UCVdtDW-HF4KluixGaBAcI4w", name: "연애데이터 노노" },
  { id: "UCkGl2jieOVhGiHPdXF77Yyw", name: "심리조각" },
] as const;
export const PROFILES = [
  { id: "youtube1", name: "유튜브1" },
  { id: "youtube2", name: "유튜브2" },
  { id: "youtube3", name: "유튜브3" },
];
export const STAGES = {
  reserved: "사전 검증",
  opening: "프로필 여는 중",
  loading: "영상 여는 중",
  typing: "입력 중",
  submitting: "게시 중",
  verifying: "댓글 확인 중",
  succeeded: "게시 완료",
  failed: "실패",
  uncertain: "확인 필요",
  blocked: "기존 댓글로 차단",
} as const;
export const VIDEO_ID = /^[\w-]{11}$/;
export const watchUrl = (id: string) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
