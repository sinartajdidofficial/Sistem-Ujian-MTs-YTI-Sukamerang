import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Bell,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock,
  GraduationCap,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ApiError, adminApi, adminToken } from "../lib/api";
import { playNotify, unlockAudio } from "../lib/alarm";
import type { Exam, MonitorEvent, MonitorSession, MonitorSnapshot } from "../lib/types";

/* ------------------------------------------------------------------------------------------------
   Papan pantau ujian untuk pengawas.
   1) Pengawas memilih ujian (kelas/rombel) yang ingin dipantau.
   2) Papan menampilkan peserta yang sedang mengerjakan + aliran pelanggaran.
   3) Setiap pelanggaran baru langsung masuk sebagai notifikasi di layar pengawas
      (dan notifikasi browser bila diizinkan).
------------------------------------------------------------------------------------------------ */

const POLL_MS = 5000;
const STALE_MS = 90_000;

const EVENT_LABELS: Record<string, string> = {
  fullscreen: "Keluar dari layar penuh",
  "tab-switch": "Berpindah tab / aplikasi",
  copy: "Mencoba menyalin naskah",
  print: "Mencoba mencetak",
  devtools: "Membuka alat pengembang",
  screenshot: "Percobaan tangkapan layar",
  lock: "Ujian dikunci otomatis",
  start: "Mulai mengerjakan",
  submit: "Mengumpulkan jawaban",
};

/** kejadian yang harus langsung diberitahukan ke pengawas */
const ALERT_TYPES = new Set(["fullscreen", "tab-switch", "copy", "print", "devtools", "screenshot", "lock"]);

const label = (type: string) => EVENT_LABELS[type] || type;

const jam = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
};

const sisaWaktu = (deadline: string, submitted: boolean) => {
  if (submitted) return "—";
  const sisa = Math.max(0, new Date(deadline).getTime() - Date.now());
  if (sisa === 0) return "habis";
  const menit = Math.floor(sisa / 60000);
  const detik = Math.floor((sisa % 60000) / 1000);
  return `${menit}:${String(detik).padStart(2, "0")}`;
};

const statusSesi = (row: MonitorSession) => {
  if (row.submittedAt) {
    return row.autoSubmitted
      ? { text: "Dikunci", tone: "danger" as const }
      : { text: "Selesai", tone: "done" as const };
  }
  if (new Date(row.deadline).getTime() <= Date.now()) return { text: "Waktu habis", tone: "muted" as const };
  const lastSeen = row.lastSeen ? new Date(row.lastSeen).getTime() : 0;
  if (Date.now() - lastSeen > STALE_MS) return { text: "Tidak aktif", tone: "muted" as const };
  return { text: "Mengerjakan", tone: "live" as const };
};

type Toast = { id: number; title: string; body: string };

export default function MonitorPage() {
  const [params, setParams] = useSearchParams();
  const examId = Number(params.get("ujian") || 0);
  const authed = !!adminToken.get();

  if (!authed) return <Navigate to="/guru" replace />;

  const keluar = (
    <Link
      to="/guru"
      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted hover:text-brand"
    >
      <ArrowLeft size={13} /> Kembali ke panel guru
    </Link>
  );

  return (
    <div className="min-h-dvh bg-paper pb-16">
      {examId ? (
        <Papan key={examId} examId={examId} onGanti={() => setParams({}, { replace: true })} />
      ) : (
        <Pemilihan onPilih={(id) => setParams({ ujian: String(id) })} />
      )}
      <div className="mx-auto max-w-3xl px-4 pt-4 lg:max-w-5xl">{keluar}</div>
    </div>
  );
}

/* ------------------------------------------------------------- pilih ujian */

function Pemilihan({ onPilih }: { onPilih: (examId: number) => void }) {
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    adminApi
      .exams()
      .then(({ exams: rows }) => {
        if (!cancelled) setExams(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Gagal memuat daftar ujian.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Hanya ujian yang masih berlangsung yang ditawarkan. Ujian yang sudah selesai
   * (ditutup guru) atau belum dibuka tidak muncul di daftar.
   */
  const urut = useMemo(() => {
    if (!exams) return [];
    return exams
      .filter((exam) => exam.status === "open")
      .sort((a, b) => (b.session_count || 0) - (a.session_count || 0) || a.title.localeCompare(b.title, "id"));
  }, [exams]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-8 lg:max-w-5xl">
      <h1 className="text-center font-display text-[27px] font-bold uppercase leading-tight tracking-[0.1em] text-ink sm:text-[40px] sm:tracking-[0.14em]">
        Pantau Ujian
      </h1>

      {error && (
        <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-semibold text-danger">{error}</p>
      )}

      {exams === null && !error ? (
        <div className="flex justify-center py-16 text-muted">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : urut.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
            <GraduationCap size={22} />
          </span>
          <h2 className="mt-3 text-[15px] font-extrabold text-ink">Belum ada ujian yang berlangsung</h2>
          <p className="mx-auto mt-1 max-w-xs text-[12px] leading-relaxed text-muted">
            Ujian yang sudah selesai atau belum dibuka tidak ditampilkan di sini. Buka ujiannya dulu di panel
            guru.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {urut.map((exam) => {
            const aktif = Math.max(0, (exam.session_count || 0) - (exam.submitted_count || 0));
            return (
              <button
                key={exam.id}
                type="button"
                onClick={() => onPilih(exam.id)}
                className="card flex w-full items-center gap-3 p-3.5 text-left transition hover:border-brand/40 hover:bg-brand-soft/30 active:bg-brand-soft/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-brand-deep px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.16em] text-sand">
                      {exam.code}
                    </span>
                    <StatusBadge status={exam.status} />
                  </div>
                  <p className="mt-1.5 truncate text-[14px] font-extrabold leading-snug text-ink">{exam.title}</p>
                  <p className="text-[11px] font-medium text-muted">
                    {[exam.subject, exam.kelas].filter(Boolean).join(" · ") || "Tanpa mapel"}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-ink-soft">
                    <span className="inline-flex items-center gap-1">
                      <Users size={11} /> {exam.session_count ?? 0} peserta
                    </span>
                    <span className="inline-flex items-center gap-1 text-brand">
                      <Activity size={11} /> {aktif} sedang mengerjakan
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted">
                      <Clock size={11} /> {exam.duration_minutes} menit
                    </span>
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- papan */

function Papan({ examId, onGanti }: { examId: number; onGanti: () => void }) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [error, setError] = useState("");
  const [memuat, setMemuat] = useState(false);
  const [suara, setSuara] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [izin, setIzin] = useState<string>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  const seenMax = useRef<number | null>(null);
  const suaraRef = useRef(suara);
  suaraRef.current = suara;
  const toastSeq = useRef(0);
  const toastTimer = useRef<number[]>([]);

  const buangToast = useCallback((id: number) => {
    setToasts((rows) => rows.filter((row) => row.id !== id));
  }, []);

  const tambahToast = useCallback(
    (items: { title: string; body: string }[]) => {
      const rows = items.map((item) => {
        toastSeq.current += 1;
        return { id: toastSeq.current, ...item };
      });
      setToasts((current) => [...rows, ...current].slice(0, 4));
      rows.forEach((row) => {
        const timer = window.setTimeout(() => buangToast(row.id), 10000);
        toastTimer.current.push(timer);
      });
    },
    [buangToast]
  );

  useEffect(() => {
    const timers = toastTimer.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const kirimNotifikasiBrowser = useCallback((events: MonitorEvent[]) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const first = events[0];
    if (!first) return;
    try {
      new Notification(`Pelanggaran: ${label(first.type)}`, {
        body: `${first.studentName} · ${first.studentClass}`,
        tag: `pelanggaran-${first.id}`,
      });
    } catch {
      /* browser menolak — notifikasi di layar tetap tampil */
    }
  }, []);

  const periksaKejadian = useCallback(
    (events: MonitorEvent[]) => {
      const tertinggi = events.reduce((max, event) => Math.max(max, event.id), 0);
      if (seenMax.current === null) {
        // muatan pertama: jadikan patokan, jangan bunyi untuk kejadian lama
        seenMax.current = tertinggi;
        return;
      }
      const batas = seenMax.current;
      const baru = events.filter((event) => event.id > batas && ALERT_TYPES.has(event.type));
      seenMax.current = Math.max(batas, tertinggi);
      if (!baru.length) return;

      tambahToast(
        baru.slice(0, 3).map((event) => ({
          title: `Pelanggaran: ${label(event.type)}`,
          body: `${event.studentName} · ${event.studentClass} · ${jam(event.at)}`,
        }))
      );
      if (suaraRef.current) playNotify();
      kirimNotifikasiBrowser(baru);
    },
    [kirimNotifikasiBrowser, tambahToast]
  );

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const data = await adminApi.monitor(examId);
      setSnapshot(data);
      setError("");
      periksaKejadian(data.events || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui papan pantau.");
    } finally {
      setMemuat(false);
    }
  }, [examId, periksaKejadian]);

  useEffect(() => {
    void muat();
  }, [muat]);

  useEffect(() => {
    const timer = window.setInterval(() => void muat(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [muat]);

  // bunyi butuh satu interaksi dulu di banyak browser
  useEffect(() => {
    const once = () => unlockAudio();
    window.addEventListener("pointerdown", once, { once: true });
    return () => window.removeEventListener("pointerdown", once);
  }, []);

  const mintaIzin = async () => {
    unlockAudio();
    if (!("Notification" in window)) return;
    try {
      const hasil = await Notification.requestPermission();
      setIzin(hasil);
      if (hasil === "granted") {
        new Notification("Notifikasi pengawas aktif", {
          body: "Pelanggaran peserta akan muncul di sini.",
        });
      }
    } catch {
      setIzin("denied");
    }
  };

  const exam = snapshot?.exam;
  const sesi = snapshot?.sessions || [];
  const kejadian = snapshot?.events || [];

  const totalSoal = exam
    ? ["pg", "pgk", "bs", "match", "essay"].reduce(
        (sum, key) => sum + ((exam.counts as Record<string, number>)?.[key] || 0),
        0
      )
    : 0;

  const berjalan = sesi.filter((row) => !row.submittedAt);
  const selesai = sesi.filter((row) => row.submittedAt);
  const pelanggaran = sesi.reduce((sum, row) => sum + (row.violations || 0), 0);
  const rawan = [...sesi].sort(
    (a, b) => b.violations - a.violations || a.studentName.localeCompare(b.studentName, "id")
  );

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-2.5 lg:max-w-5xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGanti}
              aria-label="Pilih ujian lain"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-white text-ink-soft transition hover:bg-paper"
            >
              <ArrowLeft size={15} />
            </button>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-extrabold text-ink">{exam?.title || "Papan pantau"}</p>
              <p className="truncate text-[10.5px] font-medium text-muted">
                {exam
                  ? `${[exam.subject, exam.kelas].filter(Boolean).join(" · ") || "Tanpa mapel"} · kode ${exam.code}`
                  : "Memuat ujian…"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  setSuara((value) => !value);
                }}
                aria-pressed={suara}
                aria-label={suara ? "Matikan suara notifikasi" : "Nyalakan suara notifikasi"}
                className={`grid h-9 w-9 place-items-center rounded-lg transition ${
                  suara ? "bg-brand-soft text-brand" : "text-muted hover:bg-paper"
                }`}
              >
                {suara ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
              <button
                type="button"
                onClick={() => void mintaIzin()}
                aria-label="Aktifkan notifikasi browser"
                className={`grid h-9 w-9 place-items-center rounded-lg transition ${
                  izin === "granted" ? "bg-brand-soft text-brand" : "text-muted hover:bg-paper"
                }`}
              >
                {izin === "granted" ? <BellRing size={15} /> : <Bell size={15} />}
              </button>
              <button
                type="button"
                onClick={() => void muat()}
                aria-label="Muat ulang sekarang"
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft transition hover:bg-paper"
              >
                <RefreshCw size={15} className={memuat ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-3xl px-4 pt-3 lg:max-w-5xl">
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-semibold text-danger">{error}</p>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-4 pt-3 lg:max-w-5xl">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Ringkas icon={Users} label="Peserta" value={String(sesi.length)} />
          <Ringkas icon={Activity} label="Mengerjakan" value={String(berjalan.length)} tone="brand" />
          <Ringkas icon={ShieldAlert} label="Pelanggaran" value={String(pelanggaran)} tone={pelanggaran ? "danger" : "default"} />
          <Ringkas icon={CheckCircle2} label="Selesai" value={String(selesai.length)} />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_1fr]">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand">Peserta ujian</p>
              <span className="text-[10.5px] font-semibold text-muted">{totalSoal} soal</span>
            </div>

            {sesi.length === 0 ? (
              <p className="px-4 py-10 text-center text-[12px] leading-relaxed text-muted">
                Belum ada peserta yang masuk. Bagikan kode <span className="font-mono font-bold">{exam?.code}</span>{" "}
                dan pastikan ujian sudah dibuka.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {rawan.map((row) => {
                  const status = statusSesi(row);
                  const persen = totalSoal ? Math.min(100, Math.round((row.answered / totalSoal) * 100)) : 0;
                  return (
                    <li key={row.id} className="px-3.5 py-2.5">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-extrabold text-ink">{row.studentName}</p>
                          <p className="text-[10.5px] font-medium text-muted">
                            {row.studentClass} · mulai {jam(row.startedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {row.violations > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-danger-soft px-1.5 py-0.5 text-[10px] font-extrabold text-danger">
                              <ShieldAlert size={9} /> {row.violations}
                            </span>
                          )}
                          <span className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide ${toneClass(status.tone)}`}>
                            {status.text}
                          </span>
                        </div>
                      </div>

                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
                          <div
                            className="h-full rounded-full bg-brand transition-[width] duration-500"
                            style={{ width: `${persen}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[10px] font-bold tabular-nums text-ink-soft">
                          {row.answered}/{totalSoal}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums text-muted">
                          <Clock size={9} /> {sisaWaktu(row.deadline, !!row.submittedAt)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand">Pelanggaran & kejadian</p>
              <span className="text-[10.5px] font-semibold text-muted">terbaru</span>
            </div>

            {kejadian.length === 0 ? (
              <p className="px-4 py-10 text-center text-[12px] leading-relaxed text-muted">
                Belum ada kejadian. Notifikasi akan muncul di sini begitu ada peserta yang melanggar.
              </p>
            ) : (
              <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
                {kejadian.map((event) => {
                  const penting = ALERT_TYPES.has(event.type);
                  return (
                    <li key={event.id} className="flex items-start gap-2 px-3.5 py-2">
                      <span
                        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                          event.type === "lock" ? "bg-danger" : penting ? "bg-[#d97706]" : "bg-brand"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-[11.5px] font-bold ${penting ? "text-ink" : "text-ink-soft"}`}>
                          {label(event.type)}
                        </p>
                        <p className="truncate text-[10.5px] text-muted">
                          {event.studentName}
                          {event.studentClass ? ` · ${event.studentClass}` : ""}
                          {event.detail ? ` · ${event.detail}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted">{jam(event.at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
          Pelanggaran baru langsung muncul sebagai notifikasi di layar ini, disertai bunyi dan notifikasi browser
          bila diizinkan. Halaman boleh dibiarkan terbuka di ruang pengawas.
        </p>
      </main>

      {/* notifikasi di layar pengawas — muncul di tengah layar */}
      <p aria-live="assertive" className="sr-only">
        {toasts[0] ? `${toasts[0].title}. ${toasts[0].body}` : ""}
      </p>
      {toasts.length > 0 && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-brand-deep/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => setToasts([])}
        >
          <div className="w-full max-w-sm space-y-2" onClick={(event) => event.stopPropagation()}>
            {toasts.slice(0, 3).map((toast) => (
              <div
                key={toast.id}
                role="status"
                className="rounded-2xl border border-danger/25 bg-white p-4 shadow-2xl slide-up"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
                    <ShieldAlert size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-extrabold leading-snug text-ink">{toast.title}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{toast.body}</p>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setToasts([])}
              className="mx-auto block rounded-xl bg-white/95 px-4 py-2 text-[12px] font-bold text-ink shadow-sm transition hover:bg-white"
            >
              Tutup notifikasi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ kecil */

function toneClass(tone: "live" | "done" | "danger" | "muted") {
  if (tone === "live") return "bg-brand-soft text-brand";
  if (tone === "done") return "bg-line text-ink-soft";
  if (tone === "danger") return "bg-danger-soft text-danger";
  return "bg-paper text-muted";
}

function Ringkas({
  icon: Icon,
  label: text,
  value,
  tone = "default",
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone?: "default" | "brand" | "danger";
}) {
  const warna =
    tone === "brand" ? "bg-brand text-white" : tone === "danger" ? "bg-danger text-white" : "bg-brand-soft text-brand";
  return (
    <div className="card flex items-center gap-2 p-2.5">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${warna}`}>
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[9.5px] font-bold uppercase tracking-wide text-muted">{text}</p>
        <p className="text-[15px] font-extrabold leading-tight tabular-nums text-ink">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Exam["status"] }) {
  const map = {
    open: { text: "Dibuka", className: "bg-brand text-white" },
    draft: { text: "Belum dibuka", className: "bg-sand-soft text-[#7a5c05]" },
    closed: { text: "Ditutup", className: "bg-line text-muted" },
  } as const;
  const item = map[status];
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide ${item.className}`}>
      {item.text}
    </span>
  );
}
