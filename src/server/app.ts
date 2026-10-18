import express, { type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { existsSync } from "node:fs";
import { AppError, insideRoot, localPath, safeError } from "./config.js";
import { parseVideoId } from "../shared/validation.js";
import { openManualProfile, closeManualProfile } from "./profiles.js";
import type { Studio } from "./service.js";

export function createApp(studio: Studio) {
  const app = express();
  const csrf = randomBytes(32).toString("hex");
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const hostname = req.hostname;
    if (!["127.0.0.1", "localhost"].includes(hostname))
      return res
        .status(403)
        .json({ error: "로컬 주소에서만 접근할 수 있습니다." });
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`)
      return res
        .status(403)
        .json({ error: "다른 웹사이트의 요청은 허용하지 않습니다." });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    if (req.path.startsWith("/api/"))
      res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-studio-token"] !== csrf
    )
      return res.status(403).json({
        error: "요청 인증이 만료되었습니다. 화면을 새로고침해 주세요.",
      });
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  const body = <T>(schema: z.ZodType<T>, req: Request): T => {
    const result = schema.safeParse(req.body);
    if (!result.success)
      throw new AppError("INPUT", "입력 형식을 확인해 주세요.");
    return result.data;
  };
  const purpose = (value: unknown) =>
    value === "discovery" ? ("discovery" as const) : ("posting" as const);
  app.get("/api/bootstrap", (_req, res) =>
    res.json({ token: csrf, state: studio.state() }),
  );
  app.get("/api/state", (_req, res) => res.json(studio.state()));
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = () =>
      res.write(
        `event: change\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
      );
    send();
    studio.events.on("change", send);
    const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      studio.events.off("change", send);
    });
  });
  app.get("/api/videos", (_req, res) => res.json(studio.listVideos()));
  app.post("/api/videos/refresh", async (_req, res) =>
    res.json(await studio.refresh()),
  );
  app.post("/api/videos/resolve", async (req, res) => {
    const input = body(z.object({ url: z.string().max(1000) }), req);
    res.json(await studio.resolve(parseVideoId(input.url)));
  });
  app.get("/api/videos/:id/evidence", (req, res) =>
    res.json(
      studio.store.evidence(req.params.id, purpose(req.query.purpose)) ?? null,
    ),
  );
  app.post("/api/videos/:id/evidence", async (req, res) =>
    res.json(
      await studio.evidence(
        req.params.id as string,
        purpose(req.body?.purpose),
      ),
    ),
  );
  app.get("/api/videos/:id/draft", (req, res) =>
    res.json(
      studio.store.draft(req.params.id, purpose(req.query.purpose)) ?? null,
    ),
  );
  app.post("/api/videos/:id/draft", async (req, res) =>
    res.json(
      await studio.generate(
        req.params.id as string,
        purpose(req.body?.purpose),
      ),
    ),
  );
  app.patch("/api/videos/:id/draft", (req, res) => {
    const input = body(
      z.object({
        text: z.string().max(1000),
        reviewed: z.boolean(),
        revision: z.number().int(),
        purpose: z.enum(["posting", "discovery"]).default("posting"),
      }),
      req,
    );
    const current = studio.store.draft(req.params.id as string, input.purpose);
    if (!current) throw new AppError("NOT_FOUND", "초안이 없습니다.", 404);
    if (current.revision !== input.revision)
      throw new AppError(
        "DRAFT_CHANGED",
        "다른 창에서 초안이 변경되었습니다. 다시 불러와 주세요.",
        409,
      );
    const result = studio.store.saveDraft({
      ...current,
      text: input.text,
      reviewed: input.reviewed,
      source: "edited",
    });
    studio.emit();
    res.json(result);
  });
  app.patch("/api/settings", (req, res) => {
    const input = body(
      z.object({
        mode: z.enum(["test", "review"]),
        dailyLimit: z.number().int().min(1).max(10),
        rotation: z.boolean(),
        selectedProfileId: z.enum(["youtube1", "youtube2", "youtube3"]),
      }),
      req,
    );
    if (studio.verifying)
      throw new AppError(
        "BUSY",
        "결과 확인 중에는 설정을 변경할 수 없습니다.",
        409,
      );
    studio.store.saveSettings(input);
    studio.emit();
    res.json(studio.state());
  });
  app.post("/api/profiles/:id/open", async (req, res) => {
    if (studio.state().busy)
      throw new AppError(
        "BUSY",
        "게시·확인 작업이 끝난 뒤 프로필을 준비해 주세요.",
        409,
      );
    if (studio.simulation)
      throw new AppError(
        "SIMULATION",
        "화면 체험에서는 실제 크롬 프로필을 열지 않습니다.",
      );
    await openManualProfile(req.params.id as string);
    studio.emit();
    res.json({
      message:
        "열린 Chrome의 YouTube에 로그인한 뒤 로그인 완료·창 종료를 눌러 주세요.",
    });
  });
  app.post("/api/profiles/:id/close", async (req, res) => {
    if (studio.state().busy || studio.simulation)
      throw new AppError("BUSY", "현재 프로필을 종료할 수 없습니다.", 409);
    await closeManualProfile(req.params.id as string);
    studio.emit();
    res.json({
      message: "전용 로그인 창을 종료했습니다. 이제 게시할 수 있습니다.",
    });
  });
  app.get("/api/attempts", (_req, res) => res.json(studio.store.attempts()));
  app.post("/api/attempts", (req, res) => {
    const input = body(
      z.object({
        videoId: z.string().regex(/^[\w-]{11}$/),
        profileId: z.enum(["youtube1", "youtube2", "youtube3"]),
        draftRevision: z.number().int().positive(),
        requestKey: z.string().uuid(),
      }),
      req,
    );
    res.status(202).json(studio.start(input));
  });
  app.post("/api/attempts/:id/verify", async (req, res) =>
    res.json(await studio.verify(req.params.id as string)),
  );
  app.get("/api/screenshots/:name", (req, res) => {
    if (!/^[a-f0-9-]{36}\.png$/.test(req.params.name))
      throw new AppError("NOT_FOUND", "캡처가 없습니다.", 404);
    const file = localPath(`screenshots/${req.params.name}`);
    if (!existsSync(file))
      throw new AppError("NOT_FOUND", "캡처가 없습니다.", 404);
    res.sendFile(file);
  });
  app.get("/api/discovery", (_req, res) =>
    res.json({
      status: studio.discovery.status(),
      items: studio.discovery.results(),
    }),
  );
  app.post("/api/discovery/start", async (_req, res) => {
    await studio.discovery.start();
    res.json(studio.discovery.status());
  });
  app.post("/api/discovery/stop", (_req, res) => {
    studio.discovery.stop();
    res.json(studio.discovery.status());
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "요청한 API가 없습니다." }),
  );
  app.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      _next: express.NextFunction,
    ) =>
      res.status(error instanceof AppError ? error.status : 500).json({
        error: safeError(error),
        code: error instanceof AppError ? error.code : "INTERNAL",
      }),
  );
  return app;
}
export function serveProduction(app: express.Express) {
  const folder = insideRoot("dist/client");
  app.use(express.static(folder, { index: false }));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(insideRoot("dist/client/index.html")),
  );
}
