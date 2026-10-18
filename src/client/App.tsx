import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileText,
  History,
  LayoutDashboard,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Telescope,
  TrendingUp,
  X,
  Zap,
  Orbit,
  Radio,
  KeyRound,
  ChevronDown,
} from "lucide-react";
import type {
  DiscoveryResult,
  Draft,
  PostingAttempt,
  Settings,
  SystemState,
  Video,
  VideoEvidence,
} from "../shared/types";
import { CHANNELS, STAGES, watchUrl } from "../shared/constants";
import { charCount, validateText } from "../shared/validation";
import { api, bootstrap } from "./api";

type Tab = "studio" | "discovery" | "history" | "settings";
const fmt = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
const date = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
const profileName = (id: string) => `유튜브${id.replace("youtube", "")}`;
const statusClass = (status: PostingAttempt["status"]) =>
  status === "succeeded"
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "uncertain" || status === "blocked"
        ? "warning"
        : "running";
function IconButton({
  children,
  label,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function App() {
  const [state, setState] = useState<SystemState>();
  const [videos, setVideos] = useState<Video[]>([]);
  const [attempts, setAttempts] = useState<PostingAttempt[]>([]);
  const [tab, setTab] = useState<Tab>("studio");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [evidence, setEvidence] = useState<VideoEvidence | null>(null);
  const [text, setText] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState("");
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const [url, setUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryResult[]>([]);
  const [candidateDraft, setCandidateDraft] = useState<Draft | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const lastSelection = useRef(0);
  const video = videos.find((v) => v.id === selected);
  const busy = Boolean(state?.busy);
  const disabled = busy || Boolean(working);
  const refresh = useCallback(async () => {
    const [s, v, a, d] = await Promise.all([
      api<SystemState>("/state"),
      api<Video[]>("/videos"),
      api<PostingAttempt[]>("/attempts"),
      api<{ items: DiscoveryResult[] }>("/discovery"),
    ]);
    setState(s);
    setVideos(v);
    setAttempts(a);
    setDiscovery(d.items);
  }, []);
  const loadSelection = useCallback(async (id: string) => {
    const seq = ++lastSelection.current;
    const [d, e] = await Promise.all([
      api<Draft | null>(`/videos/${id}/draft`),
      api<VideoEvidence | null>(`/videos/${id}/evidence`),
    ]);
    if (seq !== lastSelection.current || selectedRef.current !== id) return;
    setDraft(d);
    setText(d?.text || "");
    setReviewed(d?.reviewed || false);
    setEvidence(e);
  }, []);
  useEffect(() => {
    let alive = true;
    let events: EventSource | undefined;
    void bootstrap<SystemState>()
      .then(async (s) => {
        if (!alive) return;
        setState(s);
        await refresh();
        if (!alive) return;
        events = new EventSource("/api/events");
        events.addEventListener("change", () => void refresh().catch(() => {}));
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
      events?.close();
    };
  }, [refresh]);
  useEffect(() => {
    if (!selected) {
      setDraft(null);
      setText("");
      setEvidence(null);
      return;
    }
    void loadSelection(selected).catch((e) => setError(e.message));
  }, [selected, loadSelection]);
  const run = async (name: string, fn: () => Promise<void>) => {
    if (working) return;
    setWorking(name);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업을 완료하지 못했습니다.");
    } finally {
      setWorking("");
    }
  };
  const saveSettings = (patch: Partial<Settings>) =>
    run("settings", async () => {
      const next = await api<SystemState>("/settings", "PATCH", {
        ...state!.settings,
        ...patch,
      });
      setState(next);
    });
  const refreshVideos = () =>
    run("refresh", async () => {
      const result = await api<{ videos: Video[]; errors: string[] }>(
        "/videos/refresh",
        "POST",
        {},
      );
      setVideos(result.videos);
      setFeedErrors(result.errors);
      setNotice(
        result.errors.length
          ? "일부 채널은 저장된 목록을 표시합니다."
          : `${result.videos.length}개 영상의 최신 목록을 확인했습니다.`,
      );
    });
  const choose = (id: string) => {
    if (disabled) return;
    setSelected(id);
    setError("");
    setNotice("");
  };
  const saveDraft = () =>
    run("save", async () => {
      if (!selected || !draft) return;
      const d = await api<Draft>(`/videos/${selected}/draft`, "PATCH", {
        text,
        reviewed,
        revision: draft.revision,
      });
      setDraft(d);
      setText(d.text);
      setReviewed(d.reviewed);
      setNotice(
        d.validationErrors.length
          ? "초안을 저장했습니다. 검증 항목을 확인해 주세요."
          : "초안을 저장했습니다.",
      );
    });
  const generate = () =>
    run("generate", async () => {
      if (!selected) return;
      await api(`/videos/${selected}/draft`, "POST", {});
      await loadSelection(selected);
    });
  const collect = () =>
    run("evidence", async () => {
      if (!selected) return;
      const data = await api<VideoEvidence>(
        `/videos/${selected}/evidence`,
        "POST",
        {},
      );
      setEvidence(data);
      setNotice("확보한 자료와 수집 상태를 확인해 주세요.");
    });
  const post = () =>
    run("post", async () => {
      if (!video || !draft || !state) return;
      await api("/attempts", "POST", {
        videoId: video.id,
        profileId: state.nextProfileId,
        draftRevision: draft.revision,
        requestKey: crypto.randomUUID(),
      });
    });
  const dirty = Boolean(
    draft && (text !== draft.text || reviewed !== draft.reviewed),
  );
  const latest = attempts.find((a) => a.videoId === selected);
  const textErrors = draft ? validateText(text) : [];
  const cannotPost =
    !video ||
    !draft ||
    !draft.reviewed ||
    dirty ||
    draft.validationErrors.length > 0 ||
    busy ||
    Boolean(working) ||
    Boolean(latest && latest.status !== "failed") ||
    Boolean(state && state.occupiedSlots >= state.settings.dailyLimit) ||
    Boolean(
      state?.settings.mode === "test" &&
      video &&
      !state.testVideoIds.includes(video.id),
    );
  const tabs: { id: Tab; name: string; icon: ReactNode }[] = [
    {
      id: "studio",
      name: "댓글 스튜디오",
      icon: <LayoutDashboard size={18} />,
    },
    { id: "discovery", name: "상승 영상 탐색", icon: <Telescope size={18} /> },
    { id: "history", name: "실행 이력", icon: <History size={18} /> },
    { id: "settings", name: "설정", icon: <Settings2 size={18} /> },
  ];
  const filtered = videos.filter(
    (v) =>
      (channel === "all" ||
        v.channelId === channel ||
        (channel === "test" && v.scope === "test")) &&
      `${v.title} ${v.channelName}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="app-shell">
      {state?.simulation && (
        <div className="simulation">
          <Sparkles size={14} /> 화면 체험 모드 · 예시 데이터와 모의 실행입니다.
          실제 댓글은 게시되지 않습니다.
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <span className="brand-symbol">
            <Orbit size={24} />
          </span>
          <div>
            <strong>
              운명원<span> STUDIO</span>
            </strong>
            <small>마음을 잇는 한 줄의 시작</small>
          </div>
        </div>
        <div className="topbar-right">
          <span className="connection">
            <i />
            로컬 연결
          </span>
          <span
            className={`mode-pill ${state?.settings.mode === "review" ? "review-mode" : ""}`}
          >
            <ShieldCheck size={14} />
            {state?.settings.mode === "review" ? "심사 모드" : "테스트 모드"}
          </span>
          <span className="avatar">운</span>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <p className="nav-label">WORKSPACE</p>
          <nav>
            {tabs.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "nav-item active" : "nav-item"}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                <span>{t.name}</span>
                {t.id === "studio" && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="local-note">
              <ShieldCheck size={18} />
              <strong>내 컴퓨터에서 안전하게</strong>
              <p>
                프로필과 실행 기록은
                <br />이 컴퓨터에 보관됩니다.
              </p>
            </div>
            <span className="version">
              COMMENT STUDIO <span>v1.0</span>
            </span>
          </div>
        </aside>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                UNMYEONGWON /{" "}
                {tab === "studio"
                  ? "COMMENT WORKSPACE"
                  : tab === "discovery"
                    ? "DISCOVERY"
                    : tab === "history"
                      ? "ACTIVITY"
                      : "PREFERENCES"}
              </div>
              <h1>
                {tab === "studio"
                  ? "영상의 맥락을, 대화의 시작으로."
                  : tab === "discovery"
                    ? "다음 대화가 시작될 영상."
                    : tab === "history"
                      ? "모든 실행을 한눈에."
                      : "작업 환경을 준비하세요."}
              </h1>
              <p>
                {tab === "studio"
                  ? "영상 속 고민을 이해하고, 검토한 한 줄을 전하세요."
                  : tab === "discovery"
                    ? "실제 조회수 변화를 관측해 성장하는 연애 영상을 찾습니다."
                    : tab === "history"
                      ? "게시한 내용과 결과, 확인이 필요한 순간을 기록합니다."
                      : "전용 프로필과 게시 범위를 확인한 뒤 작업을 시작하세요."}
              </p>
            </div>
            {tab === "studio" && (
              <button
                className="button secondary"
                onClick={refreshVideos}
                disabled={disabled}
              >
                {working === "refresh" ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <RefreshCw size={16} />
                )}
                영상 불러오기
              </button>
            )}
          </div>
          {error && (
            <div className="banner error" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
              <IconButton label="오류 닫기" onClick={() => setError("")}>
                <X size={15} />
              </IconButton>
            </div>
          )}
          {notice && (
            <div className="banner info" role="status">
              <CheckCheck size={18} />
              <span>{notice}</span>
              <IconButton label="안내 닫기" onClick={() => setNotice("")}>
                <X size={15} />
              </IconButton>
            </div>
          )}
          {!state ? (
            <div className="loading-screen">
              <LoaderCircle className="spin" />
              로컬 스튜디오에 연결 중입니다.
            </div>
          ) : (
            <>
              {tab === "studio" && (
                <>
                  <div className="stats">
                    <div>
                      <span className="stat-icon violet">
                        <MessageCircle size={20} />
                      </span>
                      <div>
                        <small>오늘 게시 완료</small>
                        <strong>
                          {state.todaySuccess}
                          <span> / {state.settings.dailyLimit}개</span>
                        </strong>
                      </div>
                      <span className="stat-detail">한국 시간 기준</span>
                    </div>
                    <div>
                      <span className="stat-icon blue">
                        <FileText size={20} />
                      </span>
                      <div>
                        <small>작업 가능한 영상 목록</small>
                        <strong>
                          {videos.length}
                          <span>개 영상</span>
                        </strong>
                      </div>
                    </div>
                    <div>
                      <span className="stat-icon mint">
                        <ShieldCheck size={20} />
                      </span>
                      <div>
                        <small>이번 게시 프로필</small>
                        <strong className="profile-stat">
                          {profileName(state.nextProfileId)}
                        </strong>
                      </div>
                      <Badge tone="green">
                        {state.settings.rotation ? "순환 배정" : "직접 선택"}
                      </Badge>
                    </div>
                  </div>
                  <div className="studio-grid">
                    <section className="panel video-panel">
                      <div className="panel-heading">
                        <span className="step">01</span>
                        <div>
                          <h2>영상 선택</h2>
                          <p>대화를 시작할 영상을 골라주세요</p>
                        </div>
                        <IconButton
                          label="영상 링크 입력"
                          onClick={() => setShowLink((v) => !v)}
                          disabled={disabled}
                        >
                          <Plus size={18} />
                        </IconButton>
                      </div>
                      {showLink && (
                        <form
                          className="link-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void run("resolve", async () => {
                              const v = await api<Video>(
                                "/videos/resolve",
                                "POST",
                                { url },
                              );
                              setVideos((items) => [
                                v,
                                ...items.filter((x) => x.id !== v.id),
                              ]);
                              setSelected(v.id);
                              setShowLink(false);
                              setUrl("");
                            });
                          }}
                        >
                          <input
                            aria-label="유튜브 영상 URL"
                            placeholder="유튜브 영상 링크 붙여넣기"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                          />
                          <button
                            className="button primary small"
                            disabled={disabled || !url.trim()}
                          >
                            추가
                          </button>
                        </form>
                      )}
                      <div className="video-tools">
                        <div className="search-field">
                          <Search size={15} />
                          <input
                            aria-label="영상 검색"
                            placeholder="제목 또는 채널 검색"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </div>
                        <select
                          aria-label="채널 필터"
                          value={channel}
                          onChange={(e) => setChannel(e.target.value)}
                        >
                          <option value="all">전체 채널</option>
                          {CHANNELS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                          <option value="test">내 테스트 영상</option>
                        </select>
                      </div>
                      {feedErrors.length > 0 && (
                        <details className="feed-errors">
                          <summary>{feedErrors.length}개 수집 알림</summary>
                          {feedErrors.map((e) => (
                            <p key={e}>{e}</p>
                          ))}
                        </details>
                      )}
                      <div className="video-list">
                        {filtered.length ? (
                          filtered.map((v) => (
                            <button
                              key={v.id}
                              className={`video-card ${selected === v.id ? "selected" : ""}`}
                              onClick={() => choose(v.id)}
                              disabled={disabled}
                              aria-pressed={selected === v.id}
                            >
                              <div
                                className={`thumbnail ${state.simulation ? "illustrated" : ""}`}
                              >
                                {state.simulation ? (
                                  <>
                                    <span>{v.channelName}</span>
                                    <strong>{v.title.slice(0, 18)}</strong>
                                    <MessageCircle size={28} />
                                  </>
                                ) : (
                                  <img
                                    src={v.thumbnail}
                                    alt=""
                                    loading="lazy"
                                  />
                                )}
                                {selected === v.id && (
                                  <span className="selected-check">
                                    <Check size={12} />
                                  </span>
                                )}
                              </div>
                              <div className="video-copy">
                                <span className="channel-label">
                                  {v.scope === "test"
                                    ? "내 테스트 영상"
                                    : v.channelName}
                                </span>
                                <h3>{v.title}</h3>
                                <span className="video-date">
                                  {date(v.publishedAt)}
                                </span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <Empty
                            icon={<Play size={26} />}
                            title={
                              videos.length
                                ? "검색 결과가 없어요"
                                : "첫 영상을 불러와 주세요"
                            }
                          >
                            {videos.length
                              ? "다른 검색어나 채널을 선택해 보세요."
                              : "5개 채널의 최신 영상과 등록한 테스트 영상을 가져옵니다."}
                          </Empty>
                        )}
                      </div>
                      <div className="panel-footer">
                        <span>
                          <i className="tiny-dot" />
                          허용 채널 5개
                        </span>
                        <span>최신 5개씩 조회</span>
                      </div>
                    </section>
                    <section className="panel draft-panel">
                      <div className="panel-heading">
                        <span className="step">02</span>
                        <div>
                          <h2>맥락과 댓글 초안</h2>
                          <p>영상의 고민에서 자연스러운 한 줄로</p>
                        </div>
                        <Sparkles size={19} className="muted-icon" />
                      </div>
                      {!video ? (
                        <Empty
                          icon={<Sparkles size={28} />}
                          title="어떤 이야기를 나눠볼까요?"
                        >
                          왼쪽에서 영상을 선택하면
                          <br />
                          고민 요약과 준비된 댓글 초안을 보여드려요.
                        </Empty>
                      ) : (
                        <div className="draft-body">
                          <div className="selection-caption">
                            <span className="tiny-dot" />
                            {video.channelName}
                            <a
                              href={watchUrl(video.id)}
                              target="_blank"
                              rel="noreferrer"
                              title="선택한 영상 열기"
                            >
                              <ExternalLink size={13} />
                            </a>
                          </div>
                          <h3 className="selected-title">{video.title}</h3>
                          {draft ? (
                            <>
                              <div className="concern-box">
                                <div>
                                  <Sparkles size={14} />
                                  <span>영상 속 고민 한 줄</span>
                                </div>
                                <p>{draft.summary}</p>
                              </div>
                              <div className="field-heading">
                                <label htmlFor="comment">댓글 초안</label>
                                <Badge tone="purple">
                                  {draft.source === "prepared"
                                    ? "준비된 초안"
                                    : draft.source === "generated"
                                      ? "AI 생성"
                                      : "수정한 초안"}
                                </Badge>
                              </div>
                              <textarea
                                id="comment"
                                value={text}
                                onChange={(e) => {
                                  setText(e.target.value);
                                  setReviewed(false);
                                }}
                                disabled={disabled}
                                placeholder="영상에 맞는 댓글을 작성하세요."
                              />
                              <div className="editor-footer">
                                <span>링크·해시태그·허위 이용 후기 제외</span>
                                <span
                                  className={
                                    charCount(text) > 120 ||
                                    charCount(text) < 40
                                      ? "count invalid"
                                      : "count"
                                  }
                                >
                                  {charCount(text)}
                                  <span> / 120자</span>
                                </span>
                              </div>
                              {[
                                ...new Set([
                                  ...textErrors,
                                  ...draft.validationErrors.filter(
                                    (e) => !e.includes("댓글은 공백"),
                                  ),
                                ]),
                              ].map((e) => (
                                <p className="validation-error" key={e}>
                                  <CircleAlert size={13} />
                                  {e}
                                </p>
                              ))}
                              <details className="evidence-details">
                                <summary>
                                  <FileText size={14} />
                                  댓글의 근거 확인
                                  <ChevronDown size={14} />
                                </summary>
                                {draft.evidence.map((e, i) => (
                                  <blockquote key={i}>
                                    <small>
                                      {e.source === "title"
                                        ? "영상 제목"
                                        : e.source === "description"
                                          ? "영상 설명"
                                          : "자막"}{" "}
                                      {e.timestamp}
                                    </small>
                                    “{e.quote}”
                                  </blockquote>
                                ))}
                                {evidence && (
                                  <p>
                                    자막 {evidence.transcript.length}구간 · 인기
                                    댓글 {evidence.comments.length}개
                                    {evidence.notes.map((n) => (
                                      <span key={n} className="source-note">
                                        {n}
                                      </span>
                                    ))}
                                  </p>
                                )}
                              </details>
                              <label className="review-check">
                                <input
                                  type="checkbox"
                                  checked={reviewed}
                                  onChange={(e) =>
                                    setReviewed(e.target.checked)
                                  }
                                  disabled={disabled}
                                />
                                <span>
                                  영상 근거와 허위 경험 표현이 없는지
                                  검토했습니다.
                                </span>
                              </label>
                              <div className="draft-actions">
                                <button
                                  className="button secondary"
                                  onClick={saveDraft}
                                  disabled={disabled || !dirty}
                                >
                                  <Check size={15} />
                                  검토 내용 저장
                                </button>
                                <button
                                  className="text-button"
                                  onClick={generate}
                                  disabled={disabled || !state.openaiConfigured}
                                >
                                  {working === "generate" ? (
                                    <LoaderCircle className="spin" size={14} />
                                  ) : (
                                    <RefreshCw size={14} />
                                  )}
                                  다시 생성
                                </button>
                              </div>
                              {dirty && (
                                <p className="save-hint">
                                  변경 사항을 저장하면 게시할 수 있습니다.
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="no-draft">
                              <span className="mini-spark">
                                <FileText size={23} />
                              </span>
                              <h3>아직 준비된 초안이 없어요</h3>
                              <p>
                                {state.openaiConfigured
                                  ? "영상 자료를 읽고 고민과 댓글 초안을 생성해 보세요."
                                  : "기존 사전 초안은 키 없이 사용할 수 있습니다. 이 영상의 새 초안을 만들려면 OpenAI API 키가 필요합니다."}
                              </p>
                              <button
                                className="button primary"
                                onClick={generate}
                                disabled={disabled || !state.openaiConfigured}
                              >
                                <Sparkles size={16} />
                                {working === "generate"
                                  ? "초안 만드는 중…"
                                  : "AI 초안 생성"}
                              </button>
                            </div>
                          )}
                          <div className="source-controls">
                            <button
                              className="text-button"
                              onClick={collect}
                              disabled={disabled}
                            >
                              <ArrowDownToLine size={14} />
                              {working === "evidence"
                                ? "자료 읽는 중…"
                                : "영상 근거 새로 읽기"}
                            </button>
                            {evidence && (
                              <span>
                                {evidence.transcriptStatus === "available"
                                  ? "자막 확보"
                                  : "제목·설명 기반"}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="panel-footer">
                        <span>
                          <Sparkles size={13} />
                          AI는 초안을, 최종 검토는 직접
                        </span>
                      </div>
                    </section>
                    <section className="panel posting-panel">
                      <div className="panel-heading">
                        <span className="step">03</span>
                        <div>
                          <h2>댓글 게시</h2>
                          <p>검토한 초안을 크롬에서 직접 입력</p>
                        </div>
                      </div>
                      <div className="posting-body">
                        <label className="field-label" htmlFor="profile">
                          게시할 프로필
                        </label>
                        <div className="profile-select">
                          <span className="profile-icon">
                            {state.nextProfileId.slice(-1)}
                          </span>
                          <select
                            id="profile"
                            value={state.nextProfileId}
                            disabled={disabled || state.settings.rotation}
                            onChange={(e) =>
                              void saveSettings({
                                selectedProfileId: e.target.value,
                              })
                            }
                          >
                            {state.profiles.map((p) => (
                              <option value={p.id} key={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <span className="profile-type">Chrome</span>
                        </div>
                        <label className="toggle-row">
                          <span>영상마다 순환 배정</span>
                          <input
                            type="checkbox"
                            role="switch"
                            checked={state.settings.rotation}
                            onChange={(e) =>
                              void saveSettings({ rotation: e.target.checked })
                            }
                            disabled={disabled}
                          />
                        </label>
                        <div className="divider" />
                        <div className="post-checks">
                          <div>
                            <ShieldCheck size={15} />
                            <span>허용된 영상에만 게시</span>
                            <Check size={14} />
                          </div>
                          <div>
                            <MessageCircle size={15} />
                            <span>영상당 댓글 한 개</span>
                            <Check size={14} />
                          </div>
                          <div>
                            <Clock3 size={15} />
                            <span>오늘 남은 게시 횟수</span>
                            <strong>
                              {Math.max(
                                0,
                                state.settings.dailyLimit - state.occupiedSlots,
                              )}
                              회
                            </strong>
                          </div>
                        </div>
                        {state.settings.mode === "test" && (
                          <div className="test-note">
                            <ShieldCheck size={16} />
                            <p>
                              <strong>테스트 모드로 실행 중</strong>등록한 본인
                              영상에만 게시합니다.
                            </p>
                          </div>
                        )}
                        <button
                          className="button primary post-button"
                          onClick={post}
                          disabled={cannotPost}
                        >
                          <Play size={16} fill="currentColor" />
                          {state.simulation
                            ? "모의 게시 실행"
                            : "댓글 게시하기"}
                          <ArrowRight size={16} />
                        </button>
                        <p className="post-disclaimer">
                          버튼을 누르면 크롬이 열리고
                          <br />
                          입력·게시·확인이 순서대로 진행됩니다.
                        </p>
                        {latest && (
                          <div className="progress">
                            <div className="progress-title">
                              <Badge tone={statusClass(latest.status)}>
                                {STAGES[latest.status]}
                              </Badge>
                              <small>{fmt(latest.startedAt)}</small>
                            </div>
                            <div className="progress-track">
                              {[
                                "opening",
                                "typing",
                                "verifying",
                                "succeeded",
                              ].map((s, i) => {
                                const order = [
                                  "reserved",
                                  "opening",
                                  "loading",
                                  "typing",
                                  "submitting",
                                  "verifying",
                                  "succeeded",
                                ];
                                const done =
                                  order.indexOf(latest.status) >=
                                  order.indexOf(s);
                                return (
                                  <span className={done ? "done" : ""} key={s}>
                                    <i>{done ? <Check size={10} /> : i + 1}</i>
                                    {["크롬 열기", "입력", "확인", "완료"][i]}
                                  </span>
                                );
                              })}
                            </div>
                            {latest.error && (
                              <p className="attempt-error">
                                {latest.failureStage &&
                                  `${latest.failureStage}: `}
                                {latest.error}
                              </p>
                            )}
                            {latest.commentUrl && (
                              <a
                                className="text-button"
                                href={latest.commentUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {latest.commentUrl.includes("lc=")
                                  ? "게시된 댓글 보기"
                                  : "영상에서 댓글 보기"}
                                <ArrowUpRight size={14} />
                              </a>
                            )}
                            {latest.status === "uncertain" && (
                              <button
                                className="text-button"
                                disabled={disabled}
                                onClick={() =>
                                  void run("verify", async () => {
                                    await api(
                                      `/attempts/${latest.id}/verify`,
                                      "POST",
                                      {},
                                    );
                                  })
                                }
                              >
                                <RefreshCw size={14} />
                                결과만 다시 확인
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="panel-footer">
                        <span>
                          <ShieldCheck size={13} />
                          프로필 정보는 외부로 보내지 않아요
                        </span>
                      </div>
                    </section>
                  </div>
                  <div className="bottom-caption">
                    <span>
                      <ShieldCheck size={14} />
                      자동 게시 예약 없이, 직접 확인한 순간에만 실행됩니다.
                    </span>
                    <button
                      className="text-button"
                      onClick={() => setTab("history")}
                    >
                      실행 이력 보기
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </>
              )}
              {tab === "history" && (
                <section className="panel full-panel">
                  <div className="section-top">
                    <div>
                      <h2>게시 실행 기록</h2>
                      <p>
                        확인 필요 건은 다시 게시하지 않고 결과만 확인할 수
                        있습니다.
                      </p>
                    </div>
                    <Badge>{attempts.length}건</Badge>
                  </div>
                  {attempts.length ? (
                    <div className="history-list">
                      {attempts.map((a) => (
                        <article className="history-card" key={a.id}>
                          <div
                            className={`history-status ${statusClass(a.status)}`}
                          >
                            {a.status === "succeeded" ? (
                              <CheckCheck size={21} />
                            ) : a.status === "failed" ||
                              a.status === "uncertain" ||
                              a.status === "blocked" ? (
                              <CircleAlert size={21} />
                            ) : (
                              <LoaderCircle size={21} className="spin" />
                            )}
                          </div>
                          <div className="history-content">
                            <div className="history-meta">
                              <Badge tone={statusClass(a.status)}>
                                {STAGES[a.status]}
                              </Badge>
                              <span>{profileName(a.profileId)}</span>
                              <time>{fmt(a.startedAt)} KST</time>
                            </div>
                            <h3>{a.videoTitle}</h3>
                            <p className="history-comment">{a.text}</p>
                            {a.error && (
                              <p className="attempt-error">
                                {a.failureStage && `${a.failureStage}: `}
                                {a.error}
                              </p>
                            )}
                            <div className="history-links">
                              {a.commentUrl && (
                                <a
                                  href={a.commentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-button"
                                >
                                  {a.commentUrl.includes("lc=")
                                    ? "댓글 보기"
                                    : "영상에서 확인"}
                                  <ExternalLink size={13} />
                                </a>
                              )}
                              {a.screenshot && (
                                <button
                                  className="text-button"
                                  onClick={() => setScreenshot(a.screenshot!)}
                                >
                                  실패 화면 보기
                                </button>
                              )}
                              {a.status === "uncertain" && (
                                <button
                                  className="text-button"
                                  disabled={disabled}
                                  onClick={() =>
                                    void run("verify", async () => {
                                      await api(
                                        `/attempts/${a.id}/verify`,
                                        "POST",
                                        {},
                                      );
                                    })
                                  }
                                >
                                  결과만 다시 확인
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={<History size={30} />}
                      title="아직 실행 기록이 없어요"
                    >
                      댓글 게시를 시작하면 영상·프로필·내용과 결과가 이곳에
                      남습니다.
                    </Empty>
                  )}
                </section>
              )}
              {tab === "discovery" && (
                <>
                  <div className="discovery-intro">
                    <div className="discovery-symbol">
                      <TrendingUp size={26} />
                    </div>
                    <div>
                      <h2>작은 변화에서 다음 흐름을 발견하세요</h2>
                      <p>
                        최근 7일 · ‘연애’ 키워드 · 조회수 1,000~5,000회 · 시간당
                        증가 150회 이상
                      </p>
                    </div>
                    <button
                      className={`button ${state.discovery.running ? "secondary" : "primary"}`}
                      disabled={Boolean(working) || !state.youtubeConfigured}
                      onClick={() =>
                        void run("discovery", async () => {
                          await api(
                            `/discovery/${state.discovery.running ? "stop" : "start"}`,
                            "POST",
                            {},
                          );
                        })
                      }
                    >
                      {state.discovery.running ? (
                        <Square size={14} />
                      ) : (
                        <Radio size={16} />
                      )}{" "}
                      {state.discovery.running ? "관측 중지" : "관측 시작"}
                    </button>
                  </div>
                  <div className="banner info">
                    <Clock3 size={17} />
                    <span>
                      15분마다 조회수를 기록합니다. 최초 판정까지 약 1시간이
                      필요하며 앱을 닫으면 관측이 중지됩니다.
                    </span>
                  </div>
                  {!state.youtubeConfigured && (
                    <div className="banner warning">
                      <KeyRound size={17} />
                      <span>
                        탐색에는 YouTube API 키가 필요합니다. 설정 탭에서 준비
                        상태를 확인하세요.
                      </span>
                    </div>
                  )}
                  {state.discovery.error && (
                    <div className="banner error">
                      <CircleAlert size={17} />
                      {state.discovery.error}
                    </div>
                  )}
                  <section className="panel full-panel">
                    <div className="section-top">
                      <div>
                        <h2>
                          관측 중인 영상{" "}
                          <span className="inline-count">
                            {discovery.length}
                          </span>
                        </h2>
                        <p>탐색 결과에서는 초안만 작성할 수 있습니다.</p>
                      </div>
                      <Badge tone={state.discovery.running ? "green" : "muted"}>
                        {state.discovery.running ? "관측 실행 중" : "관측 중지"}
                      </Badge>
                    </div>
                    {discovery.length ? (
                      <div className="discovery-list">
                        {discovery.map((item) => (
                          <article
                            className="discovery-card"
                            key={item.video.id}
                          >
                            <div className="discovery-copy">
                              <span className="channel-label">
                                {item.video.channelName}
                              </span>
                              <h3>{item.video.title}</h3>
                              <small>
                                {item.lastObservedAt
                                  ? `${fmt(item.lastObservedAt)} 관측`
                                  : "첫 관측 대기"}
                              </small>
                            </div>
                            <div className="discovery-metric">
                              <small>조회수</small>
                              <strong>
                                {item.views?.toLocaleString() ?? "—"}
                              </strong>
                            </div>
                            <div className="discovery-metric growth">
                              <small>시간당 증가</small>
                              <strong>
                                {item.hourlyGain === null
                                  ? "—"
                                  : `+${Math.round(item.hourlyGain)}`}
                              </strong>
                              {item.intervalMinutes && (
                                <small>
                                  {Math.round(item.intervalMinutes)}분 실측
                                </small>
                              )}
                            </div>
                            <Badge
                              tone={
                                item.status === "candidate"
                                  ? "green"
                                  : item.status === "invalid"
                                    ? "danger"
                                    : "muted"
                              }
                            >
                              {
                                {
                                  candidate: "상승 후보",
                                  watching: "관측 중",
                                  waiting: "관측 대기",
                                  stale: "갱신 필요",
                                  invalid: "자료 오류",
                                }[item.status]
                              }
                            </Badge>
                            <button
                              className="button secondary small"
                              disabled={disabled || !state.openaiConfigured}
                              onClick={() =>
                                void run(
                                  `candidate-${item.video.id}`,
                                  async () => {
                                    const d = await api<Draft>(
                                      `/videos/${item.video.id}/draft`,
                                      "POST",
                                      { purpose: "discovery" },
                                    );
                                    setCandidateDraft(d);
                                  },
                                )
                              }
                            >
                              <Sparkles size={14} />
                              초안
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        icon={<Telescope size={32} />}
                        title="성장하는 영상을 찾아볼까요?"
                      >
                        관측을 시작하면 최근 검색 결과와 조회수 변화를 모읍니다.
                        <br />
                        과거 증가량을 추정해 채우지 않습니다.
                      </Empty>
                    )}
                  </section>
                  {candidateDraft && (
                    <section className="panel candidate-result">
                      <div className="section-top">
                        <h2>탐색 전용 초안</h2>
                        <Badge tone="purple">게시 기능 없음</Badge>
                      </div>
                      <h3>{candidateDraft.summary}</h3>
                      <p>{candidateDraft.text}</p>
                      <small>
                        실제 영상 근거가 충분한지 직접 검토해 주세요.
                      </small>
                    </section>
                  )}
                </>
              )}
              {tab === "settings" && (
                <div className="settings-grid">
                  <section className="panel settings-panel">
                    <div className="section-top">
                      <div>
                        <h2>크롬 전용 프로필</h2>
                        <p>
                          YouTube 로그인 후 로그인 완료·창 종료를 눌러 주세요.
                        </p>
                      </div>
                      <ShieldCheck size={20} />
                    </div>
                    {state.profiles.map((p, i) => (
                      <div className="profile-setting" key={p.id}>
                        <span className={`profile-circle color-${i}`}>
                          {i + 1}
                        </span>
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {p.prepared
                              ? "프로필 폴더 준비됨 · 로그인은 게시 시 확인"
                              : "아직 준비되지 않았습니다"}
                          </small>
                        </div>
                        <button
                          className="button secondary small"
                          disabled={disabled || state.simulation}
                          onClick={() =>
                            void run("profile", async () => {
                              const r = await api<{ message: string }>(
                                `/profiles/${p.id}/open`,
                                "POST",
                                {},
                              );
                              setNotice(r.message);
                            })
                          }
                        >
                          로그인 창 열기
                          <ArrowUpRight size={13} />
                        </button>
                        <button
                          className="text-button"
                          disabled={disabled || state.simulation}
                          onClick={() =>
                            void run("profile-close", async () => {
                              const r = await api<{ message: string }>(
                                `/profiles/${p.id}/close`,
                                "POST",
                                {},
                              );
                              setNotice(r.message);
                            })
                          }
                        >
                          로그인 완료·창 종료
                        </button>
                      </div>
                    ))}
                    <p className="settings-footnote">
                      일상용 크롬 프로필을 복사하지 않습니다. 인증 정보는 전용
                      Chrome이 관리하며 프로그램에서 추출하지 않습니다.
                    </p>
                  </section>
                  <section className="panel settings-panel">
                    <div className="section-top">
                      <div>
                        <h2>게시 범위와 상한</h2>
                        <p>
                          설정 변경은 진행 중인 게시가 없을 때만 가능합니다.
                        </p>
                      </div>
                      <Settings2 size={20} />
                    </div>
                    <label className="setting-field">
                      <span>
                        <strong>실행 모드</strong>
                        <small>
                          심사 모드에서는 운영 채널 게시가 가능합니다.
                        </small>
                      </span>
                      <select
                        value={state.settings.mode}
                        disabled={disabled}
                        onChange={(e) =>
                          void saveSettings({
                            mode: e.target.value as "test" | "review",
                          })
                        }
                      >
                        <option value="test">테스트 모드</option>
                        <option value="review">심사 모드</option>
                      </select>
                    </label>
                    <label className="setting-field">
                      <span>
                        <strong>하루 게시 상한</strong>
                        <small>
                          모든 프로필 합산 · 한국 시간 · 확인 필요 건 포함
                        </small>
                      </span>
                      <select
                        value={state.settings.dailyLimit}
                        disabled={disabled}
                        onChange={(e) =>
                          void saveSettings({
                            dailyLimit: Number(e.target.value),
                          })
                        }
                      >
                        {Array.from({ length: 10 }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}개
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="setting-field">
                      <span>
                        <strong>등록한 본인 테스트 영상</strong>
                        <small>
                          {state.testVideoIds.length
                            ? state.testVideoIds.join(", ")
                            : "등록된 영상 없음"}
                        </small>
                      </span>
                      <Badge>{state.testVideoIds.length}개</Badge>
                    </div>
                    <p className="settings-footnote">
                      테스트 영상은 터미널의 test-video:add 명령으로 등록합니다.
                      다른 채널의 영상은 등록하지 마세요.
                    </p>
                  </section>
                  <section className="panel settings-panel">
                    <div className="section-top">
                      <div>
                        <h2>선택 기능 연결</h2>
                        <p>키 값은 브라우저에 전달하거나 표시하지 않습니다.</p>
                      </div>
                      <KeyRound size={20} />
                    </div>
                    <div className="integration">
                      <span className="integration-icon">
                        <Sparkles size={20} />
                      </span>
                      <div>
                        <strong>OpenAI</strong>
                        <small>새 영상의 고민 요약과 댓글 초안 생성</small>
                      </div>
                      <Badge tone={state.openaiConfigured ? "green" : "muted"}>
                        {state.openaiConfigured ? "설정됨" : "키 없음"}
                      </Badge>
                    </div>
                    <div className="integration">
                      <span className="integration-icon red">
                        <Play size={20} />
                      </span>
                      <div>
                        <strong>YouTube Data API</strong>
                        <small>상승 영상 검색과 실제 조회수 관측</small>
                      </div>
                      <Badge tone={state.youtubeConfigured ? "green" : "muted"}>
                        {state.youtubeConfigured ? "설정됨" : "키 없음"}
                      </Badge>
                    </div>
                    <p className="settings-footnote">
                      프로젝트의 .env에 키를 설정하고 서버를 다시 실행하세요.
                      사전 초안 확인·기본 게시에는 API 키가 필요하지 않습니다.
                    </p>
                  </section>
                  <section className="panel settings-panel">
                    <div className="section-top">
                      <div>
                        <h2>게시 허용 채널</h2>
                        <p>채널 이름 대신 실제 채널 ID로 검증합니다.</p>
                      </div>
                      <CheckCheck size={20} />
                    </div>
                    <div className="channel-list">
                      {CHANNELS.map((c) => (
                        <div key={c.id}>
                          <span className="channel-initial">{c.name[0]}</span>
                          <strong>{c.name}</strong>
                          <ShieldCheck size={15} />
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="app-footer">
            <span>운명원 댓글 스튜디오</span>
            <span>검토한 한 줄, 의미 있는 연결.</span>
            <span>LOCAL WORKSPACE</span>
          </footer>
        </main>
      </div>
      {screenshot && (
        <div className="modal-backdrop" onClick={() => setScreenshot(null)}>
          <section
            className="screenshot-modal"
            role="dialog"
            aria-label="실패 화면 캡처"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2>실패 시점의 영상 화면</h2>
              <IconButton label="캡처 닫기" onClick={() => setScreenshot(null)}>
                <X size={20} />
              </IconButton>
            </div>
            <img
              src={`/api/screenshots/${screenshot}`}
              alt="댓글 실행 실패 시점의 화면"
            />
          </section>
        </div>
      )}
    </div>
  );
}
