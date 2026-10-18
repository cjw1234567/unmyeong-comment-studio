import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { localPath, ensureDataDir } from "../src/server/config.js";
import { readVideoEvidence } from "../src/server/browser.js";
import type { Video } from "../src/shared/types.js";
ensureDataDir();
mkdirSync(localPath("evidence"), { recursive: true });
const snapshot = JSON.parse(
  readFileSync(localPath("source-snapshot.json"), "utf8"),
) as { videos: Video[] };
const args = process.argv.slice(2);
const videos = args.length
  ? snapshot.videos.filter((v) => args.includes(v.id))
  : snapshot.videos;
for (const video of videos) {
  console.log(`시작 ${video.id} ${video.channelName}`);
  const data = await readVideoEvidence(video);
  writeFileSync(
    localPath(`evidence/${video.id}.json`),
    JSON.stringify(data, null, 2),
  );
  console.log(
    `완료 ${video.id}: 자막 ${data.transcript.length}, 댓글 ${data.comments.length}, ${data.notes.join(" ")}`,
  );
}
