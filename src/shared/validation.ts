import { VIDEO_ID } from "./constants.js";
import type { Draft, VideoEvidence } from "./types.js";
export const charCount = (text: string) =>
  [...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text)]
    .length;
export function validateText(text: string, others: string[] = []): string[] {
  const errors: string[] = [];
  const n = charCount(text);
  if (n < 40 || n > 120)
    errors.push(`댓글은 공백 포함 40~120자여야 합니다. 현재 ${n}자입니다.`);
  if (!text.includes("운명원")) errors.push("운명원에 대한 언급이 필요합니다.");
  if (/https?:|www\.|(?:[a-z0-9-]+\.)+(?:com|net|org|kr|io|be)\b/i.test(text))
    errors.push("댓글에 링크를 넣을 수 없습니다.");
  if (/[#＃]/u.test(text)) errors.push("댓글에 해시태그를 넣을 수 없습니다.");
  if (
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b\u200c\u200d\u202a-\u202e\u2066-\u2069]/u.test(
      text.replaceAll("\u200d", ""),
    )
  )
    errors.push("숨겨진 제어 문자는 사용할 수 없습니다.");
  const normalized = text.normalize("NFC").replace(/\s+/g, "").trim();
  if (
    others.some(
      (t) => t.normalize("NFC").replace(/\s+/g, "").trim() === normalized,
    )
  )
    errors.push("다른 영상의 댓글과 동일합니다. 영상에 맞게 수정해 주세요.");
  return errors;
}
const canonical = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
export function validateEvidence(
  draft: Pick<Draft, "summary" | "evidence">,
  source?: VideoEvidence,
): string[] {
  if (!source) return ["영상 근거 자료가 없습니다."];
  if (!draft.summary.trim()) return ["고민 요약이 없습니다."];
  if (!draft.evidence.length) return ["구체적 발언·장면의 근거가 필요합니다."];
  return draft.evidence.flatMap((ref) => {
    const pool =
      ref.source === "title"
        ? source.title
        : ref.source === "description"
          ? source.description
          : source.transcript.map((t) => t.text).join(" ");
    return canonical(ref.quote).length < 3 ||
      !canonical(pool).includes(canonical(ref.quote))
      ? ["근거 발췌가 실제 영상 자료와 일치하지 않습니다."]
      : [];
  });
}
export function parseVideoId(input: string): string {
  const value = input.trim();
  if (VIDEO_ID.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("올바른 유튜브 영상 URL을 입력해 주세요.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("지원하지 않는 영상 주소입니다.");
  let id: string | null = null;
  if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  else if (
    ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)
  ) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (/^\/(shorts|live|embed)\//.test(url.pathname))
      id = url.pathname.split("/")[2] ?? null;
  }
  if (!id || !VIDEO_ID.test(id))
    throw new Error("지원하는 유튜브 영상 링크가 아닙니다.");
  return id;
}
export const seoulDate = (now: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
