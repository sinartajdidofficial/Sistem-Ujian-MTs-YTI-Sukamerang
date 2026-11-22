import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  FileWarning,
  GraduationCap,
  KeyRound,
  LayoutList,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { ApiError, adminApi, adminToken } from "../lib/api";
import type { Exam } from "../lib/types";
import ExamForm, { defaultExamForm, type ExamFormValues } from "../components/ExamForm";
import MasterData, { type Catalog } from "../components/MasterData";

const totalQ = (counts: Exam["counts"]) =>
  ["pg", "pgk", "bs", "match", "essay"].reduce(
    (sum, key) => sum + (counts?.[key as keyof typeof counts] || 0),
    0
  );

const statusStyle: Record<Exam["status"], string> = {
  open: "bg-brand text-white",
  draft: "bg-sand-soft text-[#7a5c05]",
  closed: "bg-line text-muted",
};

const statusLabel: Record<Exam["status"], string> = {
  open: "Dibuka",
  draft: "Belum dibuka",
  closed: "Ditutup",
};

const emptyCatalog: Catalog = { classes: [], subjects: [], students: [] };

export default function AdminPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"ujian" | "data">("ujian");
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [examData, catalogData] = await Promise.all([adminApi.exams(), adminApi.catalog()]);
      setExams(examData.exams);
      setCatalog(catalogData);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        adminToken.clear();
        setAuthed(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!adminToken.get()) {
      setAuthed(false);
      return;
    }
    adminApi
      .me()
      .then(() => setAuthed(true))
      .catch(() => {
        adminToken.clear();
        setAuthed(false);
      });
  }, []);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  const login = async () => {
    setLoginBusy(true);
    setLoginError("");
    try {
      const { token } = await adminApi.login(password);
      adminToken.set(token);
      setPassword("");
      setAuthed(true);
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : "Gagal masuk.");
    } finally {
      setLoginBusy(false);
    }
  };

  const createExam = async (values: ExamFormValues) => {
    setCreateBusy(true);
    setCreateError("");
    try {
      const { exam } = await adminApi.createExam({
        ...values,
        subject_id: values.subject_id ? Number(values.subject_id) : null,
        class_id: values.class_id ? Number(values.class_id) : null,
      });
      setCreating(false);
      navigate(`/guru/${exam.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Gagal membuat ujian.");
    } finally {
      setCreateBusy(false);
    }
  };

  const toggleStatus = async (exam: Exam) => {
    const next: Exam["status"] = exam.status === "open" ? "closed" : "open";
    setExams((rows) => rows.map((row) => (row.id === exam.id ? { ...row, status: next } : row)));
    try {
      await adminApi.updateExam(exam.id, { status: next });
    } catch {
      /* keep optimistic state */
    }
  };

  const removeExam = async (exam: Exam) => {
    if (!window.confirm(`Hapus ujian "${exam.title}"? Jawaban siswa pada ujian ini ikut terhapus.`)) return;
    setExams((rows) => rows.filter((row) => row.id !== exam.id));
    try {
      await adminApi.deleteExam(exam.id);
    } catch {
      void load();
    }
  };

  const logout = async () => {
    try {
      await adminApi.logout();
    } catch {
      /* ignore */
    }
    adminToken.clear();
    setAuthed(false);
    setExams([]);
    setCatalog(emptyCatalog);
  };

  const copyLink = async (exam: Exam) => {
    const url = `${window.location.origin}/?kode=${exam.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(exam.code);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      /* ignore */
    }
  };

  if (authed === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(800px 420px at 50% 0%, #eaf3ee 0%, transparent 60%), linear-gradient(180deg,#f8f7f2 0%,#f0eee5 100%)",
          }}
        />
        <div className="w-full max-w-sm">
          <div className="mb-5 flex flex-col items-center gap-2 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-deep text-sand">
              <GraduationCap size={24} />
            </span>
            <div className="leading-tight">
              <p className="text-[13px] font-extrabold text-ink">Panel Guru</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                MTs YTI Sukamerang
              </p>
            </div>
          </div>

          <div className="card p-5 shadow-[0_20px_50px_-28px_rgba(13,31,25,0.4)]">
            <h1 className="text-base font-extrabold tracking-tight text-ink">Masuk sebagai guru</h1>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Kelola ujian, data siswa, dan nilai asesmen.
            </p>

            <label htmlFor="admin-pass" className="mt-4 mb-1.5 block text-[12px] font-bold text-ink-soft">
              Kata sandi guru
            </label>
            <div className="relative">
              <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                id="admin-pass"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void login();
                }}
                placeholder="••••••••"
                className="field pl-9"
                autoComplete="current-password"
              />
            </div>

            {loginError && (
              <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-semibold text-danger">
                {loginError}
              </p>
            )}

            <button
              type="button"
              onClick={() => void login()}
              disabled={loginBusy || password.length === 0}
              className="btn-primary mt-4 w-full py-2.5"
            >
              {loginBusy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              Masuk
            </button>

            <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-[11px] leading-relaxed text-muted">
              Kata sandi bawaan: <span className="font-mono font-bold text-ink">MTsYTI2026</span>. Segera ganti
              setelah masuk pertama kali.
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link
              to="/"
              className="text-[11.5px] font-semibold text-muted underline-offset-2 hover:text-brand hover:underline"
            >
              ← Kembali ke halaman peserta
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const openCount = exams.filter((exam) => exam.status === "open").length;
  const sessionCount = exams.reduce((sum, exam) => sum + (exam.session_count || 0), 0);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-2.5 lg:max-w-5xl">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-deep text-sand">
            <GraduationCap size={16} />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12.5px] font-extrabold text-ink">Panel Guru</p>
            <p className="truncate text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted">
              MTs YTI Sukamerang
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowPassword(true)}
              aria-label="Ubah kata sandi"
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft transition hover:bg-paper active:bg-line"
            >
              <Settings2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Keluar"
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft transition hover:bg-danger-soft hover:text-danger"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <div className="mx-auto flex max-w-3xl gap-1 px-4 pb-2 lg:max-w-5xl">
          {(
            [
              { key: "ujian", label: "Ujian", icon: LayoutList },
              { key: "data", label: "Data Induk", icon: Database },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition sm:flex-none sm:px-5 ${
                tab === item.key ? "bg-brand text-white" : "bg-paper text-ink-soft hover:bg-brand-soft hover:text-brand"
              }`}
            >
              <item.icon size={14} /> {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4 lg:max-w-5xl">
        {tab === "data" ? (
          <MasterData catalog={catalog} onReload={load} />
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-[22px] font-semibold leading-tight tracking-tight text-ink">Daftar Ujian</h1>
                <p className="text-[11px] text-muted">Unggah naskah, isi kunci, lalu buka ujian.</p>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                aria-label="Muat ulang"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-white text-ink-soft transition hover:bg-paper active:bg-line"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="btn-primary hidden h-10 shrink-0 sm:inline-flex"
              >
                <Plus size={16} /> Ujian baru
              </button>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2">
              <MiniStat icon={ClipboardList} label="Ujian" value={String(exams.length)} />
              <MiniStat icon={ShieldCheck} label="Dibuka" value={String(openCount)} tone="brand" />
              <MiniStat icon={Users} label="Peserta" value={String(sessionCount)} />
            </div>

            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-primary mb-3 w-full py-2.5 sm:hidden"
            >
              <Plus size={16} /> Buat ujian baru
            </button>

            {loading && exams.length === 0 ? (
              <div className="flex justify-center py-16 text-muted">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : exams.length === 0 ? (
              <div className="card p-8 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
                  <ClipboardList size={22} />
                </span>
                <h2 className="mt-3 text-[15px] font-extrabold text-ink">Belum ada ujian</h2>
                <p className="mx-auto mt-1 max-w-xs text-[12px] leading-relaxed text-muted">
                  Buat ujian pertama, unggah naskah PDF, lalu bagikan token kepada peserta.
                </p>
                <button type="button" onClick={() => setCreating(true)} className="btn-primary mt-4 w-full sm:w-auto">
                  <Plus size={15} /> Buat ujian pertama
                </button>
              </div>
            ) : (
              <div className="grid gap-2.5 lg:grid-cols-2">
                {exams.map((exam) => (
                  <article key={exam.id} className="card p-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void copyLink(exam)}
                        title="Salin tautan peserta"
                        className="inline-flex items-center gap-1 rounded-md bg-brand-deep px-2 py-1 font-mono text-[10.5px] font-bold tracking-[0.18em] text-sand transition active:opacity-70"
                      >
                        {copied === exam.code ? <CheckCircle2 size={10} /> : null}
                        {exam.code}
                      </button>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide ${statusStyle[exam.status]}`}
                      >
                        {statusLabel[exam.status]}
                      </span>
                      {!exam.pdf_name && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 text-[9.5px] font-bold text-danger">
                          <FileWarning size={10} /> PDF belum ada
                        </span>
                      )}
                    </div>

                    <Link
                      to={`/guru/${exam.id}`}
                      className="mt-2 block text-[14px] font-extrabold leading-snug text-ink hover:text-brand"
                    >
                      {exam.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] font-medium text-muted">
                      {[exam.subject, exam.kelas].filter(Boolean).join(" · ") || "Tanpa mapel"}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-ink-soft">
                      <span>{exam.duration_minutes} menit</span>
                      <span>{totalQ(exam.counts)} soal</span>
                      <span>{exam.session_count ?? 0} peserta</span>
                      {exam.submitted_count ? <span>{exam.submitted_count} selesai</span> : null}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => void toggleStatus(exam)}
                        className={`rounded-lg px-2 py-2 text-[11.5px] font-bold transition ${
                          exam.status === "open"
                            ? "bg-line text-ink-soft active:bg-danger-soft active:text-danger"
                            : "bg-brand-soft text-brand active:bg-brand active:text-white"
                        }`}
                      >
                        {exam.status === "open" ? "Tutup" : "Buka"}
                      </button>
                      <Link
                        to={`/guru/${exam.id}`}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-white px-2 py-2 text-[11.5px] font-bold text-ink-soft transition active:bg-paper"
                      >
                        Kelola <ExternalLink size={11} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void removeExam(exam)}
                        aria-label={`Hapus ujian ${exam.title}`}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-white px-2 py-2 text-[11.5px] font-bold text-muted transition active:bg-danger-soft active:text-danger"
                      >
                        <Trash2 size={12} /> Hapus
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {creating && (
        <Modal title="Buat ujian baru" onClose={() => setCreating(false)} wide>
          {createError && (
            <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-semibold text-danger">
              {createError}
            </p>
          )}
          <ExamForm
            initial={defaultExamForm()}
            classes={catalog.classes}
            subjects={catalog.subjects}
            submitLabel="Buat ujian"
            busy={createBusy}
            onSubmit={(values) => void createExam(values)}
          />
        </Modal>
      )}

      {showPassword && <PasswordModal onClose={() => setShowPassword(false)} />}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  value: string;
  tone?: "default" | "brand";
}) {
  return (
    <div className="card flex flex-col items-start gap-1 p-2.5 sm:flex-row sm:items-center sm:gap-2.5 sm:p-3">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md sm:h-9 sm:w-9 ${
          tone === "brand" ? "bg-brand text-white" : "bg-brand-soft text-brand"
        }`}
      >
        <Icon size={13} />
      </span>
      <div className="min-w-0">
        <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted">{label}</p>
        <p className="text-[15px] font-extrabold leading-tight tabular-nums text-ink">{value}</p>
      </div>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-deep/70 px-3 py-6 backdrop-blur-sm sm:px-4 sm:py-8">
      <div className={`w-full rounded-2xl bg-white shadow-2xl slide-up ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="sticky top-0 flex items-center justify-between rounded-t-2xl border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
          <h2 className="text-[13px] font-extrabold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-paper"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await adminApi.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengubah kata sandi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Ubah kata sandi guru" onClose={onClose}>
      {done ? (
        <div className="text-center">
          <p className="text-sm font-semibold text-brand">Kata sandi berhasil diubah.</p>
          <p className="mt-1 text-[12px] text-muted">Semua perangkat lain perlu masuk ulang.</p>
          <button
            type="button"
            className="btn-primary mt-4 w-full"
            onClick={() => {
              onClose();
              adminToken.clear();
              window.location.reload();
            }}
          >
            Masuk ulang
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor="cur" className="mb-1.5 block text-[12px] font-bold text-ink-soft">
              Kata sandi lama
            </label>
            <input
              id="cur"
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="new" className="mb-1.5 block text-[12px] font-bold text-ink-soft">
              Kata sandi baru (min. 6 karakter)
            </label>
            <input
              id="new"
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              className="field"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-semibold text-danger">{error}</p>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || next.length < 6 || !current}
            className="btn-primary w-full"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Simpan
          </button>
        </div>
      )}
    </Modal>
  );
}
