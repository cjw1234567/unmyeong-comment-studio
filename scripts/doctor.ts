import { existsSync, readFileSync } from "node:fs";
import {
  insideRoot,
  profilePrepared,
  testVideoIds,
} from "../src/server/config.js";
import { PROFILES } from "../src/shared/constants.js";
const checks = [
  ["Node.js 24 LTS", Number(process.versions.node.split(".")[0]) === 24],
  [
    "Google Chrome",
    existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
  ],
  ["빌드된 대시보드", existsSync(insideRoot("dist/client/index.html"))],
  [
    "사전 초안",
    JSON.parse(readFileSync(insideRoot("drafts/prepared.json"), "utf8")).drafts
      .length > 0,
  ],
  ["본인 테스트 영상 등록", testVideoIds().length > 0],
] as const;
for (const [label, ok] of checks)
  console.log(`${ok ? "OK" : "필요"}  ${label}`);
for (const p of PROFILES)
  console.log(
    `${profilePrepared(p.id) ? "폴더 있음" : "준비 필요"}  ${p.name} (로그인 상태는 게시 시 확인)`,
  );
console.log(
  `OpenAI 키: ${process.env.OPENAI_API_KEY ? "설정됨" : "없음 (선택)"}\nYouTube 키: ${process.env.YOUTUBE_API_KEY ? "설정됨" : "없음 (선택)"}`,
);
if (!checks[0][1] || !checks[1][1]) process.exitCode = 1;
