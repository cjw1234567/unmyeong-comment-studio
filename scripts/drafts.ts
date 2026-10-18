import { readFileSync, writeFileSync } from "node:fs";
import { YouTubeSource } from "../src/server/youtube.js";
import { readVideoEvidence } from "../src/server/browser.js";
import { generateDraft } from "../src/server/ai.js";
import { insideRoot } from "../src/server/config.js";
import { validateText, validateEvidence } from "../src/shared/validation.js";
import type { PreparedBundle } from "../src/shared/types.js";
const file = insideRoot("drafts/prepared.json");
const bundle = JSON.parse(readFileSync(file, "utf8")) as PreparedBundle;
const source = new YouTubeSource();
const result = await source.latest();
if (result.errors.length) {
  console.error(result.errors.join("\n"));
  console.error(
    "최신 대상 목록을 검증하지 못했습니다. 기존 초안을 덮어쓰지 않습니다.",
  );
  process.exitCode = 1;
} else if (process.argv[2] === "refresh") {
  if (!process.env.OPENAI_API_KEY)
    throw Error(
      "새 초안 준비에는 OPENAI_API_KEY가 필요합니다. 배포본 실행에는 필요하지 않습니다.",
    );
  const next: PreparedBundle = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    videos: result.videos,
    evidence: [],
    drafts: [],
  };
  for (const video of result.videos) {
    console.log(`자료 수집: ${video.channelName} / ${video.id}`);
    const evidence = await readVideoEvidence(video);
    const draft = await generateDraft(
      evidence,
      "posting",
      next.drafts.map((d) => d.text),
    );
    next.evidence.push(evidence);
    next.drafts.push({ ...draft, source: "prepared", reviewed: false });
  }
  writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  console.log(
    `${next.drafts.length}개 초안 저장. 반드시 영상 근거와 내용을 직접 검토하세요.`,
  );
} else {
  let missing = 0;
  for (const video of result.videos) {
    const draft = bundle.drafts.find((d) => d.videoId === video.id);
    const evidence = bundle.evidence.find((e) => e.videoId === video.id);
    const errors = draft
      ? [
          ...validateText(
            draft.text,
            bundle.drafts
              .filter((d) => d.videoId !== video.id)
              .map((d) => d.text),
          ),
          ...validateEvidence(draft, evidence),
        ]
      : ["초안 없음"];
    console.log(
      `${errors.length ? "미완료" : "OK"} ${video.channelName} / ${video.id}${errors.length ? `: ${errors.join(", ")}` : ""}`,
    );
    if (errors.length) missing++;
  }
  console.log(`최신 ${result.videos.length}개 중 미완료 ${missing}개`);
  if (missing || !result.videos.length) process.exitCode = 1;
}
