import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Loader2,
  PenLine,
  ShieldCheck,
  Target,
} from "lucide-react";
import { studentApi, sessionToken } from "../lib/api";
import type { Session } from "../lib/types";

const fmtNum = (value: number) =>
  String(Math.round(value * 100) / 100).replace(".", ",");

const fmtClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

export default function ResultPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId || !sessionToken.get(sessionId)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    studentApi
      .session(sessionId)
      .then(({ session: data }) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const finish = () => {
    sessionToken.clear(sessionId);
    localStorage.removeItem("mts-yti-last-session");
    navigate("/", { replace: true });
  };

  const score = session?.score;
  const objectivePercent =
    score && score.objectiveTotal > 0
      ? Math.round((score.objectiveCorrect / score.objectiveTotal) * 1000) / 10
      : null;
  /** nilai akhir (0–100) hanya ada setelah semua uraian dinilai guru */
  const finalNilai = score && score.nilai !== null ? score.nilai : null;
  const heroValue = finalNilai !== null ? fmtNum(finalNilai) : objectivePercent !== null ? fmtNum(objectivePercent) : "—";
  const heroFormula =
    finalNilai !== null && score
      ? `${fmtNum(score.earned)} poin dari ${score.possible} soal × 100`
      : score
        ? `${score.objectiveCorrect} benar dari ${score.objectiveTotal} soal × 100`
        : "belum ada data";
  const usedSeconds = session
    ? Math.max(
        0,
        Math.round(
          ((session.submittedAt ? new Date(session.submittedAt).getTime() : Date.now()) -
            new Date(session.startedAt).getTime()) /
            1000
        )
      )
    : 0;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 460px at 50% -10%, #eaf3ee 0%, transparent 62%), linear-gradient(180deg,#f8f7f2 0%,#f2f0e8 100%)",
        }}
      />

      <header className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-5 sm:px-8">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-deep text-sand">
          <GraduationCap size={20} />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-extrabold tracking-tight text-ink">MTs YTI Sukamerang</p>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">Sistem Ujian Digital</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
        {loading ? (
          <div className="flex justify-center py-24 text-muted">
            <Loader2 className="animate-spin" size={22} />
          </div>
        ) : (
          <div className="card overflow-hidden shadow-[0_24px_60px_-30px_rgba(13,31,25,0.35)] slide-up">
            <div className="bg-brand-deep px-6 py-7 text-center text-white">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/10 ring-1 ring-white/20">
                <CheckCircle2 size={28} className="text-sand" />
              </span>
              <h1 className="mt-3 font-display text-[26px] font-semibold leading-tight tracking-tight">Jawaban sudah dikumpulkan</h1>
              <p className="mt-1 text-[12.5px] text-white/70">
                {session?.studentName} · {session?.studentClass}
                {session?.autoSubmitted ? " · dikumpulkan otomatis karena waktu habis" : ""}
              </p>
            </div>

            {session?.exam && (
              <div className="border-b border-line bg-paper-deep/50 px-6 py-3 text-center text-[12px] font-semibold text-ink-soft">
                {session.exam.title} {session.exam.subject ? `· ${session.exam.subject}` : ""}{" "}
                {session.exam.kelas ? `· Kelas ${session.exam.kelas}` : ""}
              </div>
            )}

            <div className="px-5 pt-5">
              <div className="rounded-xl border border-brand/20 bg-brand-soft/35 px-4 py-5 text-center">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand">
                  {finalNilai !== null ? "Nilai" : "Nilai objektif sementara"}
                </p>
                <p className="mt-1.5 font-display text-[44px] font-semibold leading-none tabular-nums text-brand-deep">
                  {heroValue}
                </p>
                <p className="mt-2.5 text-[11.5px] font-medium text-ink-soft">{heroFormula}</p>
              </div>
            </div>

            <div className="grid gap-3 p-5 sm:grid-cols-3">
              <Stat
                icon={Target}
                label="Soal benar"
                value={score ? `${score.objectiveCorrect}/${score.objectiveTotal}` : "—"}
                hint="soal objektif"
              />
              <Stat
                icon={Clock3}
                label="Waktu terpakai"
                value={fmtClock(usedSeconds)}
                hint={`dari ${session?.exam?.durationMinutes ?? 0} menit`}
              />
              <Stat
                icon={session && session.violations > 0 ? AlertTriangle : ShieldCheck}
                label="Pelanggaran"
                value={String(session?.violations ?? 0)}
                hint={session && session.violations > 0 ? `batas ${session.maxViolations}` : "tidak ada"}
                tone={session && session.violations > 0 ? "warn" : "ok"}
              />
            </div>

            {score && score.essayTotal > 0 && score.nilai === null && (
              <div className="mx-5 mb-5 rounded-xl border border-sand/40 bg-sand-soft/50 p-3.5">
                <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#7a5c05]">
                  <PenLine size={13} /> {score.essayCount} soal uraian menunggu penilaian guru
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[#7a5c05]/80">
                  Angka di atas baru dihitung dari soal objektif. Nilai akhir (poin ÷ jumlah soal × 100)
                  muncul setelah guru menilai uraian.
                </p>
              </div>
            )}

            <div className="border-t border-line px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={finish} className="btn-primary flex-1">
                  Selesai <ArrowRight size={15} />
                </button>
                <Link to="/" className="btn-ghost flex-1">
                  Halaman awal
                </Link>
              </div>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
                Kamu boleh menutup peramban. Jika ada kendala, hubungi guru pengawas dengan menyebutkan nama
                dan kelasmu.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone = "ok",
}: {
  icon: ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted">
        <Icon size={12} className={tone === "warn" ? "text-danger" : "text-brand"} /> {label}
      </div>
      <p
        className={`mt-1.5 text-2xl font-extrabold tabular-nums ${
          tone === "warn" ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
    </div>
  );
}
