import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { validateText, validateEvidence } from "../src/shared/validation.js";
import type { PreparedBundle } from "../src/shared/types.js";
let failures = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "OK" : "미완료"}  ${label}`);
  if (!ok) failures++;
};
check("Node.js 24", process.versions.node.startsWith("24."));
for (const file of [
  "package-lock.json",
  "README.md",
  "PROCESS.md",
  "VERIFICATION.md",
  "DEMO.md",
  "dist/client/index.html",
  "dist/server/server/index.js",
])
  check(file, existsSync(file));
const b = JSON.parse(
  readFileSync("drafts/prepared.json", "utf8"),
) as PreparedBundle;
check("사전 영상 25개", b.videos.length === 25);
for (const v of b.videos) {
  const d = b.drafts.find((x) => x.videoId === v.id);
  const e = b.evidence.find((x) => x.videoId === v.id);
  check(
    `초안 형식·근거 ${v.id}`,
    Boolean(
      d &&
      !validateText(
        d.text,
        b.drafts.filter((x) => x.videoId !== v.id).map((x) => x.text),
      ).length &&
      !validateEvidence(d, e).length,
    ),
  );
}
try {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  check("Git 추적 파일 존재", files.length > 0);
  check(
    "로컬 데이터·비밀값·빌드·원문 PDF 제외",
    !files.some((f) =>
      /^(\.local[^/]*\/|\.env$|node_modules\/|dist\/)|\.pdf$/i.test(f),
    ),
  );
  const secret =
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AIza[A-Za-z0-9_-]{30,})\b/;
  check(
    "추적된 텍스트에 API 키 패턴 없음",
    !files
      .filter((f) => /\.(?:ts|tsx|json|md|txt|ya?ml)$/.test(f))
      .some((f) => secret.test(readFileSync(f, "utf8"))),
  );
} catch {
  check("Git 초기화와 추적 파일 검사", false);
}
const acceptance = "docs/acceptance.json";
if (existsSync(acceptance)) {
  const data = JSON.parse(readFileSync(acceptance, "utf8")) as Record<
    string,
    { status: string; note: string }
  >;
  for (const [name, item] of Object.entries(data))
    check(`${name}: ${item.note}`, item.status === "verified");
} else check("실환경 인수 기록", false);
console.log(
  `\n${failures ? `${failures}개 미완료 항목이 있어 제출 완료로 판정하지 않습니다.` : "출고 검사 통과. 실행 시점의 최신 목록은 drafts:check로 별도 확인하세요."}`,
);
if (failures) process.exitCode = 1;
