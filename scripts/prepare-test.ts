import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  ensureDataDir,
  localPath,
  testVideoIds,
} from "../src/server/config.js";
import { YouTubeSource } from "../src/server/youtube.js";
import { Store } from "../src/server/store.js";
import { parseVideoId, validateText } from "../src/shared/validation.js";
const id = parseVideoId(process.argv[2] || "");
if (!testVideoIds().includes(id))
  throw Error("먼저 본인 테스트 영상으로 등록하세요.");
ensureDataDir();
if (existsSync(localPath("server.lock")))
  throw Error("서버를 종료한 뒤 실행하세요.");
const video = await new YouTubeSource().resolve(id);
video.scope = "test";
const text =
  process.argv[3] ||
  `이 영상은 운명원 댓글 스튜디오의 한 글자씩 입력, 게시, 본인 댓글 확인 기능을 점검하기 위해 지정한 테스트 영상입니다. 동작 확인용 댓글을 남깁니다.`;
if (validateText(text).length) throw Error(validateText(text).join(" "));
const store = new Store(localPath("studio.sqlite"));
try {
  store.upsertVideo(video);
  store.saveEvidence({
    videoId: id,
    title: video.title,
    description: video.description,
    transcript: [],
    comments: [],
    transcriptStatus: "not_requested",
    commentsStatus: "unavailable",
    fetchedAt: new Date().toISOString(),
    notes: [
      "등록한 본인 영상의 기능 테스트용 초안입니다. 운영 채널용 마케팅 초안이 아닙니다.",
    ],
  });
  store.saveDraft({
    id: randomUUID(),
    videoId: id,
    revision: 0,
    summary: `「${video.title}」에서 댓글 입력·게시·본인 댓글 확인 기능을 테스트합니다.`,
    text,
    evidence: [{ source: "title", quote: video.title }],
    source: "prepared",
    purpose: "posting",
    createdAt: new Date().toISOString(),
    reviewed: false,
    validationErrors: [],
  });
  console.log(
    `테스트 초안 준비: ${video.title}\n${text}\n대시보드에서 검토하고 저장한 후 실행하세요.`,
  );
} finally {
  store.close();
}
