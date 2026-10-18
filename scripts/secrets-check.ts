import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

// Never print matched text or secret values, including when this check fails.
const git = (...args: string[]) =>
  execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 });
const split = (value: Buffer) =>
  value.toString("utf8").split("\0").filter(Boolean);
const env = existsSync(".env") ? parse(readFileSync(".env")) : {};
const knownSecrets = [
  ...new Set(
    [env.OPENAI_API_KEY, env.YOUTUBE_API_KEY].filter((v): v is string =>
      Boolean(v),
    ),
  ),
];
const pattern =
  /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AIza[A-Za-z0-9_-]{30,})\b/;
const forbidden = (file: string) =>
  file !== ".env.example" &&
  /^(?:\.env(?:\.|$)|\.local[^/]*(?:\/|$)|\.runtime\/|node_modules\/|dist\/)|\.(?:pem|p12|pfx|key|sqlite(?:-wal|-shm)?|pdf)$/i.test(
    file,
  );
const failures = new Set<string>();
const scan = (bytes: Buffer, label: string) => {
  if (
    pattern.test(bytes.toString("utf8")) ||
    knownSecrets.some((s) => bytes.includes(Buffer.from(s)))
  )
    failures.add(`${label}: 비밀값 의심 내용`);
};
const files = split(git("ls-files", "-z"));
if (!files.length) throw Error("검사할 Git 추적 파일이 없습니다.");
for (const file of files) {
  if (forbidden(file)) failures.add(`작업 트리: 제외 대상 ${file}`);
  if (existsSync(file) && lstatSync(file).isFile())
    scan(readFileSync(file), `작업 트리 ${file}`);
}
const seenBlobs = new Set<string>();
const scanBlob = (oid: string, label: string) => {
  if (!seenBlobs.has(oid)) {
    scan(git("cat-file", "blob", oid), label);
    seenBlobs.add(oid);
  }
};
const index = split(git("ls-files", "--stage", "-z"));
for (const entry of index) {
  const [meta, file] = entry.split("\t");
  const [, oid] = meta.split(" ");
  if (forbidden(file)) failures.add(`스테이징: 제외 대상 ${file}`);
  scanBlob(oid, `스테이징 ${file}`);
}
const commits = git("rev-list", "--all")
  .toString("utf8")
  .trim()
  .split("\n")
  .filter(Boolean);
for (const commit of commits) {
  for (const entry of split(git("ls-tree", "-rz", commit))) {
    const tab = entry.indexOf("\t");
    const [, type, oid] = entry.slice(0, tab).split(" ");
    const file = entry.slice(tab + 1);
    if (forbidden(file))
      failures.add(`이력 ${commit.slice(0, 7)}: 제외 대상 ${file}`);
    if (type === "blob") scanBlob(oid, `이력 ${commit.slice(0, 7)} ${file}`);
  }
}
const remoteCount = git("remote")
  .toString("utf8")
  .trim()
  .split("\n")
  .filter(Boolean).length;
console.log(
  `검사: 작업 트리 ${files.length}개 · 인덱스 ${index.length}개 · 커밋 ${commits.length}개 · 원격 ${remoteCount}개`,
);
console.log(
  `검사 방식: API 키 패턴 + 로컬에 설정된 API 키 ${knownSecrets.length}개의 실제 값 대조 (값 비출력)`,
);
for (const failure of failures) console.error(`실패: ${failure}`);
console.log(
  failures.size
    ? `비밀값 검사 실패 ${failures.size}건`
    : "비밀값 검사 통과 · 제외 대상 및 일치 내용 0건",
);
console.log(
  "범위: 로컬 Git의 추적 작업 트리·인덱스·모든 로컬 참조의 이력. 원격 서버나 추적하지 않는 파일은 검사하지 않습니다.",
);
if (failures.size) process.exitCode = 1;
