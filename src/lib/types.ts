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
  pgk_max: number;
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
  /** 0 = bebas, >0 = jumlah pilihan maksimal untuk soal PG kompleks */
  pgkMax: number;
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
