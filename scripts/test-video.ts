import { writeFileSync } from "node:fs";
import { parseVideoId } from "../src/shared/validation.js";
import {
  ensureDataDir,
  localPath,
  testVideoIds,
} from "../src/server/config.js";
const url = process.argv[2];
if (!url || !process.argv.includes("--owned"))
  throw new Error(
    '사용법: npm run test-video:add -- "영상URL" --owned\n본인 소유 또는 게시 테스트 허가를 받은 영상만 등록하세요.',
  );
const id = parseVideoId(url);
ensureDataDir();
writeFileSync(
  localPath("test-videos.json"),
  JSON.stringify([...new Set([...testVideoIds(), id])], null, 2),
  { mode: 0o600 },
);
console.log(`등록 완료: ${id}. 다음 영상 불러오기에서 표시됩니다.`);
