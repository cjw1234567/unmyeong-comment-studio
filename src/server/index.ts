import {
  openSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  closeSync,
} from "node:fs";
import { ensureDataDir, localPath, safeError } from "./config.js";
import { Store } from "./store.js";
import { Studio } from "./service.js";
import { createApp, serveProduction } from "./app.js";

export function lockServer(): () => void {
  const file = localPath("server.lock");
  for (let i = 0; i < 2; i++) {
    try {
      const fd = openSync(file, "wx", 0o600);
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return () => {
        try {
          if (readFileSync(file, "utf8") === String(process.pid))
            unlinkSync(file);
        } catch {}
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pid = Number(readFileSync(file, "utf8"));
      let alive = true;
      try {
        if (!Number.isInteger(pid) || pid <= 0) throw Error();
        process.kill(pid, 0);
      } catch {
        alive = false;
      }
      if (alive)
        throw new Error(
          "이 데이터 폴더를 사용하는 대시보드가 이미 실행 중입니다.",
        );
      unlinkSync(file);
    }
  }
  throw new Error("대시보드 실행 잠금을 만들 수 없습니다.");
}
async function main() {
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new Error(
      "Node.js 24 LTS가 필요합니다. nvm use 또는 README의 설치 절차를 확인해 주세요.",
    );
  ensureDataDir();
  const unlock = lockServer();
  const store = new Store(localPath("studio.sqlite"));
  store.recoverInterrupted();
  const studio = new Studio(store);
  studio.importPrepared();
  const app = createApp(studio);
  const dev = process.argv.includes("--dev");
  if (dev) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else serveProduction(app);
  const port = Number(process.env.PORT || 4317);
  const server = app.listen(port, "127.0.0.1", () =>
    console.log(
      `운명원 댓글 스튜디오 · http://127.0.0.1:${port}\n기본 모드: 테스트. 실제 게시 전 전용 프로필에 로그인해 주세요.`,
    ),
  );
  server.on("error", (error) => {
    console.error(
      (error as NodeJS.ErrnoException).code === "EADDRINUSE"
        ? "포트가 이미 사용 중입니다. PORT를 바꿔 실행해 주세요."
        : safeError(error),
    );
    unlock();
    process.exitCode = 1;
  });
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    studio.discovery.stop();
    server.close();
    unlock();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  process.on("exit", unlock);
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "실행 실패");
  process.exitCode = 1;
});
