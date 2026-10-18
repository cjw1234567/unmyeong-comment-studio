import { writeFileSync } from "node:fs";
import {
  ensureDataDir,
  localPath,
  testVideoIds,
  safeError,
} from "../src/server/config.js";
import { YouTubeSource } from "../src/server/youtube.js";
const source = new YouTubeSource();
ensureDataDir();
const result = await source.latest();
writeFileSync(
  localPath("source-snapshot.json"),
  JSON.stringify(result, null, 2),
);
console.log(
  `운영 영상 ${result.videos.length}개, 채널 오류 ${result.errors.length}개`,
);
for (const id of testVideoIds()) {
  try {
    const v = await source.resolve(id);
    writeFileSync(localPath(`video-${id}.json`), JSON.stringify(v, null, 2));
    console.log(JSON.stringify(v));
  } catch (error) {
    console.log(safeError(error));
  }
}
