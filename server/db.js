import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || "";

export const pool = new Pool({
  connectionString,
  ssl: /sslmode=require|neon\.tech|supabase\.(co|com|net)/i.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
  // serverless: many short-lived instances, so keep each pool tiny
  max: Number(process.env.PG_POOL_MAX || (process.env.VERCEL ? 3 : 5)),
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 15000,
});

pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

/**
 * Query helper. A published app sleeps when idle, so a pooled connection can be
 * stale on the next request: retry once on a connection-level error.
 */
export async function q(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    const code = String(err.code || "");
    const retriable =
      code.startsWith("08") ||
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      /terminated|connection/i.test(err.message || "");
    if (!retriable) throw err;
    console.warn("[db] retrying after connection error:", err.message);
    return await pool.query(text, params);
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS exams (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  title text NOT NULL,
  subject text NOT NULL DEFAULT '',
  kelas text NOT NULL DEFAULT '',
  duration_minutes int NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'draft',
  counts jsonb NOT NULL DEFAULT '{"pg":0,"pgk":0,"bs":0,"match":0,"essay":0}'::jsonb,
  answer_key jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_options int NOT NULL DEFAULT 0,
  pg_options int NOT NULL DEFAULT 4,
  pgk_options int NOT NULL DEFAULT 5, -- jumlah huruf pilihan soal PG kompleks
  essay_max int NOT NULL DEFAULT 10,
  -- poin per tipe soal; nilai = (poin diperoleh / total poin) x 100
  points jsonb NOT NULL DEFAULT '{"pg":1,"pgk":1,"bs":1,"match":1,"essay":10}'::jsonb,
  max_violations int NOT NULL DEFAULT 5,
  pgk_max int NOT NULL DEFAULT 0, -- sisa versi lama; batas PGK kini mengikuti kunci jawaban
  instructions text NOT NULL DEFAULT '',
  pdf bytea,
  pdf_path text,
  pdf_name text,
  pdf_size int,
  pdf_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id int NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  token text NOT NULL,
  student_name text NOT NULL,
  student_class text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  violations int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL,
  submitted_at timestamptz,
  auto_submitted boolean NOT NULL DEFAULT false,
  score numeric,
  score_detail jsonb,
  manual_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  graded_at timestamptz,
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  type text NOT NULL,
  detail text,
  at timestamptz NOT NULL DEFAULT now()
);

/* ---- master data: kelas, mapel, siswa ---- */

CREATE TABLE IF NOT EXISTS classes (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  level text NOT NULL DEFAULT '',
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subjects (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id serial PRIMARY KEY,
  class_id int NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name text NOT NULL,
  nis text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS students_class_idx ON students(class_id);

ALTER TABLE exams ADD COLUMN IF NOT EXISTS pdf_path text;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS pgk_max int NOT NULL DEFAULT 0; -- tidak dipakai lagi
ALTER TABLE exams ADD COLUMN IF NOT EXISTS pgk_options int NOT NULL DEFAULT 5;
-- poin per tipe soal: kolom baru diisi dari essay_max ujian lama supaya nilainya tidak berubah
ALTER TABLE exams ADD COLUMN IF NOT EXISTS points jsonb;
UPDATE exams SET points = jsonb_build_object('pg', 1, 'pgk', 1, 'bs', 1, 'match', 1, 'essay', essay_max)
  WHERE points IS NULL;
ALTER TABLE exams ALTER COLUMN points SET DEFAULT '{"pg":1,"pgk":1,"bs":1,"match":1,"essay":10}'::jsonb;
ALTER TABLE exams ALTER COLUMN points SET NOT NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS class_id int REFERENCES classes(id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_id int REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS student_id int REFERENCES students(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS students_unique_name ON students (class_id, lower(name));

CREATE INDEX IF NOT EXISTS sessions_exam_idx ON sessions(exam_id);
CREATE INDEX IF NOT EXISTS sessions_student_idx ON sessions(exam_id, student_id);
CREATE INDEX IF NOT EXISTS events_session_idx ON events(session_id);
`;

const SEED_CLASSES = ["7A", "7B", "8A", "8B", "9A", "9B"];
const SEED_SUBJECTS = [
  "Al-Qur'an Hadis",
  "Akidah Akhlak",
  "Fikih",
  "Sejarah Kebudayaan Islam",
  "Bahasa Arab",
  "Bahasa Indonesia",
  "Bahasa Inggris",
  "Matematika",
  "Ilmu Pengetahuan Alam",
  "Ilmu Pengetahuan Sosial",
  "Pendidikan Pancasila",
  "Informatika",
  "Seni Budaya",
  "PJOK",
];

export async function initSchema(retries = 12) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await q(SCHEMA);
      await seedCatalog();
      console.log("[db] schema ready");
      return true;
    } catch (err) {
      console.error(`[db] schema attempt ${attempt} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return false;
}

/** first run: give the school a usable starting list of kelas + mapel */
async function seedCatalog() {
  const classes = await q("SELECT count(*)::int AS n FROM classes");
  if (classes.rows[0].n === 0) {
    for (let i = 0; i < SEED_CLASSES.length; i += 1) {
      const name = SEED_CLASSES[i];
      await q("INSERT INTO classes (name, level, sort) VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING", [
        name,
        name.slice(0, 1),
        i,
      ]);
    }
  }
  const subjects = await q("SELECT count(*)::int AS n FROM subjects");
  if (subjects.rows[0].n === 0) {
    for (const name of SEED_SUBJECTS) {
      await q("INSERT INTO subjects (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
    }
  }
}
