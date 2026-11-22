import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  KeyRound,
  Loader2,
  PenLine,
  Plus,
  Radar,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { ApiError, adminApi, formatSize } from "../lib/api";
import type { AnswerKey, ClassRow, Counts, Exam, QuestionType, SubjectRow } from "../lib/types";
import ExamForm, { type ExamFormValues } from "../components/ExamForm";
import { useConfirm } from "../components/ConfirmDialog";
import { Modal } from "./AdminPage";

const LETTERS = ["A", "B", "C", "D", "E"];
const MATCH_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type TabKey = "pdf" | "key" | "hasil" | "setting";

type SessionRow = Awaited<ReturnType<typeof adminApi.sessions>>["sessions"][number];

export default function AdminExamPage() {
  const { examId = "" } = useParams();
  const navigate = useNavigate();
  const id = Number(examId);

  const [exam, setExam] = useState<Exam | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [tab, setTab] = useState<TabKey>("pdf");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadExam = useCallback(async () => {
    try {
      const { exam: data } = await adminApi.exam(id);
      setExam(data);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/guru", { replace: true });
        return;
      }
      setError(err instanceof ApiError ? err.message : "Gagal memuat ujian.");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    void loadExam();
    adminApi
      .catalog()
      .then((data) => {
        setClasses(data.classes);
        setSubjects(data.subjects);
      })
      .catch(() => undefined);
  }, [loadExam]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center">
        <p className="text-sm font-semibold text-danger">{error || "Ujian tidak ditemukan."}</p>
        <Link to="/guru" className="btn-ghost mt-4">
          <ArrowLeft size={14} /> Kembali
        </Link>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/?kode=${exam.code}`;

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-5 py-3">
          <Link to="/guru" className="btn-ghost px-2 py-1.5 text-[12px]">
            <ArrowLeft size={14} /> Daftar
          </Link>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold text-ink">{exam.title}</p>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
              {[exam.subject, exam.kelas].filter(Boolean).join(" · ") || "Tanpa mapel"} · {exam.code}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/guru/pantau"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1.5 text-[11.5px] font-bold text-brand transition hover:bg-brand hover:text-white"
            >
              <Radar size={13} /> <span className="hidden sm:inline">Pantau</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(shareUrl);
              }}
              className="btn-ghost hidden text-[11.5px] sm:inline-flex"
              title={shareUrl}
            >
              <Copy size={13} /> <span className="hidden sm:inline">Salin tautan peserta</span>
            </button>
            <span
              className={`rounded-md px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                exam.status === "open" ? "bg-brand text-white" : "bg-line text-muted"
              }`}
            >
              {exam.status === "open" ? "Dibuka" : exam.status === "draft" ? "Belum dibuka" : "Ditutup"}
            </span>
          </div>
        </div>
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2 sm:px-4">
          {(
            [
              { key: "pdf", label: "Naskah PDF", short: "PDF", icon: FileText },
              { key: "key", label: "Kunci Jawaban", short: "Kunci", icon: KeyRound },
              { key: "hasil", label: "Hasil & Nilai", short: "Nilai", icon: Users },
              { key: "setting", label: "Pengaturan", short: "Setelan", icon: ClipboardCheck },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              title={item.label}
              aria-pressed={tab === item.key}
              className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[11px] font-bold transition sm:flex-none sm:px-3 sm:text-[11.5px] ${
                tab === item.key ? "bg-brand text-white" : "text-ink-soft hover:bg-brand-soft hover:text-brand"
              }`}
            >
              <item.icon size={13} className="shrink-0" />
              <span className="truncate sm:hidden">{item.short}</span>
              <span className="hidden truncate sm:inline">{item.label}</span>
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        {tab === "pdf" && <PdfTab exam={exam} onChange={loadExam} />}
        {tab === "key" && <KeyTab exam={exam} onChange={loadExam} />}
        {tab === "hasil" && <HasilTab exam={exam} />}
        {tab === "setting" && <SettingTab exam={exam} classes={classes} subjects={subjects} onChange={loadExam} />}
      </main>
    </div>
  );
}

/* --------------------------------------------------------------- PDF tab */

function PdfTab({ exam, onChange }: { exam: Exam; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);

  const upload = async (file: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("File harus berformat PDF.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await adminApi.uploadPdf(exam.id, file);
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah PDF.");
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    try {
      const response = await fetch(`/api/admin/exams/${exam.id}/pdf`, {
        headers: { "x-admin-token": localStorage.getItem("mts-yti-admin-token") || "" },
      });
      if (!response.ok) throw new Error("gagal");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("Pratinjau gagal dibuka. Coba unggah ulang PDF.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-ink">Naskah soal</h2>
            <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted">
              Unggah satu file PDF yang memuat seluruh soal. Peserta membaca soal dari PDF ini dan hanya bisa
              memperbesar atau memperkecil tampilan — teksnya tidak dapat disalin.
            </p>
          </div>
          {exam.pdf_name && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-brand">
              <CheckCircle2 size={12} /> Siap
            </span>
          )}
        </div>

        {exam.pdf_name ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/60 p-3.5">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-danger ring-1 ring-line">
              <FileText size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-ink">{exam.pdf_name}</p>
              <p className="text-[11px] text-muted">
                {formatSize(exam.pdf_size)} · diperbarui{" "}
                {exam.pdf_updated_at
                  ? new Date(exam.pdf_updated_at).toLocaleString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>
            <button type="button" onClick={() => void preview()} className="btn-ghost text-[11.5px]">
              Pratinjau
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2.5 text-[11.5px] font-semibold text-danger">
            Belum ada naskah. Peserta tidak dapat memulai ujian sebelum PDF diunggah.
          </p>
        )}

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDrag(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
            drag ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-brand/40 hover:bg-brand-soft/40"
          }`}
        >
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          {busy ? (
            <>
              <Loader2 className="animate-spin text-brand" size={20} />
              <p className="text-[12px] font-semibold text-ink-soft">Mengunggah…</p>
            </>
          ) : (
            <>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-brand">
                <Upload size={18} />
              </span>
              <p className="text-[12.5px] font-bold text-ink">
                {exam.pdf_name ? "Ganti naskah PDF" : "Pilih atau tarik file PDF ke sini"}
              </p>
              <p className="text-[11px] text-muted">Maksimal 40 MB</p>
            </>
          )}
        </label>

        {error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-semibold text-danger">{error}</p>
        )}
      </div>

      <div className="card p-5">
        <h3 className="text-[12px] font-extrabold text-ink">Tips menyiapkan PDF</h3>
        <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-muted">
          <li>• Susun soal berurutan: pilihan ganda, PG kompleks, benar/salah, menjodohkan, lalu uraian.</li>
          <li>• Beri nomor soal yang jelas pada PDF agar peserta mudah mencocokkan dengan lembar jawaban.</li>
          <li>• Untuk menjodohkan, tuliskan daftar huruf pilihan (A, B, C, …) pada PDF.</li>
          <li>• Ukuran file kecil membuat PDF lebih cepat dibuka di ponsel peserta.</li>
        </ul>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- key tab */

function KeyTab({ exam, onChange }: { exam: Exam; onChange: () => Promise<void> }) {
  const [key, setKey] = useState<AnswerKey>(() => normalizeKey(exam));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setKey(normalizeKey(exam));
  }, [exam]);

  const counts = exam.counts;
  const sections = (["pg", "pgk", "bs", "match"] as QuestionType[]).filter(
    (type) => (counts[type as keyof Counts] || 0) > 0
  );

  const filledCount = sections.reduce((sum, type) => {
    const list = (key[type] as (string | string[] | null)[]) || [];
    return (
      sum +
      list.filter((item) => (Array.isArray(item) ? item.length > 0 : !!item)).length
    );
  }, 0);
  const totalCount = sections.reduce((sum, type) => sum + counts[type as keyof Counts], 0);

  const setSingle = (type: QuestionType, index: number, letter: string) => {
    setKey((current) => {
      const list = [...((current[type] as (string | null)[]) || [])];
      list[index] = list[index] === letter ? null : letter;
      return { ...current, [type]: list };
    });
    setSaved(false);
  };

  const toggleMulti = (index: number, letter: string) => {
    setKey((current) => {
      const list = [...(current.pgk || [])];
      const existing = list[index] || [];
      list[index] = existing.includes(letter)
        ? existing.filter((item) => item !== letter)
        : [...existing, letter].sort();
      return { ...current, pgk: list };
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await adminApi.updateExam(exam.id, { answer_key: key });
      setSaved(true);
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan kunci.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-ink">Kunci jawaban</h2>
            <p className="mt-0.5 text-[12px] text-muted">
              Isi kunci untuk penilaian otomatis. Nomor tanpa kunci tidak dihitung.
            </p>
            {exam.counts.pgk > 0 && (
              <p className="mt-1.5 text-[11.5px] text-ink-soft">
                PG kompleks:{" "}
                <span className="font-bold">
                  {exam.pgk_max > 0 ? `peserta maksimal memilih ${exam.pgk_max} jawaban` : "pilihan bebas"}
                </span>
                {exam.pgk_max > 0 ? " — pastikan kunci per nomor tidak lebih dari itu." : "."}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-paper px-2.5 py-1 text-[11px] font-bold text-ink-soft ring-1 ring-line">
              {filledCount}/{totalCount} terisi
            </span>
            <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary text-[12px]">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan kunci
            </button>
          </div>
        </div>
        {saved && (
          <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-[11.5px] font-semibold text-brand">
            Kunci jawaban tersimpan.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-semibold text-danger">{error}</p>
        )}
      </div>

      {sections.length === 0 && (
        <div className="card p-6 text-center text-[12.5px] text-muted">
          Ujian ini hanya berisi soal uraian. Penilaian dilakukan manual di tab Hasil.
        </div>
      )}

      {sections.map((type) => {
        const count = counts[type as keyof Counts];
        const letters =
          type === "match"
            ? MATCH_LETTERS.slice(0, Math.max(2, exam.match_options))
            : type === "bs"
              ? ["B", "S"]
              : LETTERS.slice(0, exam.pg_options || 4);
        return (
          <div key={type} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-paper-deep/60 px-4 py-2">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand">{sectionTitle(type)}</p>
              <span className="text-[10.5px] font-semibold text-muted">{count} nomor</span>
            </div>
            <div className="grid gap-1.5 p-3 sm:grid-cols-2">
              {Array.from({ length: count }, (_, index) => {
                const current = (key[type] as (string | string[] | null)[])?.[index];
                return (
                  <div
                    key={index}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                      current && (Array.isArray(current) ? current.length : true)
                        ? "border-brand/30 bg-brand-soft/40"
                        : "border-line bg-white"
                    }`}
                  >
                    <span className="w-5 shrink-0 text-center text-[11px] font-extrabold text-muted">{index + 1}</span>
                    <div className="flex flex-wrap gap-1">
                      {letters.map((letter) => {
                        const active = Array.isArray(current)
                          ? current.includes(letter)
                          : current === letter;
                        return (
                          <button
                            key={letter}
                            type="button"
                            aria-label={`Kunci nomor ${index + 1} ${letter}`}
                            onClick={() =>
                              type === "pgk" ? toggleMulti(index, letter) : setSingle(type, index, letter)
                            }
                            className={`grid h-7 w-7 place-items-center rounded text-[11px] font-bold transition ${
                              active
                                ? "bg-brand text-white"
                                : "bg-paper text-ink-soft hover:bg-brand-soft hover:text-brand"
                            }`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {(counts.essay || 0) > 0 && (
        <div className="card p-4">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#7a5c05]">
            <PenLine size={13} /> {counts.essay} soal uraian dinilai manual
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Buka tab Hasil & Nilai, pilih peserta, lalu beri poin 0–{exam.essay_max} untuk setiap jawaban uraian.
          </p>
        </div>
      )}
    </div>
  );
}

const sectionTitle = (type: QuestionType) =>
  ({
    pg: "Pilihan ganda",
    pgk: "PG kompleks",
    bs: "Benar / salah",
    match: "Menjodohkan",
    essay: "Uraian",
  })[type];

function normalizeKey(exam: Exam): AnswerKey {
  const source = (exam.answer_key || {}) as AnswerKey;
  return {
    pg: Array.from({ length: exam.counts.pg }, (_, i) => (source.pg?.[i] as string | null) ?? null),
    pgk: Array.from({ length: exam.counts.pgk }, (_, i) => (source.pgk?.[i] as string[] | null) ?? []),
    bs: Array.from({ length: exam.counts.bs }, (_, i) => (source.bs?.[i] as string | null) ?? null),
    match: Array.from({ length: exam.counts.match }, (_, i) => (source.match?.[i] as string | null) ?? null),
  };
}

/* -------------------------------------------------------------- hasil tab */

function HasilTab({ exam }: { exam: Exam }) {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const askConfirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.sessions(exam.id);
      setRows(data.sessions);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [exam.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const values = rows.map((row) => row.score.objectiveCorrect).filter(() => true);
    const graded = rows.filter((row) => row.score.nilai !== null).map((row) => row.score.nilai as number);
    const avg = graded.length ? graded.reduce((a, b) => a + b, 0) / graded.length : null;
    return {
      peserta: rows.length,
      dikumpulkan: rows.filter((row) => row.submittedAt).length,
      rata: avg === null ? "—" : Math.round(avg * 10) / 10,
      benar: values.length,
    };
  }, [rows]);

  const removeSession = async (row: SessionRow) => {
    const ok = await askConfirm({
      title: "Hapus jawaban peserta?",
      message: (
        <>
          Jawaban <span className="font-semibold text-ink">{row.studentName}</span> pada ujian {exam.title} akan
          dihapus dari daftar peserta.
        </>
      ),
      note: "Peserta bisa mengerjakan ulang karena riwayat jawabannya tidak tersimpan lagi.",
      confirmLabel: "Hapus jawaban",
    });
    if (!ok) return;
    await adminApi.deleteSession(row.id).then(() => load());
  };

  const exportCsv = async () => {
    try {
      const response = await fetch(`/api/admin/exams/${exam.id}/export.csv`, {
        headers: { "x-admin-token": localStorage.getItem("mts-yti-admin-token") || "" },
      });
      if (!response.ok) throw new Error("gagal");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nilai-${exam.code}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Peserta" value={String(stats.peserta)} />
        <Metric label="Selesai" value={`${stats.dikumpulkan}/${stats.peserta}`} />
        <Metric label="Rata-rata" value={String(stats.rata)} />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand">Daftar peserta</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} className="btn-ghost px-2 py-1 text-[11px]">
              Muat ulang
            </button>
            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={rows.length === 0}
              className="btn-ghost px-2 py-1 text-[11px]"
            >
              <Download size={12} /> CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12 text-muted">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12.5px] text-muted">
            Belum ada peserta. Buka ujian, lalu bagikan kode <span className="font-mono font-bold">{exam.code}</span>.
          </div>
        ) : (
          <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[620px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line bg-paper-deep/50 text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-bold">Nama</th>
                  <th className="px-3 py-2 font-bold">Kelas</th>
                  <th className="px-3 py-2 font-bold">Objektif</th>
                  <th className="px-3 py-2 font-bold">Nilai</th>
                  <th className="px-3 py-2 font-bold">Pelanggaran</th>
                  <th className="px-3 py-2 font-bold">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line/60 last:border-0 hover:bg-paper/60">
                    <td className="px-3 py-2 font-bold text-ink">{row.studentName}</td>
                    <td className="px-3 py-2 text-ink-soft">{row.studentClass}</td>
                    <td className="px-3 py-2 tabular-nums text-ink-soft">
                      {row.score.objectiveCorrect}/{row.score.objectiveTotal}
                    </td>
                    <td className="px-3 py-2 font-bold tabular-nums text-ink">
                      {row.score.nilai === null ? (
                        <span className="text-[11px] font-semibold text-[#7a5c05]">belum dinilai</span>
                      ) : (
                        row.score.nilai
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.violations > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded bg-danger-soft px-1.5 py-0.5 text-[10.5px] font-bold text-danger">
                          <ShieldAlert size={10} /> {row.violations}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-muted">
                      {row.submittedAt
                        ? row.autoSubmitted
                          ? "Otomatis"
                          : new Date(row.submittedAt).toLocaleString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                        : "Berlangsung"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenSession(row.id)}
                        className="rounded-md bg-paper px-2 py-1 text-[11px] font-bold text-brand transition hover:bg-brand-soft"
                      >
                        Periksa
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus peserta ${row.studentName}`}
                        onClick={() => void removeSession(row)}
                        className="ml-1 rounded-md p-1 text-muted transition hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 p-3 md:hidden">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-line bg-white p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-extrabold text-ink">{row.studentName}</p>
                    <p className="text-[10.5px] text-muted">
                      {row.studentClass} ·{" "}
                      {row.submittedAt
                        ? row.autoSubmitted
                          ? "otomatis"
                          : new Date(row.submittedAt).toLocaleString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                        : "berlangsung"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[16px] font-extrabold leading-tight tabular-nums text-ink">
                      {row.score.nilai === null ? "—" : row.score.nilai}
                    </p>
                    <p className="text-[9.5px] font-semibold text-muted">
                      obj {row.score.objectiveCorrect}/{row.score.objectiveTotal}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  {row.violations > 0 && (
                    <span className="inline-flex items-center gap-1 rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">
                      <ShieldAlert size={10} /> {row.violations} pelanggaran
                    </span>
                  )}
                  {row.score.nilai === null && (
                    <span className="rounded bg-sand-soft px-1.5 py-0.5 text-[10px] font-bold text-[#7a5c05]">
                      uraian belum dinilai
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenSession(row.id)}
                    className="ml-auto rounded-lg bg-brand-soft px-3 py-1.5 text-[11.5px] font-bold text-brand active:bg-brand active:text-white"
                  >
                    Periksa
                  </button>
                  <button
                    type="button"
                    aria-label={`Hapus peserta ${row.studentName}`}
                    onClick={() => void removeSession(row)}
                    className="rounded-lg border border-line p-1.5 text-muted active:bg-danger-soft active:text-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {openSession && (
        <GradeModal
          sessionId={openSession}
          onClose={() => setOpenSession(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-2.5 sm:p-3">
      <p className="text-[9.5px] font-bold uppercase leading-tight tracking-wide text-muted sm:text-[10.5px]">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-extrabold tabular-nums text-ink sm:text-xl">{value}</p>
    </div>
  );
}

function GradeModal({
  sessionId,
  onClose,
  onSaved,
}: {
  sessionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.session>> | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .session(sessionId)
      .then((payload) => {
        setData(payload);
        setScores(payload.session.manualScores || {});
      })
      .catch(() => setError("Gagal memuat jawaban peserta."));
  }, [sessionId]);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await adminApi.grade(sessionId, scores);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan nilai.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Periksa jawaban peserta" onClose={onClose} wide>
      {!data ? (
        <div className="flex justify-center py-10 text-muted">
          {error ? <p className="text-[12px] font-semibold text-danger">{error}</p> : <Loader2 className="animate-spin" size={18} />}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-paper p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-ink">{data.session.studentName}</p>
              <p className="text-[11px] text-muted">{data.session.studentClass}</p>
            </div>
            <div className="rounded-lg bg-white px-3 py-1.5 text-center ring-1 ring-line">
              <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted">Objektif</p>
              <p className="text-sm font-extrabold tabular-nums text-ink">
                {data.session.score.objectiveCorrect}/{data.session.score.objectiveTotal}
              </p>
            </div>
            <div className="rounded-lg bg-white px-3 py-1.5 text-center ring-1 ring-line">
              <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted">Pelanggaran</p>
              <p className="text-sm font-extrabold tabular-nums text-ink">{data.session.violations}</p>
            </div>
            <div className="rounded-lg bg-brand px-3 py-1.5 text-center text-white">
              <p className="text-[9.5px] font-bold uppercase tracking-wide text-white/70">Nilai</p>
              <p className="text-sm font-extrabold tabular-nums">{data.session.score.nilai ?? "—"}</p>
            </div>
          </div>

          {data.events.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-brand">Catatan pengawasan</p>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-line bg-white p-2">
                {data.events.map((event, index) => (
                  <div key={index} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-ink-soft">
                      <span className="font-bold text-danger">{event.type}</span>
                      {event.detail ? ` · ${event.detail}` : ""}
                    </span>
                    <span className="shrink-0 text-muted">
                      {new Date(event.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.exam.counts.essay > 0 ? (
            <div>
              <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-brand">
                Jawaban uraian (0–{data.exam.essay_max} poin)
              </p>
              <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
                {Array.from({ length: data.exam.counts.essay }, (_, index) => {
                  const no = index + 1;
                  const answer = data.session.answers?.essay?.[String(no)] || "";
                  return (
                    <div key={no} className="rounded-lg border border-line bg-white p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-ink">Nomor {no}</span>
                        <input
                          type="number"
                          min={0}
                          max={data.exam.essay_max}
                          step={0.5}
                          value={scores[String(no)] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setScores((current) => {
                              const next = { ...current };
                              if (value === "") delete next[String(no)];
                              else next[String(no)] = Number(value);
                              return next;
                            });
                          }}
                          placeholder="0"
                          aria-label={`Nilai uraian nomor ${no}`}
                          className="w-16 rounded-md border border-line px-2 py-1 text-right text-[12px] font-bold tabular-nums outline-none focus:border-brand"
                        />
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink-soft">
                        {answer || <span className="italic text-muted">Tidak dijawab.</span>}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-brand-soft px-3 py-2 text-[11.5px] font-semibold text-brand">
              Ujian ini tanpa soal uraian — nilai sudah final dan otomatis.
            </p>
          )}

          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-semibold text-danger">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              <X size={14} /> Tutup
            </button>
            <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary flex-1">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Simpan nilai
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------ setting tab */

function SettingTab({
  exam,
  classes,
  subjects,
  onChange,
}: {
  exam: Exam;
  classes: ClassRow[];
  subjects: SubjectRow[];
  onChange: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const askConfirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const initial: ExamFormValues = {
    title: exam.title,
    subject_id: exam.subject_id ? String(exam.subject_id) : "",
    class_id: exam.class_id ? String(exam.class_id) : "",
    duration_minutes: exam.duration_minutes,
    counts: exam.counts,
    pg_options: exam.pg_options,
    pgk_max: exam.pgk_max || 0,
    match_options: exam.match_options,
    essay_max: exam.essay_max,
    max_violations: exam.max_violations,
    instructions: exam.instructions,
  };

  const save = async (values: ExamFormValues) => {
    setBusy(true);
    setError("");
    try {
      await adminApi.updateExam(exam.id, {
        ...values,
        subject_id: values.subject_id ? Number(values.subject_id) : null,
        class_id: values.class_id ? Number(values.class_id) : null,
      });
      setSaved(true);
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    const ok = await askConfirm({
      title: "Hapus ujian ini?",
      message: (
        <>
          <span className="font-semibold text-ink">{exam.title}</span>
          {exam.kelas ? ` · rombel ${exam.kelas}` : ""} beserta seluruh jawaban peserta akan dihapus.
        </>
      ),
      note: "Naskah PDF, kunci jawaban, dan nilai peserta ikut terhapus dan tidak bisa dikembalikan.",
      confirmLabel: "Hapus ujian",
    });
    if (!ok) return;
    try {
      await adminApi.deleteExam(exam.id);
      navigate("/guru", { replace: true });
    } catch {
      setError("Gagal menghapus ujian.");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="card p-5">
        <h2 className="text-sm font-extrabold text-ink">Pengaturan ujian</h2>
        <p className="mt-0.5 mb-4 text-[12px] text-muted">
          Mengubah jumlah soal akan mengatur ulang daftar kunci jawaban.
        </p>
        {saved && (
          <p className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-[11.5px] font-semibold text-brand">
            Perubahan tersimpan.
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-semibold text-danger">{error}</p>
        )}
        <ExamForm
          initial={initial}
          classes={classes}
          subjects={subjects}
          submitLabel="Simpan perubahan"
          busy={busy}
          onSubmit={(values) => void save(values)}
        />
      </div>

      <div className="space-y-4">
        <div className="card p-5">
          <h3 className="text-[12px] font-extrabold text-ink">Status ujian</h3>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Peserta hanya bisa masuk saat status <span className="font-bold">Dibuka</span>.
          </p>
          <div className="mt-3 flex gap-2">
            {(["draft", "open", "closed"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => void adminApi.updateExam(exam.id, { status }).then(onChange)}
                className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-bold transition ${
                  exam.status === status ? "bg-brand text-white" : "bg-paper text-ink-soft hover:bg-brand-soft"
                }`}
              >
                {status === "draft" ? "Belum dibuka" : status === "open" ? "Dibuka" : "Ditutup"}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-paper p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Kode ujian</p>
            <p className="font-mono text-lg font-extrabold tracking-[0.3em] text-ink">{exam.code}</p>
            <p className="mt-1 break-all text-[10.5px] text-muted">
              {window.location.origin}/?kode={exam.code}
            </p>
          </div>
        </div>

        <div className="card border-danger/30 p-5">
          <h3 className="text-[12px] font-extrabold text-danger">Hapus ujian</h3>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Menghapus ujian juga menghapus semua jawaban dan nilai peserta. Tindakan ini tidak dapat dibatalkan.
          </p>
          <button
            type="button"
            onClick={() => void destroy()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-bold text-danger transition hover:bg-danger hover:text-white"
          >
            <Trash2 size={13} /> Hapus ujian ini
          </button>
        </div>
      </div>
    </div>
  );
}
