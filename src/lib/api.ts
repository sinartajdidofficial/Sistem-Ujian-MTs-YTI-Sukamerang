import type {
  Answers,
  ClassRow,
  Exam,
  ExamPublic,
  MonitorSnapshot,
  ProctorExam,
  ScoreDetail,
  Session,
  StudentRow,
  SubjectRow,
} from "./types";

const ADMIN_KEY = "mts-yti-admin-token";
const PROCTOR_KEY = "mts-yti-proctor-key";
export const SESSION_KEY_PREFIX = "mts-yti-session:";

export const adminToken = {
  get: () => localStorage.getItem(ADMIN_KEY) || "",
  set: (token: string) => localStorage.setItem(ADMIN_KEY, token),
  clear: () => localStorage.removeItem(ADMIN_KEY),
};

/**
 * Kunci pengawas datang dari tautan yang dibagikan guru: /pantau#k=KUNCI.
 * Dibaca dari hash (tidak ikut terkirim ke server log), lalu disimpan supaya
 * halaman tetap hidup saat di-refresh. Halaman pengawas tidak pernah memakai
 * token guru.
 */
export const proctorKey = {
  readFromUrl: (): string => {
    if (typeof window === "undefined") return proctorKey.get();
    const hash = window.location.hash.replace(/^#/, "");
    const fromHash = new URLSearchParams(hash).get("k") || "";
    const fromQuery = new URLSearchParams(window.location.search).get("k") || "";
    const found = (fromHash || fromQuery).trim().toLowerCase();
    if (found) proctorKey.set(found);
    return found || proctorKey.get();
  },
  get: () => {
    try {
      return localStorage.getItem(PROCTOR_KEY) || "";
    } catch {
      return "";
    }
  },
  set: (key: string) => {
    try {
      localStorage.setItem(PROCTOR_KEY, key.trim().toLowerCase());
    } catch {
      /* mode privat bisa menolak localStorage — tautan di URL tetap dipakai */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(PROCTOR_KEY);
    } catch {
      /* abaikan */
    }
  },
};

/**
 * Satu tautan untuk semua ujian: /pantau#k=KUNCI.
 * Dari situ pengawas memilih sendiri ujian mana yang mau dipantau.
 */
export function proctorUrl(key: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const hash = new URLSearchParams();
  hash.set("k", key);
  return `${origin}/pantau#${hash.toString()}`;
}

export const sessionToken = {
  get: (sessionId: string) => localStorage.getItem(SESSION_KEY_PREFIX + sessionId) || "",
  set: (sessionId: string, token: string) => localStorage.setItem(SESSION_KEY_PREFIX + sessionId, token),
  clear: (sessionId: string) => localStorage.removeItem(SESSION_KEY_PREFIX + sessionId),
};

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

type FetchOptions = {
  method?: string;
  body?: unknown;
  admin?: boolean;
  proctor?: boolean;
  session?: { id: string; token: string };
};

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.admin) headers["x-admin-token"] = adminToken.get();
  if (options.proctor) headers["x-proctor-key"] = proctorKey.get();
  if (options.session) headers["x-session-token"] = options.session.token;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || (options.body !== undefined ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Tidak dapat menghubungi server. Periksa koneksi internet.", 0, null);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error || `Permintaan gagal (${response.status}).`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

/* ------------------------------------------------------------------ admin */

export const adminApi = {
  login: (password: string) => request<{ token: string }>("/api/admin/login", { body: { password } }),
  me: () => request<{ ok: boolean }>("/api/admin/me", { admin: true }),
  changePassword: (current: string, next: string) =>
    request<{ ok: boolean }>("/api/admin/password", { body: { current, next }, admin: true }),
  logout: () => request<{ ok: boolean }>("/api/admin/logout", { method: "POST", admin: true }),
  /** Kunci tautan pengawas (hanya guru yang boleh tahu). */
  getProctorKey: () => request<{ key: string }>("/api/admin/proctor-key", { admin: true }),
  rotateProctorKey: () =>
    request<{ key: string }>("/api/admin/proctor-key/rotate", { method: "POST", admin: true }),
  exams: () => request<{ exams: Exam[] }>("/api/admin/exams", { admin: true }),
  exam: (id: number) => request<{ exam: Exam }>(`/api/admin/exams/${id}`, { admin: true }),
  createExam: (body: Record<string, unknown>) =>
    request<{ exam: Exam }>("/api/admin/exams", { body, admin: true }),
  updateExam: (id: number, body: Record<string, unknown>) =>
    request<{ exam: Exam }>(`/api/admin/exams/${id}`, { method: "PATCH", body, admin: true }),
  deleteExam: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/exams/${id}`, { method: "DELETE", admin: true }),
  /** Papan pantau: sesi berjalan + aliran kejadian, dipanggil berkala oleh pengawas. */
  monitor: (id: number) => request<MonitorSnapshot>(`/api/admin/exams/${id}/monitor`, { admin: true }),
  /**
   * With Supabase Storage configured the browser uploads straight to the bucket
   * (no size limit worth worrying about); otherwise the file goes through our
   * server, which caps it to the host's request limit.
   */
  uploadPdf: async (id: number, file: File) => {
    const target = await request<{
      mode: "storage" | "direct";
      path?: string;
      uploadUrl?: string;
      maxBytes: number;
    }>(`/api/admin/exams/${id}/pdf/upload-url`, {
      body: { name: file.name, size: file.size },
      admin: true,
    });

    if (file.size > target.maxBytes) {
      const mb = Math.round((target.maxBytes / (1024 * 1024)) * 10) / 10;
      throw new ApiError(
        `Ukuran PDF melebihi batas ${mb} MB. Perkecil file PDF-nya lalu unggah lagi.`,
        413,
        null
      );
    }

    if (target.mode === "storage" && target.uploadUrl && target.path) {
      const upload = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf", "x-upsert": "true" },
        body: file,
      }).catch(() => null);
      if (!upload || !upload.ok) {
        throw new ApiError("Gagal mengunggah PDF ke penyimpanan. Coba lagi.", upload?.status || 0, null);
      }
      return request<{ exam: Exam }>(`/api/admin/exams/${id}/pdf/record`, {
        body: { path: target.path, name: file.name, size: file.size },
        admin: true,
      });
    }

    const response = await fetch(`/api/admin/exams/${id}/pdf`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "x-admin-token": adminToken.get(),
        "x-file-name": encodeURIComponent(file.name),
      },
      body: file,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        (payload as { error?: string } | null)?.error ||
          (response.status === 413
            ? "PDF terlalu besar untuk diunggah langsung. Perkecil file PDF-nya."
            : "Gagal mengunggah PDF."),
        response.status,
        payload
      );
    }
    return payload as { exam: Exam };
  },
  catalog: () =>
    request<{ classes: ClassRow[]; subjects: SubjectRow[]; students: StudentRow[] }>("/api/admin/catalog", {
      admin: true,
    }),
  addClass: (name: string) =>
    request<{ class: ClassRow }>("/api/admin/classes", { body: { name }, admin: true }),
  renameClass: (id: number, name: string) =>
    request<{ class: ClassRow }>(`/api/admin/classes/${id}`, { method: "PATCH", body: { name }, admin: true }),
  deleteClass: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/classes/${id}`, { method: "DELETE", admin: true }),
  addSubject: (name: string) =>
    request<{ subject: SubjectRow }>("/api/admin/subjects", { body: { name }, admin: true }),
  renameSubject: (id: number, name: string) =>
    request<{ subject: SubjectRow }>(`/api/admin/subjects/${id}`, { method: "PATCH", body: { name }, admin: true }),
  deleteSubject: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/subjects/${id}`, { method: "DELETE", admin: true }),
  addStudents: (classId: number, names: string[], nis?: string) =>
    request<{ added: number; skipped: number }>("/api/admin/students", {
      body: { classId, names, nis },
      admin: true,
    }),
  updateStudent: (id: number, body: { name?: string; classId?: number; nis?: string; active?: boolean }) =>
    request<{ student: StudentRow }>(`/api/admin/students/${id}`, { method: "PATCH", body, admin: true }),
  deleteStudent: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/students/${id}`, { method: "DELETE", admin: true }),
  sessions: (examId: number) =>
    request<{
      exam: Exam;
      sessions: {
        id: string;
        studentName: string;
        studentClass: string;
        violations: number;
        startedAt: string;
        submittedAt: string | null;
        autoSubmitted: boolean;
        deadline: string;
        manualScores: Record<string, number>;
        score: ScoreDetail;
      }[];
    }>(`/api/admin/exams/${examId}/sessions`, { admin: true }),
  session: (sessionId: string) =>
    request<{
      exam: Exam;
      session: {
        id: string;
        studentName: string;
        studentClass: string;
        answers: Answers;
        violations: number;
        startedAt: string;
        submittedAt: string | null;
        autoSubmitted: boolean;
        manualScores: Record<string, number>;
        score: ScoreDetail;
      };
      events: { type: string; detail: string | null; at: string }[];
    }>(`/api/admin/sessions/${sessionId}`, { admin: true }),
  deleteSession: (sessionId: string) =>
    request<{ ok: boolean }>(`/api/admin/sessions/${sessionId}`, { method: "DELETE", admin: true }),
  grade: (sessionId: string, scores: Record<string, number>) =>
    request<{ session: Session }>(`/api/admin/sessions/${sessionId}/grade`, {
      body: { scores },
      admin: true,
    }),
};

/* ---------------------------------------------------------------- pengawas */

/**
 * Semua isi halaman pengawas. Hanya butuh kunci dari tautan — tidak ada sesi
 * guru, tidak ada halaman admin yang bisa dibuka dari sini.
 */
export const proctorApi = {
  exams: () => request<{ exams: ProctorExam[] }>("/api/proctor/exams", { proctor: true }),
  monitor: (id: number) =>
    request<MonitorSnapshot>(`/api/proctor/exams/${id}/monitor`, { proctor: true }),
};

/* ---------------------------------------------------------------- student */

export const studentApi = {
  examByCode: (code: string) => request<{ exam: ExamPublic }>(`/api/exams/${encodeURIComponent(code)}`),
  classes: () => request<{ classes: ClassRow[] }>("/api/classes"),
  students: (classId: number) =>
    request<{ students: StudentRow[] }>(`/api/classes/${classId}/students`),
  start: (code: string, studentId: number) =>
    request<{ session: Session; resumed?: boolean; alreadySubmitted?: boolean }>(
      `/api/exams/${encodeURIComponent(code)}/sessions`,
      { body: { studentId } }
    ),
  session: (id: string) =>
    request<{ session: Session }>(`/api/sessions/${id}`, {
      session: { id, token: sessionToken.get(id) },
    }),
  saveAnswers: (id: string, answers: Answers) =>
    request<{ ok: boolean; savedAt: string; answers: Answers }>(`/api/sessions/${id}/answers`, {
      method: "PUT",
      body: { answers },
      session: { id, token: sessionToken.get(id) },
    }),
  violation: (id: string, type: string, detail?: string) =>
    request<{
      violations: number;
      locked: boolean;
      submitted: boolean;
      maxViolations?: number;
      session?: Session;
    }>(`/api/sessions/${id}/violations`, {
      body: { type, detail },
      session: { id, token: sessionToken.get(id) },
    }),
  submit: (id: string, answers: Answers) =>
    request<{ session: Session }>(`/api/sessions/${id}/submit`, {
      body: { answers },
      session: { id, token: sessionToken.get(id) },
    }),
  pdfUrl: (id: string) =>
    `/api/sessions/${id}/pdf?token=${encodeURIComponent(sessionToken.get(id))}`,
};

export const formatSize = (bytes: number | null | undefined) => {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
