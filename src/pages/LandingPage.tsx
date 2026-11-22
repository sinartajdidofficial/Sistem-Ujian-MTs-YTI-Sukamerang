import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, GraduationCap, KeyRound, Loader2, Lock, LogIn, UserRound, Users } from "lucide-react";
import { ApiError, studentApi, sessionToken } from "../lib/api";
import { unlockAudio } from "../lib/alarm";
import type { ClassRow, StudentRow } from "../lib/types";

const STUDENT_KEY = "mts-yti-student";

export default function LandingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [token, setToken] = useState((params.get("kode") || params.get("token") || "").toUpperCase());

  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Ujian terikat pada satu rombel: kelas dikunci sesuai token, siswa tidak bisa memilih kelas lain. */
  const [lockedClass, setLockedClass] = useState<{ id: number; name: string } | null>(null);

  const studentsSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    studentApi
      .classes()
      .then(({ classes: rows }) => {
        if (cancelled) return;
        setClasses(rows);
        try {
          const saved = JSON.parse(localStorage.getItem(STUDENT_KEY) || "null") as
            | { classId?: number; studentId?: number }
            | null;
          if (saved?.classId && rows.some((row) => row.id === saved.classId)) {
            setClassId(String(saved.classId));
            if (saved.studentId) setStudentId(String(saved.studentId));
          }
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        if (!cancelled) setError("Tidak dapat memuat data kelas. Periksa koneksi internet.");
      })
      .finally(() => {
        if (!cancelled) setLoadingClasses(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!classId) {
      setStudents([]);
      return;
    }
    const seq = (studentsSeq.current += 1);
    setLoadingStudents(true);
    studentApi
      .students(Number(classId))
      .then(({ students: rows }) => {
        if (seq !== studentsSeq.current) return;
        setStudents(rows);
        setStudentId((current) => (rows.some((row) => String(row.id) === current) ? current : ""));
      })
      .catch(() => {
        if (seq === studentsSeq.current) setStudents([]);
      })
      .finally(() => {
        if (seq === studentsSeq.current) setLoadingStudents(false);
      });
  }, [classId]);

  /**
   * Satu ujian = satu rombel. Begitu token dikenali, kelas dikunci ke rombel ujian itu
   * supaya siswa tidak salah pilih kelas.
   */
  useEffect(() => {
    const code = token.trim().toUpperCase();
    if (code.length < 4) {
      setLockedClass(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      studentApi
        .examByCode(code)
        .then(({ exam }) => {
          if (cancelled) return;
          if (exam.class_id) {
            setLockedClass({ id: exam.class_id, name: exam.kelas || "sesuai token" });
            setClassId(String(exam.class_id));
          } else {
            setLockedClass(null);
          }
        })
        .catch(() => {
          if (!cancelled) setLockedClass(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token]);

  const ready = !!classId && !!studentId && token.trim().length >= 4;

  const submit = async () => {
    if (!ready) return;
    unlockAudio();
    setBusy(true);
    setError("");
    try {
      const { session, alreadySubmitted } = await studentApi.start(
        token.trim().toUpperCase(),
        Number(studentId)
      );
      sessionToken.set(session.id, session.token);
      localStorage.setItem(STUDENT_KEY, JSON.stringify({ classId: Number(classId), studentId: Number(studentId) }));
      if (alreadySubmitted) {
        navigate(`/selesai/${session.id}`, { replace: false });
        return;
      }
      navigate(`/ujian/${session.id}`, { replace: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal masuk ujian. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const selectedClass = classes.find((row) => String(row.id) === classId);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(760px 420px at 50% -6%, #eaf3ee 0%, transparent 62%), radial-gradient(620px 380px at 90% 100%, #f6ecc9 0%, transparent 65%), linear-gradient(180deg,#f8f7f2 0%,#f1efe7 100%)",
        }}
      />

      <main className="w-full max-w-md">
        <div className="card overflow-hidden shadow-[0_24px_60px_-32px_rgba(13,31,25,0.42)]">
          <div className="px-6 pb-5 pt-8 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-deep text-sand shadow-sm ring-1 ring-brand-deep/25">
              <GraduationCap size={24} />
            </span>
            <h1 className="mx-auto mt-4 max-w-[21rem] text-balance font-display text-[24px] font-semibold leading-[1.22] tracking-tight text-ink sm:text-[26px]">
              Sistem Asesmen Sumatif Akhir
              <span className="mt-1 block text-[21px] font-semibold text-brand sm:text-[23px]">MTs YTI Sukamerang</span>
            </h1>
            <p className="mt-2 text-[12px] font-medium text-muted">Masuk untuk mengerjakan ujian</p>
          </div>

          <div className="space-y-3.5 border-t border-line bg-white px-6 py-5">
            <div>
              <label htmlFor="kelas" className="mb-1.5 block text-[12px] font-bold text-ink-soft">
                Kelas
              </label>
              <div className="relative">
                <select
                  id="kelas"
                  value={classId}
                  onChange={(event) => {
                    setClassId(event.target.value);
                    setStudentId("");
                    setError("");
                  }}
                  disabled={loadingClasses || !!lockedClass}
                  className="field appearance-none pr-9 disabled:opacity-60"
                >
                  <option value="">{loadingClasses ? "Memuat kelas…" : "Pilih kelas"}</option>
                  {classes.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
              </div>
              {lockedClass && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2 py-1 text-[11px] font-semibold text-brand">
                  <Lock size={11} /> Rombel {lockedClass.name} — sesuai token ujian
                </p>
              )}
            </div>

            <div>
              <label htmlFor="siswa" className="mb-1.5 block text-[12px] font-bold text-ink-soft">
                Nama siswa
              </label>
              <div className="relative">
                <select
                  id="siswa"
                  value={studentId}
                  onChange={(event) => {
                    setStudentId(event.target.value);
                    setError("");
                  }}
                  disabled={!classId || loadingStudents || students.length === 0}
                  className="field appearance-none pr-9 disabled:opacity-60"
                >
                  <option value="">
                    {!classId
                      ? "Pilih kelas dulu"
                      : loadingStudents
                        ? "Memuat nama…"
                        : students.length === 0
                          ? "Belum ada siswa di kelas ini"
                          : "Pilih nama siswa"}
                  </option>
                  {students.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
              </div>
              {classId && !loadingStudents && students.length === 0 && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#7a5c05]">
                  Belum ada siswa terdaftar di kelas {selectedClass?.name}. Hubungi guru untuk menambahkannya.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="token" className="mb-1.5 block text-[12px] font-bold text-ink-soft">
                Token ujian
              </label>
              <div className="relative">
                <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  id="token"
                  value={token}
                  onChange={(event) => {
                    setToken(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8));
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submit();
                  }}
                  placeholder="ABC123"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className="field pl-9 font-mono text-base font-bold uppercase tracking-[0.18em]"
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Token diberikan guru pengawas di ruang ujian.
              </p>
            </div>

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-danger">
                {error}
              </p>
            )}

            <button type="button" onClick={() => void submit()} disabled={!ready || busy} className="btn-primary w-full py-2.5">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              {busy ? "Menyiapkan ujian…" : "Masuk Ujian"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line bg-paper-deep/50 px-6 py-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users size={12} /> {classes.reduce((sum, row) => sum + (row.student_count || 0), 0)} siswa terdaftar
            </span>
            <Link to="/guru" className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-brand">
              <UserRound size={12} /> Masuk Guru
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-[10.5px] leading-relaxed text-muted">
          Naskah ujian dibaca dalam layar penuh. Jawaban tersimpan otomatis dan tidak dapat disalin.
        </p>
      </main>
    </div>
  );
}
