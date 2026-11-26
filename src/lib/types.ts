export type ClassRow = { id: number; name: string; level?: string; student_count?: number };
export type StudentRow = { id: number; name: string; nis?: string; class_id?: number; active?: boolean };
export type SubjectRow = { id: number; name: string; exam_count?: number };

export type QuestionType = "pg" | "pgk" | "bs" | "match" | "essay";

export type Counts = Record<QuestionType, number>;

export type AnswerKey = {
  pg?: (string | null)[];
  pgk?: (string[] | null)[];
  bs?: (string | null)[];
  match?: (string | null)[];
  essay?: never[];
};

export type Answers = {
  pg: Record<string, string>;
  pgk: Record<string, string[]>;
  bs: Record<string, string>;
  match: Record<string, string>;
  essay: Record<string, string>;
};

export type Exam = {
  id: number;
  code: string;
  title: string;
  subject: string;
  kelas: string;
  duration_minutes: number;
  status: "draft" | "open" | "closed";
  counts: Counts;
  answer_key: AnswerKey;
  match_options: number;
  pg_options: number;
  /** jumlah huruf pilihan untuk soal PG kompleks */
  pgk_options: number;
  /** poin untuk tiap tipe soal — nilai = (poin diperoleh ÷ total poin) × 100 */
  points: Counts;
  /** poin per soal uraian versi lama; kini mengikuti points.essay */
  essay_max: number;
  max_violations: number;
  instructions: string;
  class_id: number | null;
  subject_id: number | null;
  pdf_name: string | null;
  pdf_size: number | null;
  pdf_updated_at: string | null;
  created_at?: string;
  session_count?: number;
  submitted_count?: number;
};

export type ExamPublic = Omit<Exam, "answer_key"> & { hasPdf: boolean };

export type ScoreDetail = {
  /** bobot poin yang dipakai saat menilai (bisa tidak ada pada nilai lama) */
  points?: Counts;
  objectiveCorrect: number;
  objectiveTotal: number;
  essayEarned: number;
  essayTotal: number;
  essayGraded: number;
  essayCount: number;
  earned: number;
  possible: number;
  nilai: number | null;
  graded: boolean;
  detail?: Record<string, { no: number; expected: unknown; given: unknown; correct: boolean }[]>;
  essayDetail?: { no: number; answer: string; max: number; score: number | null }[];
};

export type Session = {
  id: string;
  token: string;
  examId: number;
  studentName: string;
  studentClass: string;
  answers: Answers;
  violations: number;
  maxViolations: number;
  startedAt: string;
  submittedAt: string | null;
  deadline: string;
  remainingSeconds: number;
  submitted: boolean;
  autoSubmitted: boolean;
  score: ScoreDetail | null;
  pdfUpdatedAt: string | null;
  counts: Counts;
  essayMax: number;
  matchOptions: number;
  pgOptions: number;
  /** jumlah huruf pilihan untuk soal PG kompleks */
  pgkOptions: number;
  /**
   * Batas pilihan per nomor untuk soal PG kompleks, dihitung server dari kunci
   * jawaban: 2 jawaban benar → maksimal 2 pilihan, 3 → 3. Nomor tanpa kunci
   * tidak dibatasi (tidak muncul di objek ini).
   */
  pgkLimits: Record<string, number>;
  exam?: {
    id: number;
    code: string;
    title: string;
    subject: string;
    kelas: string;
    durationMinutes: number;
    instructions: string;
    maxViolations: number;
    counts: Counts;
  };
};

/* ------------------------------------------------------------ papan pantau (live) */

export type MonitorSession = {
  id: string;
  studentName: string;
  studentClass: string;
  violations: number;
  answered: number;
  startedAt: string;
  deadline: string;
  submittedAt: string | null;
  autoSubmitted: boolean;
  lastSeen: string | null;
  graded: boolean;
};

export type MonitorEvent = {
  id: number;
  type: string;
  detail: string | null;
  at: string;
  sessionId: string;
  studentName: string;
  studentClass: string;
};

/** Ujian di papan pantau — sengaja tanpa kunci jawaban, dibaca juga oleh pengawas. */
export type MonitorExam = Omit<Exam, "answer_key">;

export type MonitorSnapshot = {
  exam: MonitorExam;
  sessions: MonitorSession[];
  events: MonitorEvent[];
  now: string;
};

/** Ringkasan ujian di daftar pilih-ujian milik pengawas. */
export type ProctorExam = {
  id: number;
  code: string;
  title: string;
  subject: string;
  kelas: string;
  duration_minutes: number;
  status: "draft" | "open" | "closed";
  session_count: number;
  submitted_count: number;
};

export const emptyAnswers = (): Answers => ({ pg: {}, pgk: {}, bs: {}, match: {}, essay: {} });
/** server payloads can omit a type entirely — always hand the UI a full shape */
export function normalizeAnswers(raw: unknown): Answers {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<Answers>;
  return {
    pg: { ...(source.pg || {}) },
    pgk: { ...(source.pgk || {}) },
    bs: { ...(source.bs || {}) },
    match: { ...(source.match || {}) },
    essay: { ...(source.essay || {}) },
  };
}
