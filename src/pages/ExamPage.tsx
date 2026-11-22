import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  FileText,
  Loader2,
  Lock,
  LogOut,
  Send,
  ShieldAlert,
  ShieldCheck,
  Timer,
} from "lucide-react";
import PdfViewer from "../components/PdfViewer";
import {
  PanelFor,
  TABS,
  answeredCount,
  totalAnswered,
  totalQuestions,
} from "../components/AnswerPanels";
import { playAlarm, stopAlarm, unlockAudio, wipeClipboard } from "../lib/alarm";
import { ApiError, studentApi, sessionToken } from "../lib/api";
import type { Answers, QuestionType, Session } from "../lib/types";
import { emptyAnswers, normalizeAnswers } from "../lib/types";

const fmtClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

type Warning = { title: string; body: string; tone: "warn" | "lock" };

export default function ExamPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers());
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");
  const [activeTab, setActiveTab] = useState<QuestionType>("pg");
  const [mobileView, setMobileView] = useState<"soal" | "jawaban">("soal");
  const [deadlineMs, setDeadlineMs] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [armed, setArmed] = useState(false);
  const [violations, setViolations] = useState(0);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(true);

  const submittedRef = useRef(false);
  const answersRef = useRef(answers);
  const sessionRef = useRef<Session | null>(null);
  const armedRef = useRef(false);
  const warnTimer = useRef<number | undefined>(undefined);

  answersRef.current = answers;
  sessionRef.current = session;
  armedRef.current = armed;

  /* ------------------------------------------------------------ load session */

  useEffect(() => {
    if (!sessionId) {
      navigate("/", { replace: true });
      return;
    }
    if (!sessionToken.get(sessionId)) {
      setFatal("Sesi ujian tidak ditemukan di perangkat ini. Silakan masuk ulang dari halaman awal.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    studentApi
      .session(sessionId)
      .then(({ session: data }) => {
        if (cancelled) return;
        if (data.submitted) {
          navigate(`/selesai/${data.id}`, { replace: true });
          return;
        }
        setSession(data);
        setAnswers(normalizeAnswers(data.answers));
        setViolations(data.violations || 0);
        setDeadlineMs(Date.now() + data.remainingSeconds * 1000);
        setTimeLeft(data.remainingSeconds);
        const firstType = TABS.find((tab) => (data.counts?.[tab.key] || 0) > 0);
        setActiveTab(firstType?.key || "pg");
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFatal(err instanceof ApiError ? err.message : "Gagal memuat sesi ujian.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, navigate]);

  useEffect(() => {
    const supported =
      typeof document !== "undefined" &&
      (document.fullscreenEnabled || (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled);
    setFullscreenSupported(!!supported);
  }, []);

  /* ---------------------------------------------------------------- submit */

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (!sessionRef.current || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      stopAlarm();
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      try {
        await studentApi.submit(sessionId, answersRef.current);
        navigate(`/selesai/${sessionId}`, { replace: true });
      } catch (err) {
        submittedRef.current = false;
        setSubmitting(false);
        if (err instanceof ApiError && err.status === 409) {
          navigate(`/selesai/${sessionId}`, { replace: true });
          return;
        }
        setWarning({
          title: auto ? "Waktu habis" : "Gagal mengumpulkan",
          body: "Koneksi terputus saat mengumpulkan. Coba tekan Kumpulkan lagi.",
          tone: "warn",
        });
      }
    },
    [navigate, sessionId]
  );

  /* --------------------------------------------------------------- timer */

  useEffect(() => {
    if (!deadlineMs) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0 && !submittedRef.current) void doSubmit(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadlineMs, doSubmit]);

  /* ------------------------------------------------------------ autosave */

  useEffect(() => {
    if (!session || submittedRef.current) return;
    setSaving("saving");
    const timer = window.setTimeout(() => {
      studentApi
        .saveAnswers(sessionId, answers)
        .then(() => setSaving("saved"))
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 409) {
            submittedRef.current = true;
            navigate(`/selesai/${sessionId}`, { replace: true });
            return;
          }
          setSaving("error");
        });
    }, 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  /* -------------------------------------------------------- anti-cheat */

  const reportViolation = useCallback(
    async (type: string, title: string, body: string, detail = "") => {
      if (!sessionRef.current || submittedRef.current || !armedRef.current) return;
      playAlarm("warning");
      wipeClipboard();
      window.clearTimeout(warnTimer.current);
      setWarning({ title, body, tone: "warn" });
      warnTimer.current = window.setTimeout(() => {
        setWarning((current) => (current && current.tone === "warn" ? null : current));
      }, 6000);
      try {
        const result = await studentApi.violation(sessionId, type, detail);
        setViolations(result.violations);
        if (result.locked || result.submitted) {
          submittedRef.current = true;
          stopAlarm();
          playAlarm("lock");
          setLocked(true);
          setWarning({
            title: "Ujian dihentikan otomatis",
            body: `Batas pelanggaran (${result.violations}) terlampaui. Jawabanmu sudah dikumpulkan dan tidak dapat diubah.`,
            tone: "lock",
          });
          window.setTimeout(() => navigate(`/selesai/${sessionId}`, { replace: true }), 4000);
        }
      } catch {
        /* offline: keep the local warning */
      }
    },
    [navigate, sessionId]
  );

  const reportRef = useRef(reportViolation);
  reportRef.current = reportViolation;

  useEffect(() => {
    if (!armed || locked) return;

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        reportRef.current(
          "fullscreen",
          "Mode layar penuh dimatikan",
          "Ujian harus dikerjakan dalam layar penuh. Tekan tombol di bawah untuk kembali."
        );
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        reportRef.current(
          "tab-switch",
          "Berpindah tab atau aplikasi",
          "Kamu meninggalkan layar ujian. Tetap di halaman ini sampai ujian selesai."
        );
      }
    };

    const onCopy = (event: Event) => {
      event.preventDefault();
      reportRef.current("copy", "Menyalin teks dilarang", "Naskah soal tidak boleh disalin, ditempel, atau dipindahkan.");
    };

    const onPrint = () => {
      reportRef.current("print", "Mencetak dilarang", "Naskah soal hanya boleh dibaca di layar ujian.");
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const onSelectStart = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA/.test(target.tagName)) return;
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const lower = key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (key === "PrintScreen") {
        event.preventDefault();
        reportRef.current(
          "screenshot",
          "Percobaan tangkap layar terdeteksi",
          "Mengambil tangkapan layar naskah ujian dianggap pelanggaran. Clipboard sudah dikosongkan."
        );
        return;
      }
      if (key === "F12") {
        event.preventDefault();
        reportRef.current("devtools", "Alat pengembang diblokir", "Panel pengembang browser tidak diizinkan selama ujian.");
        return;
      }
      if (mod && event.shiftKey && ["i", "j", "c", "s"].includes(lower)) {
        event.preventDefault();
        reportRef.current("devtools", "Pintasan developer diblokir", "Pintasan ini dinonaktifkan selama ujian berlangsung.");
        return;
      }
      if (mod && ["c", "x", "v", "a", "p", "s", "u", "f"].includes(lower)) {
        event.preventDefault();
        reportRef.current("copy", "Pintasan salin diblokir", "Menyalin, menempel, dan mencetak dinonaktifkan selama ujian.");
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "PrintScreen") {
        wipeClipboard();
        reportRef.current(
          "screenshot",
          "Percobaan tangkap layar terdeteksi",
          "Mengambil tangkapan layar naskah ujian dianggap pelanggaran."
        );
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onCopy);
    document.addEventListener("selectstart", onSelectStart);
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("beforeprint", onPrint);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onCopy);
      document.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("beforeprint", onPrint);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [armed, locked]);

  /* warn before closing the tab mid-exam */
  useEffect(() => {
    if (!armed || locked) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      event.preventDefault();
      event.returnValue = "Ujian masih berlangsung. Yakin ingin keluar?";
      return event.returnValue;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [armed, locked]);

  /* --------------------------------------------------------- fullscreen */

  const enterFullscreen = useCallback(async () => {
    unlockAudio();
    const element = document.documentElement;
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen({ navigationUI: "hide" });
      } else {
        const legacy = element as unknown as {
          webkitRequestFullscreen?: () => Promise<void> | void;
        };
        await legacy.webkitRequestFullscreen?.();
      }
    } catch {
      /* browsers can refuse; the gate explains it */
    }
    setArmed(true);
    setWarning(null);
    playConfirmedTone();
  }, []);

  /* --------------------------------------------------------- answer edit */

  const onChange = useCallback((type: QuestionType, no: number, value: string | string[]) => {
    setAnswers((current) => {
      if (type === "pgk") {
        return { ...current, pgk: { ...current.pgk, [String(no)]: value as string[] } };
      }
      if (type === "essay") {
        return { ...current, essay: { ...current.essay, [String(no)]: value as string } };
      }
      return { ...current, [type]: { ...current[type], [String(no)]: value as string } } as Answers;
    });
  }, []);

  const onClear = useCallback((type: QuestionType, no: number) => {
    setAnswers((current) => {
      const bucket = { ...current[type] } as Record<string, unknown>;
      delete bucket[String(no)];
      return { ...current, [type]: bucket } as Answers;
    });
  }, []);

  /* ---------------------------------------------------------------- view */

  const counts = session?.counts || { pg: 0, pgk: 0, bs: 0, match: 0, essay: 0 };
  const availableTabs = useMemo(() => TABS.filter((tab) => (counts[tab.key] || 0) > 0), [counts]);
  const answered = totalAnswered(counts, answers);
  const total = totalQuestions(counts);
  const pdfUrl = session ? studentApi.pdfUrl(session.id) : "";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Loader2 className="animate-spin" size={24} />
          <p className="text-sm font-medium">Menyiapkan lembar ujian…</p>
        </div>
      </div>
    );
  }

  if (fatal || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-6">
        <div className="card max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <h1 className="text-lg font-bold">Sesi ujian tidak dapat dibuka</h1>
          <p className="mt-2 text-sm text-muted">{fatal || "Sesi tidak ditemukan."}</p>
          <button type="button" className="btn-primary mt-5" onClick={() => navigate("/", { replace: true })}>
            Kembali ke halaman awal
          </button>
        </div>
      </div>
    );
  }

  const urgent = timeLeft <= 300;
  const critical = timeLeft <= 60;
  const maxViolations = session.maxViolations || 5;

  return (
    <div className="exam-surface fixed inset-0 flex flex-col overflow-hidden bg-[#e9e7de]">
      {/* header */}
      <header className="z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-brand-deep/40 bg-brand-deep px-3 py-2 text-white sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5 sm:justify-self-start">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <ShieldCheck size={16} className="text-sand" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-tight">{session.exam?.title || "Ujian"}</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-white/60">
              {session.studentName} · {session.studentClass}
            </p>
          </div>
        </div>

        <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-self-center">
          <div
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-sm font-bold tabular-nums ring-1 ${
              critical
                ? "bg-danger text-white ring-danger alarm-flash"
                : urgent
                  ? "bg-sand/20 text-sand ring-sand/40"
                  : "bg-white/10 text-white ring-white/15"
            }`}
            aria-label="Sisa waktu"
          >
            <Timer size={14} />
            {fmtClock(timeLeft)}
          </div>

          <div
            className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ring-1 sm:flex ${
              violations > 0 ? "bg-danger/20 text-red-100 ring-danger/40" : "bg-white/10 text-white/80 ring-white/15"
            }`}
            title="Jumlah pelanggaran"
          >
            <AlertTriangle size={13} />
            {violations}/{maxViolations}
          </div>

          <button
            type="button"
            onClick={() => setConfirmSubmit(true)}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold text-brand-deep transition hover:bg-sand hover:text-brand-deep"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Kumpulkan
          </button>
        </div>

        {/* keeps the middle group exactly centred on wide screens */}
        <span className="hidden sm:block" aria-hidden="true" />
      </header>

      {/* mobile view switch */}
      <div className="z-10 flex gap-1 border-b border-line bg-white px-3 py-2 lg:hidden">
        {(
          [
            { key: "soal", label: "Naskah Soal", icon: FileText },
            { key: "jawaban", label: "Lembar Jawaban", icon: CheckCircle2 },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMobileView(item.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
              mobileView === item.key ? "bg-brand text-white" : "bg-paper text-ink-soft"
            }`}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        ))}
      </div>

      {/* body */}
      <main className="grid min-h-0 min-w-0 flex-1 gap-2.5 p-2.5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:p-3">
        <section
          className={`h-full min-h-0 min-w-0 ${mobileView === "soal" ? "block" : "hidden"} lg:block`}
        >
          <PdfViewer url={pdfUrl} />
        </section>

        <section
          className={`h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white ${
            mobileView === "jawaban" ? "flex" : "hidden"
          } lg:flex`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line bg-paper-deep/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand">
              <FileText size={13} /> Lembar Jawaban
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              {saving === "saving" && (
                <>
                  <Cloud size={12} className="animate-pulse" /> menyimpan…
                </>
              )}
              {saving === "saved" && (
                <>
                  <CheckCircle2 size={12} className="text-brand" /> tersimpan
                </>
              )}
              {saving === "error" && (
                <>
                  <CloudOff size={12} className="text-danger" /> offline
                </>
              )}
            </div>
          </div>

          {/* tabs */}
          <div className="flex gap-1 border-b border-line bg-white px-1.5 py-1.5">
            {availableTabs.map((tab) => {
              const done = answeredCount(tab.key, answers);
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  aria-pressed={isActive}
                  title={tab.label}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-bold leading-none transition sm:text-[11px] ${
                    isActive
                      ? "bg-brand text-white shadow-sm"
                      : "bg-paper text-ink-soft hover:bg-brand-soft hover:text-brand"
                  }`}
                >
                  <span className="truncate">{tab.short}</span>
                  <span
                    className={`shrink-0 rounded px-1 py-0.5 text-[8px] tabular-nums sm:text-[9px] ${
                      isActive ? "bg-white/20 text-white" : "bg-white text-muted"
                    }`}
                  >
                    {done}/{counts[tab.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-b border-line bg-white px-3 py-1.5 text-[11px] leading-snug text-muted">
            <span className="font-semibold text-ink-soft">
              {availableTabs.find((tab) => tab.key === activeTab)?.label}
            </span>
            {" · "}
            {activeTab === "pgk"
              ? "Pilih semua jawaban yang benar. Jumlah pilihan tiap nomor sudah dibatasi sesuai kunci."
              : availableTabs.find((tab) => tab.key === activeTab)?.hint}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
            <PanelFor
              type={activeTab}
              counts={counts}
              answers={answers}
              pgOptions={session.pgOptions || 4}
              pgkLimits={session.pgkLimits || {}}
              matchOptions={session.matchOptions || counts.match}
              essayMax={session.essayMax || 10}
              onChange={onChange}
              onClear={onClear}
            />
          </div>

          <div className="border-t border-line bg-paper-deep/40 px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-ink-soft">
              <span>
                Terjawab {answered} dari {total} nomor
              </span>
              <span className="tabular-nums">{total ? Math.round((answered / total) * 100) : 0}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </section>
      </main>

      {/* start gate */}
      {!armed && !locked && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-brand-deep/95 px-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl slide-up">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand">
              <Lock size={12} /> Mode ujian terkunci
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-ink">Mulai dalam layar penuh</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Layar ujian berjalan penuh satu layar. Selama ujian, keluar dari layar penuh, berpindah tab,
              menyalin teks, atau mencoba menangkap layar akan membunyikan alarm dan tercatat sebagai
              pelanggaran.
            </p>
            <ul className="mt-4 space-y-1.5 text-[12px] text-ink-soft">
              <li>• Sisa waktu mulai dihitung sejak kamu menekan tombol di bawah.</li>
              <li>• Batas pelanggaran: {maxViolations} kali, setelah itu ujian berhenti otomatis.</li>
              <li>• Jawaban tersimpan otomatis setiap kali kamu mengubahnya.</li>
            </ul>
            <button type="button" onClick={() => void enterFullscreen()} className="btn-primary mt-5 w-full">
              <ShieldCheck size={16} /> Mulai Ujian
            </button>
            {!fullscreenSupported && (
              <p className="mt-3 rounded-lg bg-sand-soft p-2.5 text-[11px] leading-relaxed text-[#7a5c05]">
                Browser ini tidak mendukung layar penuh (umumnya di iPhone). Ujian tetap bisa dikerjakan,
                namun alarm hanya akan berbunyi saat kamu berpindah tab.
              </p>
            )}
          </div>
        </div>
      )}

      {/* violation warning */}
      {warning && armed && !locked && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-danger/30 bg-white p-3.5 shadow-xl slide-up">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger">
              <AlertTriangle size={17} />
            </span>
            <div>
              <p className="text-sm font-bold text-danger">{warning.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{warning.body}</p>
              {!document.fullscreenElement && (
                <button
                  type="button"
                  onClick={() => void enterFullscreen()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1.5 text-[11px] font-bold text-white"
                >
                  <ShieldCheck size={12} /> Kembali ke layar penuh
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* locked overlay */}
      {locked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-danger/95 px-5">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger">
              <Lock size={22} />
            </span>
            <h2 className="mt-3 text-lg font-extrabold text-ink">Ujian dihentikan</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{warning?.body}</p>
            <button
              type="button"
              onClick={() => navigate(`/selesai/${sessionId}`, { replace: true })}
              className="btn-primary mt-5 w-full"
            >
              Lihat hasil
            </button>
          </div>
        </div>
      )}

      {/* submit confirm */}
      {confirmSubmit && !submittedRef.current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/80 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-base font-extrabold text-ink">Kumpulkan jawaban sekarang?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {total - answered > 0
                ? `Masih ada ${total - answered} nomor yang belum dijawab. `
                : "Semua nomor sudah dijawab. "}
              Setelah dikumpulkan, jawaban tidak dapat diubah lagi.
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirmSubmit(false)} className="btn-ghost flex-1">
                Periksa lagi
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmSubmit(false);
                  void doSubmit(false);
                }}
                className="btn-primary flex-1"
              >
                <LogOut size={15} /> Kumpulkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function playConfirmedTone() {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(780, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    /* ignore */
  }
}
