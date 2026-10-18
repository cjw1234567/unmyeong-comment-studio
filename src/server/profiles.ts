import { spawn, execFile } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  readlinkSync,
} from "node:fs";
import { promisify } from "node:util";
import { AppError, localPath, profilePath, testVideoIds } from "./config.js";
import { watchUrl } from "../shared/constants.js";
export async function openManualProfile(id: string) {
  if (process.platform !== "darwin")
    throw new AppError("MAC_REQUIRED", "프로필 준비 기능은 Mac용입니다.");
  const folder = profilePath(id);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  // Normal Chrome launch: no debugging connection, no cookie export, no automatic login.
  const child = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      `--user-data-dir=${folder}`,
      "--profile-directory=Default",
      "--no-first-run",
      "--no-default-browser-check",
      testVideoIds()[0] ? watchUrl(testVideoIds()[0]) : "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  );
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", () =>
      reject(
        new AppError(
          "CHROME_MISSING",
          "Google Chrome을 /Applications에 설치해 주세요.",
        ),
      ),
    );
  });
  child.unref();
  await new Promise((r) => setTimeout(r, 300));
  let pid = child.pid;
  try {
    const match = readlinkSync(`${folder}/SingletonLock`).match(/-(\d+)$/);
    if (match) pid = Number(match[1]);
  } catch {}
  writeFileSync(localPath(`manual-${id}.json`), JSON.stringify({ pid }), {
    mode: 0o600,
  });
}
export async function closeManualProfile(id: string) {
  const folder = profilePath(id);
  const file = localPath(`manual-${id}.json`);
  const clean = () => {
    if (existsSync(file)) unlinkSync(file);
  };
  let pid: number | undefined;
  try {
    const match = readlinkSync(`${folder}/SingletonLock`).match(/-(\d+)$/);
    if (match) pid = Number(match[1]);
  } catch {}
  if (!pid && existsSync(file))
    pid = (JSON.parse(readFileSync(file, "utf8")) as { pid: number }).pid;
  if (!pid) {
    clean();
    return;
  }
  if (!Number.isInteger(pid) || pid <= 0)
    throw new AppError(
      "PROFILE_PROCESS",
      "프로필 실행 정보를 확인할 수 없습니다.",
    );
  let command = "";
  try {
    command = (
      await promisify(execFile)("/bin/ps", [
        "-p",
        String(pid),
        "-o",
        "command=",
      ])
    ).stdout.trim();
  } catch {
    clean();
    return;
  }
  if (
    !command.startsWith(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome ",
    ) ||
    !command.includes(`--user-data-dir=${folder} `)
  )
    throw new AppError(
      "PROFILE_PROCESS",
      "전용 프로필 프로세스를 확인하지 못했습니다. Chrome 메뉴에서 직접 종료해 주세요.",
    );
  process.kill(pid, "SIGTERM");
  for (let i = 0; i < 40; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      clean();
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new AppError(
    "PROFILE_PROCESS",
    "Chrome이 아직 종료 중입니다. 잠시 뒤 게시해 주세요.",
  );
}
