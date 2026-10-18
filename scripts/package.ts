import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, lstatSync } from "node:fs";
import path from "node:path";
import { insideRoot, localPath, ensureDataDir } from "../src/server/config.js";
ensureDataDir();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
if (!files.length) throw Error("Git에 제출할 소스 파일을 먼저 추가하세요.");
if (
  files.some((f) =>
    /^(\.local[^/]*\/|\.env$|node_modules\/|dist\/)|\.pdf$/i.test(f),
  )
)
  throw Error(
    "제출 파일 목록에 제외 대상이 있습니다. release:check를 확인하세요.",
  );
const folder = localPath(`submission/${stamp}/unmyeong-comment-studio`);
mkdirSync(folder, { recursive: true });
for (const file of files) {
  const src = insideRoot(file);
  if (!lstatSync(src).isFile()) throw Error("일반 파일만 제출할 수 있습니다.");
  // ditto omits the ZIP UTF-8 flag on some macOS versions. Keep this document's
  // archive name ASCII so standard ZIP readers preserve its name across Macs.
  const archiveName =
    file === "마케팅_AI_에이전트_요구사항_정의서.md" ? "REQUIREMENTS.md" : file;
  const dest = path.join(folder, archiveName);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
const archive = localPath(`submission/unmyeong-comment-studio-${stamp}.zip`);
execFileSync("/usr/bin/ditto", [
  "-c",
  "-k",
  "--keepParent",
  "--norsrc",
  "--noextattr",
  "--noqtn",
  "--noacl",
  folder,
  archive,
]);
console.log(
  `소스 패키지: ${archive}\n전체 인수 완료 여부는 포함된 VERIFICATION.md를 확인하세요. 이 명령은 제출 완료를 판정하지 않습니다.`,
);
