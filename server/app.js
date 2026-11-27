import express from "express";
import crypto from "node:crypto";
import { q, initSchema } from "./db.js";
import { buildResultPdf } from "./exportPdf.js";
import { buildResultXlsx } from "./exportXlsx.js";

const app = express();

app.disable("x-powered-by");

/**
 * Serverless platforms (Vercel) hand us an already-parsed body. Mark it so
 * express.json / express.raw step aside instead of re-reading a dead stream.
 */
app.use((req, _res, next) => {
  if (req.body !== undefined && req.body !== null && !req._body) req._body = true;
  next();
});
app.use(express.json({ limit: "2mb" }));

const TYPES = ["pg", "pgk", "bs", "match", "essay"];
const DEFAULT_PASSWORD = process.env.EXAM_ADMIN_PASSWORD || "MTsYTI2026";

/* ------------------------------------------------------------------ utils */

const nowISO = () => new Date().toISOString();

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

function examCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split(":");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanCounts(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of TYPES) out[key] = clampInt(source[key], 0, 200, 0);
  return out;
}

function cleanAnswers(raw, limits = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of TYPES) {
    const bucket = source[key];
    if (bucket && typeof bucket === "object" && !Array.isArray(bucket)) {
      const cleaned = {};
      for (const [num, value] of Object.entries(bucket)) {
        const index = Number.parseInt(num, 10);
        if (!Number.isFinite(index) || index < 1 || index > 200) continue;
        if (key === "pgk") {
          const letters = Array.isArray(value) ? value : [];
          const set = [...new Set(letters.map((l) => String(l).toUpperCase().slice(0, 1)))]
            .filter((l) => /[A-Z]/.test(l))
            .sort();
          const cap = Number(limits[String(index)]) || 0;
          if (set.length) cleaned[String(index)] = cap > 0 ? set.slice(0, cap) : set;
        } else if (key === "essay") {
          const text = String(value ?? "").slice(0, 5000);
          if (text.trim()) cleaned[String(index)] = text;
        } else {
          const letter = String(value ?? "").toUpperCase().slice(0, 1);
          if (/[A-Z]/.test(letter)) cleaned[String(index)] = letter;
        }
      }
      out[key] = cleaned;
    } else {
      out[key] = {};
    }
  }
  return out;
}

function cleanKey(raw, counts) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of TYPES) {
    if (key === "essay") {
      out.essay = [];
      continue;
    }
    const bucket = source[key];
    const list = [];
    const length = counts[key] || 0;
    for (let i = 0; i < length; i += 1) {
      const value = Array.isArray(bucket) ? bucket[i] : undefined;
      if (key === "pgk") {
        const letters = Array.isArray(value) ? value : [];
        const set = [...new Set(letters.map((l) => String(l).toUpperCase().slice(0, 1)))]
          .filter((l) => /[A-Z]/.test(l))
          .sort();
        list.push(set.length ? set : null);
      } else {
        const letter = String(value ?? "").toUpperCase().slice(0, 1);
        list.push(/[A-Z]/.test(letter) ? letter : null);
      }
    }
    out[key] = list;
  }
  return out;
}

/**
 * Batas pilihan soal PG kompleks MENGIKUTI KUNCI, bukan pengaturan ujian.
 * Soal dengan 2 jawaban benar → peserta boleh memilih 2; 3 jawaban benar → 3.
 * Yang dikirim ke peserta hanya JUMLAHNYA; huruf kuncinya tetap di server.
 */
export function pgkLimits(exam) {
  const key = Array.isArray(exam?.answer_key?.pgk) ? exam.answer_key.pgk : [];
  const out = {};
  key.forEach((value, index) => {
    const letters = Array.isArray(value) ? value.filter((letter) => /^[A-Z]$/.test(String(letter))) : [];
    if (letters.length) out[String(index + 1)] = new Set(letters).size;
  });
  return out;
}

/**
 * Jumlah huruf pilihan untuk soal PG kompleks. Guru mengaturnya di form ujian,
 * tetapi tidak pernah lebih kecil dari jumlah jawaban benar di kunci — supaya
 * peserta selalu bisa memilih semua kunci.
 */
export function pgkOptionsFor(exam) {
  const configured = clampInt(exam?.pgk_options, 2, 5, 5);
  const key = Array.isArray(exam?.answer_key?.pgk) ? exam.answer_key.pgk : [];
  const needed = key.reduce(
    (max, value) => Math.max(max, Array.isArray(value) ? new Set(value).size : 0),
    0
  );
  return Math.min(5, Math.max(configured, needed));
}

/* ---------------------------------------------------------------- poin */

/**
 * Poin per tipe soal. Inilah bobot tiap soal saat menghitung nilai:
 * nilai = (poin diperoleh ÷ total poin) × 100.
 * Ujian lama tanpa kolom `points` tetap 1 poin per soal objektif dan
 * `essay_max` poin per soal uraian — hasilnya sama seperti sebelumnya.
 */
const DEFAULT_POINTS = { pg: 1, pgk: 1, bs: 1, match: 1, essay: 10 };

function cleanPoints(raw, fallback = DEFAULT_POINTS) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_POINTS;
  const out = {};
  for (const type of TYPES) {
    const fallbackValue = clampInt(base[type], 1, 100, DEFAULT_POINTS[type]);
    out[type] = clampInt(source[type], 1, 100, fallbackValue);
  }
  return out;
}

/** Poin yang berlaku untuk sebuah ujian. */
export function pointsOf(exam) {
  const stored = exam?.points && typeof exam.points === "object" ? exam.points : null;
  if (stored) return cleanPoints(stored, DEFAULT_POINTS);
  // ujian dari versi lama: 1 poin per soal objektif, essay_max poin per uraian
  return cleanPoints({}, { ...DEFAULT_POINTS, essay: exam?.essay_max || DEFAULT_POINTS.essay });
}

/* ---------------------------------------------------------------- scoring */

function sectionsOf(counts) {
  return TYPES.filter((t) => (counts[t] || 0) > 0);
}

export function computeScore(exam, answers, manualScores) {
  const counts = exam.counts || {};
  const key = exam.answer_key || {};
  const manual = manualScores || {};
  const points = pointsOf(exam);
  const detail = { pg: [], pgk: [], bs: [], match: [] };
  let correct = 0; // jumlah soal objektif yang benar (untuk tampilan, bukan nilai)
  let total = 0; // jumlah soal objektif yang punya kunci
  let objectivePoints = 0; // poin objektif yang diperoleh
  let objectivePossible = 0; // poin objektif maksimal

  for (const type of ["pg", "pgk", "bs", "match"]) {
    const keyList = Array.isArray(key[type]) ? key[type] : [];
    const count = counts[type] || 0;
    const worth = points[type];
    for (let i = 1; i <= count; i += 1) {
      const expected = keyList[i - 1];
      const hasKey = type === "pgk" ? Array.isArray(expected) && expected.length > 0 : !!expected;
      if (!hasKey) continue;
      total += 1;
      objectivePossible += worth;
      const given = answers?.[type]?.[String(i)];
      let ok = false;
      let earnedHere = 0;
      if (type === "pgk") {
        /**
         * PG kompleks: poin dibagi rata ke jumlah jawaban benar.
         * Kunci 3 huruf = tiap huruf benar bernilai worth/3 — peserta yang baru
         * memilih 1 huruf benar tetap mendapat bagiannya. Huruf keliru tidak
         * menambah poin, jadi poin penuh hanya didapat bila semua kunci terpilih.
         */
        const givenSet = Array.isArray(given) ? given : [];
        const hits = expected.filter((letter) => givenSet.includes(letter)).length;
        earnedHere = (worth * hits) / expected.length;
        ok = hits === expected.length && givenSet.length === expected.length;
      } else {
        ok = given === expected;
        earnedHere = ok ? worth : 0;
      }
      if (ok) correct += 1;
      objectivePoints += earnedHere;
      detail[type].push({
        no: i,
        expected,
        given: given ?? null,
        correct: ok,
        points: worth,
        earned: Math.round(earnedHere * 100) / 100,
      });
    }
  }

  const essayCount = counts.essay || 0;
  const essayMax = points.essay; // poin maksimal tiap soal uraian
  const essayTotal = essayCount * essayMax;
  let essayEarned = 0;
  let essayGraded = 0;
  const essayDetail = [];
  for (let i = 1; i <= essayCount; i += 1) {
    const given = manual[String(i)];
    const graded = typeof given === "number" && Number.isFinite(given);
    if (graded) {
      essayGraded += 1;
      essayEarned += Math.min(essayMax, Math.max(0, given));
    }
    essayDetail.push({
      no: i,
      answer: answers?.essay?.[String(i)] || "",
      max: essayMax,
      score: graded ? Math.min(essayMax, Math.max(0, given)) : null,
    });
  }

  /**
   * Poin diperoleh = poin soal objektif yang benar + poin uraian dari guru.
   * Total poin = (jumlah soal ber-kunci × poin per tipe) untuk semua tipe.
   * Nilai = (poin diperoleh ÷ total poin) × 100.
   */
  const graded = essayTotal === 0 || essayGraded === essayCount;
  const earned = Math.round((objectivePoints + essayEarned) * 100) / 100;
  const possible = Math.round((objectivePossible + essayTotal) * 100) / 100;
  const nilai = graded && possible > 0 ? Math.round((earned / possible) * 10000) / 100 : null;

  return {
    points,
    objectiveCorrect: correct,
    objectiveTotal: total,
    objectiveEarned: Math.round(objectivePoints * 100) / 100,
    essayEarned,
    essayTotal,
    essayGraded,
    essayCount,
    earned,
    possible,
    nilai,
    graded,
    detail,
    essayDetail,
  };
}

function withScore(session, exam) {
  const detail = session.score_detail || computeScore(exam, session.answers, session.manual_scores);
  return {
    ...session,
    score_detail: detail,
    score: session.score !== null && session.score !== undefined ? Number(session.score) : detail?.nilai ?? null,
  };
}

/* ------------------------------------------------------------------- auth */

async function adminPasswordHash() {
  const found = await q("SELECT value FROM settings WHERE key = 'admin_password_hash'");
  if (found.rows.length) return found.rows[0].value;
  const hash = hashPassword(DEFAULT_PASSWORD);
  await q(
    "INSERT INTO settings (key, value) VALUES ('admin_password_hash', $1) ON CONFLICT (key) DO NOTHING",
    [hash]
  );
  const again = await q("SELECT value FROM settings WHERE key = 'admin_password_hash'");
  return again.rows[0]?.value || hash;
}

async function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token") || "";
  if (!token) return res.status(401).json({ error: "Sesi guru tidak ditemukan." });
  const found = await q(
    "SELECT token FROM admin_sessions WHERE token = $1 AND created_at > now() - interval '12 hours'",
    [token]
  );
  if (!found.rows.length) return res.status(401).json({ error: "Sesi guru berakhir, silakan masuk lagi." });
  next();
}

/* --- kunci pengawas: tautan siap-pakai, tanpa kata sandi guru --- */

const PROCTOR_KEY_SETTING = "proctor_key";

/**
 * Kunci pengawas disimpan di tabel settings. Satu kunci untuk seluruh madrasah,
 * bisa diganti kapan saja oleh guru — tautan lama langsung mati.
 */
async function rotateProctorKey() {
  const key = randomToken(16);
  await q(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [PROCTOR_KEY_SETTING, key]
  );
  return key;
}

async function currentProctorKey() {
  const found = await q("SELECT value FROM settings WHERE key = $1", [PROCTOR_KEY_SETTING]);
  if (found.rows.length && found.rows[0].value) return found.rows[0].value;
  return rotateProctorKey();
}

async function requireProctor(req, res, next) {
  const given = String(req.get("x-proctor-key") || req.query.k || "").trim().toLowerCase();
  if (!given) {
    return res.status(401).json({ error: "Tautan pengawas tidak lengkap. Minta tautan terbaru ke guru." });
  }
  const expected = (await currentProctorKey()).toLowerCase();
  const same =
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!same) {
    return res.status(403).json({ error: "Tautan pengawas sudah tidak berlaku. Minta tautan terbaru ke guru." });
  }
  next();
}

async function loadSession(req, res, next) {
  const token = req.get("x-session-token") || String(req.query.token || "") || req.body?.token || "";
  const found = await q("SELECT * FROM sessions WHERE id = $1", [req.params.id]);
  if (!found.rows.length) return res.status(404).json({ error: "Sesi ujian tidak ditemukan." });
  if (found.rows[0].token !== token) return res.status(403).json({ error: "Token sesi tidak cocok." });
  const exam = await q(
    "SELECT id, code, title, subject, kelas, duration_minutes, status, counts, answer_key, match_options, pg_options, pgk_options, essay_max, max_violations, instructions, points, pdf_name, pdf_size, pdf_updated_at FROM exams WHERE id = $1",
    [found.rows[0].exam_id]
  );
  if (!exam.rows.length) return res.status(404).json({ error: "Ujian tidak ditemukan." });
  req.sessionRow = found.rows[0];
  req.examRow = exam.rows[0];
  next();
}

/* ----------------------------------------------------------------- routes */

app.get("/api/health", async (_req, res) => {
  try {
    await q("SELECT 1");
    res.json({ ok: true, at: nowISO() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* --- admin auth --- */

app.post("/api/admin/login", async (req, res) => {
  const password = String(req.body?.password || "");
  const stored = await adminPasswordHash();
  if (!verifyPassword(password, stored)) {
    return res.status(401).json({ error: "Kata sandi salah." });
  }
  const token = randomToken(32);
  await q("INSERT INTO admin_sessions (token) VALUES ($1)", [token]);
  await q("DELETE FROM admin_sessions WHERE created_at < now() - interval '2 days'");
  res.json({ token });
});

app.get("/api/admin/me", requireAdmin, (_req, res) => res.json({ ok: true }));

app.post("/api/admin/password", requireAdmin, async (req, res) => {
  const current = String(req.body?.current || "");
  const next = String(req.body?.next || "");
  if (next.length < 6) return res.status(400).json({ error: "Kata sandi baru minimal 6 karakter." });
  const stored = await adminPasswordHash();
  if (!verifyPassword(current, stored)) return res.status(401).json({ error: "Kata sandi lama salah." });
  await q("UPDATE settings SET value = $1 WHERE key = 'admin_password_hash'", [hashPassword(next)]);
  await q("DELETE FROM admin_sessions");
  res.json({ ok: true });
});

app.post("/api/admin/logout", requireAdmin, async (req, res) => {
  await q("DELETE FROM admin_sessions WHERE token = $1", [req.get("x-admin-token")]);
  res.json({ ok: true });
});

/**
 * Tautan pengawas. Guru mengambil kuncinya di panel, membagikan tautannya, dan
 * pengawas cukup membuka tautan itu — tidak pernah memegang kata sandi guru.
 */
app.get("/api/admin/proctor-key", requireAdmin, async (_req, res) => {
  res.json({ key: await currentProctorKey() });
});

app.post("/api/admin/proctor-key/rotate", requireAdmin, async (_req, res) => {
  res.json({ key: await rotateProctorKey() });
});

/* --- admin exams --- */

const examPublicColumns = `id, code, title, subject, kelas, class_id, subject_id, duration_minutes, status, counts,
  answer_key, match_options, pg_options, pgk_options, essay_max, max_violations, instructions, points, pdf_name,
  pdf_size, pdf_updated_at, created_at`;

app.get("/api/admin/exams", requireAdmin, async (_req, res) => {
  const result = await q(
    `SELECT e.id, e.code, e.title, e.subject, e.kelas, e.class_id, e.subject_id, e.duration_minutes, e.status, e.counts,
            e.answer_key, e.match_options, e.pg_options, e.pgk_options, e.essay_max, e.max_violations, e.instructions,
            e.pdf_name, e.pdf_size, e.pdf_updated_at, e.created_at,
            (SELECT count(*)::int FROM sessions s WHERE s.exam_id = e.id) AS session_count,
            (SELECT count(*)::int FROM sessions s WHERE s.exam_id = e.id AND s.submitted_at IS NOT NULL) AS submitted_count
     FROM exams e ORDER BY e.created_at DESC`
  );
  res.json({ exams: result.rows });
});

/**
 * Mapel & kelas come from the school's own lists (master data), so an exam is
 * always tied to a real subject and class. Plain text stays as a fallback.
 */
async function resolveCatalog(body, current = {}) {
  const wantsSubject = body.subject_id !== undefined || body.subject !== undefined;
  const wantsClass = body.class_id !== undefined || body.kelas !== undefined;
  let subject = current.subject || "";
  let kelas = current.kelas || "";
  let subjectId = current.subject_id ?? null;
  let classId = current.class_id ?? null;

  if (body.subject_id !== undefined) {
    subjectId = body.subject_id ? clampInt(body.subject_id, 1, 1_000_000, 0) || null : null;
    if (subjectId) {
      const row = await q("SELECT name FROM subjects WHERE id = $1", [subjectId]);
      if (row.rows.length) subject = row.rows[0].name;
      else subjectId = null;
    } else {
      subject = "";
    }
  }
  if (body.class_id !== undefined) {
    classId = body.class_id ? clampInt(body.class_id, 1, 1_000_000, 0) || null : null;
    if (classId) {
      const row = await q("SELECT name FROM classes WHERE id = $1", [classId]);
      if (row.rows.length) kelas = row.rows[0].name;
      else classId = null;
    } else {
      kelas = "";
    }
  }
  if (wantsSubject && body.subject_id === undefined) subject = String(body.subject || "").trim().slice(0, 80);
  if (wantsClass && body.class_id === undefined) kelas = String(body.kelas || "").trim().slice(0, 40);
  return { subject, kelas, subjectId, classId };
}

app.post("/api/admin/exams", requireAdmin, async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || "").trim().slice(0, 160);
  if (!title) return res.status(400).json({ error: "Judul ujian wajib diisi." });
  const counts = cleanCounts(body.counts);
  const points = cleanPoints(body.points, { ...DEFAULT_POINTS, essay: body.essay_max ?? DEFAULT_POINTS.essay });
  const matchOptions = clampInt(body.match_options, 2, 26, counts.match || 4);
  const { subject, kelas, subjectId, classId } = await resolveCatalog(body);
  if (!classId) {
    return res.status(400).json({ error: "Pilih kelas (rombel) untuk ujian ini — satu ujian untuk satu rombel." });
  }
  let code = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = examCode();
    const exists = await q("SELECT 1 FROM exams WHERE code = $1", [candidate]);
    if (!exists.rows.length) {
      code = candidate;
      break;
    }
  }
  if (!code) code = examCode();
  const result = await q(
    `INSERT INTO exams (code, title, subject, kelas, class_id, subject_id, duration_minutes, status, counts,
       match_options, pg_options, pgk_options, essay_max, max_violations, instructions, points)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12,$13,$14,$15) RETURNING ${examPublicColumns}`,
    [
      code,
      title,
      subject,
      kelas,
      classId,
      subjectId,
      clampInt(body.duration_minutes, 5, 300, 60),
      counts,
      matchOptions,
      clampInt(body.pg_options, 2, 5, 4),
      clampInt(body.pgk_options, 2, 5, 5),
      points.essay, // essay_max disalin supaya layar penilaian lama tetap cocok
      clampInt(body.max_violations, 1, 20, 5),
      String(body.instructions || "").slice(0, 2000),
      points,
    ]
  );
  res.status(201).json({ exam: result.rows[0] });
});

app.get("/api/admin/exams/:id", requireAdmin, async (req, res) => {
  const result = await q(`SELECT ${examPublicColumns} FROM exams WHERE id = $1`, [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: "Ujian tidak ditemukan." });
  res.json({ exam: result.rows[0] });
});

app.patch("/api/admin/exams/:id", requireAdmin, async (req, res) => {
  const body = req.body || {};
  const found = await q(`SELECT ${examPublicColumns} FROM exams WHERE id = $1`, [req.params.id]);
  if (!found.rows.length) return res.status(404).json({ error: "Ujian tidak ditemukan." });
  const current = found.rows[0];
  const counts = body.counts ? cleanCounts(body.counts) : current.counts;
  const status = ["draft", "open", "closed"].includes(body.status) ? body.status : current.status;
  const answerKey = body.answer_key ? cleanKey(body.answer_key, counts) : cleanKey(current.answer_key, counts);
  const currentPoints = pointsOf(current);
  const points = body.points
    ? cleanPoints(body.points, currentPoints)
    : cleanPoints(currentPoints, { ...currentPoints, essay: body.essay_max ?? currentPoints.essay });
  const { subject, kelas, subjectId, classId } = await resolveCatalog(body, current);
  const result = await q(
    `UPDATE exams SET title=$1, subject=$2, kelas=$3, duration_minutes=$4, status=$5, counts=$6,
       answer_key=$7, match_options=$8, essay_max=$9, max_violations=$10, instructions=$11, pg_options=$12,
       class_id=$13, subject_id=$14, points=$15, pgk_options=$16
     WHERE id=$17 RETURNING ${examPublicColumns}`,
    [
      body.title !== undefined ? String(body.title).trim().slice(0, 160) || current.title : current.title,
      subject,
      kelas,
      body.duration_minutes !== undefined
        ? clampInt(body.duration_minutes, 5, 300, current.duration_minutes)
        : current.duration_minutes,
      status,
      counts,
      answerKey,
      body.match_options !== undefined
        ? clampInt(body.match_options, 2, 26, current.match_options)
        : current.match_options,
      points.essay, // essay_max mengikuti poin uraian
      body.max_violations !== undefined
        ? clampInt(body.max_violations, 1, 20, current.max_violations)
        : current.max_violations,
      body.instructions !== undefined ? String(body.instructions).slice(0, 2000) : current.instructions,
      body.pg_options !== undefined ? clampInt(body.pg_options, 2, 5, current.pg_options) : current.pg_options,
      classId,
      subjectId,
      points,
      body.pgk_options !== undefined
        ? clampInt(body.pgk_options, 2, 5, current.pgk_options ?? 5)
        : current.pgk_options,
      req.params.id,
    ]
  );
  res.json({ exam: result.rows[0] });
});

app.delete("/api/admin/exams/:id", requireAdmin, async (req, res) => {
  await q("DELETE FROM exams WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

/* --- master data: kelas, mapel, siswa --- */

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get(
  "/api/admin/catalog",
  requireAdmin,
  wrap(async (_req, res) => {
    const classes = await q(
      `SELECT c.id, c.name, c.level, c.sort,
              (SELECT count(*)::int FROM students s WHERE s.class_id = c.id AND s.active) AS student_count
       FROM classes c ORDER BY c.sort, c.name`
    );
    const subjects = await q(
      `SELECT s.id, s.name,
              (SELECT count(*)::int FROM exams e WHERE e.subject_id = s.id) AS exam_count
       FROM subjects s ORDER BY s.name`
    );
    const students = await q(
      `SELECT s.id, s.name, s.nis, s.class_id, s.active FROM students s ORDER BY s.name`
    );
    res.json({ classes: classes.rows, subjects: subjects.rows, students: students.rows });
  })
);

app.post(
  "/api/admin/classes",
  requireAdmin,
  wrap(async (req, res) => {
    const name = String(req.body?.name || "").trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: "Nama kelas wajib diisi." });
    const level = String(req.body?.level || name.slice(0, 1)).trim().slice(0, 10);
    const exists = await q("SELECT 1 FROM classes WHERE lower(name) = lower($1)", [name]);
    if (exists.rows.length) return res.status(409).json({ error: "Kelas itu sudah ada." });
    const row = await q(
      `INSERT INTO classes (name, level, sort)
       VALUES ($1,$2,(SELECT COALESCE(MAX(sort),0)+1 FROM classes))
       RETURNING id, name, level, 0 AS student_count`,
      [name, level]
    );
    res.status(201).json({ class: row.rows[0] });
  })
);

app.patch(
  "/api/admin/classes/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = clampInt(req.params.id, 1, 1_000_000, 0);
    const name = String(req.body?.name || "").trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: "Nama kelas wajib diisi." });
    const dup = await q("SELECT 1 FROM classes WHERE lower(name) = lower($1) AND id <> $2", [name, id]);
    if (dup.rows.length) return res.status(409).json({ error: "Nama kelas itu sudah dipakai." });
    const row = await q("UPDATE classes SET name = $1 WHERE id = $2 RETURNING id, name, level", [name, id]);
    if (!row.rows.length) return res.status(404).json({ error: "Kelas tidak ditemukan." });
    // keep the label on exams in sync
    await q("UPDATE exams SET kelas = $1 WHERE class_id = $2", [name, id]);
    res.json({ class: row.rows[0] });
  })
);

app.delete(
  "/api/admin/classes/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = clampInt(req.params.id, 1, 1_000_000, 0);
    await q("DELETE FROM classes WHERE id = $1", [id]);
    res.json({ ok: true });
  })
);

app.post(
  "/api/admin/subjects",
  requireAdmin,
  wrap(async (req, res) => {
    const name = String(req.body?.name || "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Nama mapel wajib diisi." });
    const exists = await q("SELECT 1 FROM subjects WHERE lower(name) = lower($1)", [name]);
    if (exists.rows.length) return res.status(409).json({ error: "Mapel itu sudah ada." });
    const row = await q("INSERT INTO subjects (name) VALUES ($1) RETURNING id, name, 0 AS exam_count", [name]);
    res.status(201).json({ subject: row.rows[0] });
  })
);

app.patch(
  "/api/admin/subjects/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = clampInt(req.params.id, 1, 1_000_000, 0);
    const name = String(req.body?.name || "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Nama mapel wajib diisi." });
    const dup = await q("SELECT 1 FROM subjects WHERE lower(name) = lower($1) AND id <> $2", [name, id]);
    if (dup.rows.length) return res.status(409).json({ error: "Nama mapel itu sudah dipakai." });
    const row = await q("UPDATE subjects SET name = $1 WHERE id = $2 RETURNING id, name", [name, id]);
    if (!row.rows.length) return res.status(404).json({ error: "Mapel tidak ditemukan." });
    await q("UPDATE exams SET subject = $1 WHERE subject_id = $2", [name, id]);
    res.json({ subject: row.rows[0] });
  })
);

app.delete(
  "/api/admin/subjects/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = clampInt(req.params.id, 1, 1_000_000, 0);
    await q("DELETE FROM subjects WHERE id = $1", [id]);
    res.json({ ok: true });
  })
);

app.post(
  "/api/admin/students",
  requireAdmin,
  wrap(async (req, res) => {
    const classId = clampInt(req.body?.classId, 1, 1_000_000, 0);
    if (!classId) return res.status(400).json({ error: "Pilih kelas terlebih dahulu." });
    const kelas = await q("SELECT id FROM classes WHERE id = $1", [classId]);
    if (!kelas.rows.length) return res.status(404).json({ error: "Kelas tidak ditemukan." });

    const rawNames = Array.isArray(req.body?.names)
      ? req.body.names
      : String(req.body?.name || "").split(/\r?\n/);
    const names = rawNames
      .map((value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 80))
      .filter((value) => value.length >= 2)
      .slice(0, 200);
    if (!names.length) return res.status(400).json({ error: "Nama siswa wajib diisi." });

    const nis = String(req.body?.nis || "").trim().slice(0, 30);
    let added = 0;
    for (const name of names) {
      const inserted = await q(
        "INSERT INTO students (class_id, name, nis) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
        [classId, name, names.length === 1 ? nis : ""]
      );
      added += inserted.rows.length;
    }
    res.status(201).json({ added, skipped: names.length - added });
  })
);

app.patch(
  "/api/admin/students/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = clampInt(req.params.id, 1, 1_000_000, 0);
    const found = await q("SELECT * FROM students WHERE id = $1", [id]);
    if (!found.rows.length) return res.status(404).json({ error: "Siswa tidak ditemukan." });
    const current = found.rows[0];
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 80) : current.name;
    if (!name) return res.status(400).json({ error: "Nama siswa wajib diisi." });
    const classId = req.body?.classId !== undefined ? clampInt(req.body.classId, 1, 1_000_000, current.class_id) : current.class_id;
    const nis = req.body?.nis !== undefined ? String(req.body.nis).trim().slice(0, 30) : current.nis;
    const active = req.body?.active !== undefined ? !!req.body.active : current.active;
    const row = await q(
      "UPDATE students SET name=$1, class_id=$2, nis=$3, active=$4 WHERE id=$5 RETURNING id, name, nis, class_id, active",
      [name, classId, nis, active, id]
    );
    res.json({ student: row.rows[0] });
  })
);

app.delete(
  "/api/admin/students/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const id = clampInt(req.params.id, 1, 1_000_000, 0);
    await q("DELETE FROM students WHERE id = $1", [id]);
    res.json({ ok: true });
  })
);

/* --- Supabase Storage (PDF besar, untuk deploy Vercel) --- */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "exam-files";
const storageEnabled = !!(SUPABASE_URL && SUPABASE_KEY);

async function storageFetch(path, init = {}) {
  return fetch(`${SUPABASE_URL}/storage/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(init.headers || {}),
    },
  });
}

async function ensureBucket() {
  const head = await storageFetch(`/bucket/${SUPABASE_BUCKET}`);
  if (head.ok) return true;
  const create = await storageFetch("/bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: SUPABASE_BUCKET, name: SUPABASE_BUCKET, public: false }),
  });
  return create.ok || create.status === 409;
}

const absoluteStorageUrl = (url) => (url?.startsWith("http") ? url : `${SUPABASE_URL}/storage/v1${url || ""}`);

const DIRECT_UPLOAD_LIMIT = process.env.VERCEL ? 4 * 1024 * 1024 : 40 * 1024 * 1024;

app.post("/api/admin/exams/:id/pdf/upload-url", requireAdmin, async (req, res) => {
  if (!storageEnabled) return res.json({ mode: "direct", maxBytes: DIRECT_UPLOAD_LIMIT });
  const examId = clampInt(req.params.id, 1, 1_000_000, 0);
  const exists = await q("SELECT 1 FROM exams WHERE id = $1", [examId]);
  if (!exists.rows.length) return res.status(404).json({ error: "Ujian tidak ditemukan." });
  try {
    await ensureBucket();
    const path = `exam-${examId}/soal-${Date.now()}.pdf`;
    const created = await storageFetch(`/object/upload/sign/${SUPABASE_BUCKET}/${path}`, { method: "POST" });
    if (!created.ok) throw new Error(`sign ${created.status}`);
    const payload = await created.json();
    res.json({
      mode: "storage",
      path,
      uploadUrl: absoluteStorageUrl(payload.url || payload.signedUrl),
      maxBytes: 200 * 1024 * 1024,
    });
  } catch (err) {
    console.error("[storage] upload sign failed:", err.message);
    res.json({ mode: "direct" });
  }
});

app.post("/api/admin/exams/:id/pdf/record", requireAdmin, async (req, res) => {
  const examId = clampInt(req.params.id, 1, 1_000_000, 0);
  const path = String(req.body?.path || "").slice(0, 300);
  if (!storageEnabled || !path) return res.status(400).json({ error: "Berkas tidak dikenali." });
  let name = String(req.body?.name || "soal.pdf").replace(/[\r\n"]/g, "").slice(0, 160) || "soal.pdf";
  const size = clampInt(req.body?.size, 0, 200 * 1024 * 1024, 0);
  try {
    const info = await storageFetch(`/object/info/${SUPABASE_BUCKET}/${path}`);
    if (!info.ok) return res.status(400).json({ error: "Berkas belum terunggah. Coba lagi." });
  } catch {
    return res.status(400).json({ error: "Berkas belum terunggah. Coba lagi." });
  }
  const result = await q(
    `UPDATE exams SET pdf = NULL, pdf_path = $1, pdf_name = $2, pdf_size = $3, pdf_updated_at = now()
     WHERE id = $4 RETURNING id, pdf_name, pdf_size, pdf_updated_at`,
    [path, name, size, examId]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Ujian tidak ditemukan." });
  res.json({ exam: result.rows[0] });
});

/* --- PDF --- */

app.put(
  "/api/admin/exams/:id/pdf",
  requireAdmin,
  express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "40mb" }),
  async (req, res) => {
    const buffer = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buffer || buffer.length < 100) return res.status(400).json({ error: "File PDF tidak terbaca." });
    const header = buffer.subarray(0, 5).toString("latin1");
    if (!header.includes("%PDF")) return res.status(400).json({ error: "File harus berformat PDF." });
    let name = String(req.get("x-file-name") || "soal.pdf");
    try {
      name = decodeURIComponent(name);
    } catch {
      /* keep the raw value */
    }
    name = name.replace(/[\r\n"]/g, "").slice(0, 160) || "soal.pdf";
    const result = await q(
      `UPDATE exams SET pdf=$1, pdf_path=NULL, pdf_name=$2, pdf_size=$3, pdf_updated_at=now() WHERE id=$4
       RETURNING id, pdf_name, pdf_size, pdf_updated_at`,
      [buffer, name, buffer.length, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Ujian tidak ditemukan." });
    res.json({ exam: result.rows[0] });
  }
);

async function sendPdf(examId, res) {
  const result = await q("SELECT pdf, pdf_path, pdf_name, pdf_updated_at FROM exams WHERE id = $1", [examId]);
  if (!result.rows.length) return res.status(404).json({ error: "PDF soal belum diunggah." });
  const row = result.rows[0];

  // stored in Supabase Storage: hand the browser a short-lived direct link
  if (row.pdf_path && storageEnabled) {
    try {
      const signed = await storageFetch(`/object/sign/${SUPABASE_BUCKET}/${row.pdf_path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      if (signed.ok) {
        const payload = await signed.json();
        res.setHeader("Cache-Control", "no-store");
        return res.redirect(302, absoluteStorageUrl(payload.signedURL || payload.signedUrl));
      }
    } catch (err) {
      console.error("[storage] sign download failed:", err.message);
    }
  }

  if (!row.pdf) return res.status(404).json({ error: "PDF soal belum diunggah." });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${(row.pdf_name || "soal.pdf").replace(/"/g, "")}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(row.pdf);
}

app.get("/api/admin/exams/:id/pdf", requireAdmin, async (req, res) => {
  await sendPdf(req.params.id, res);
});

/* --- student: public exam info --- */

app.get("/api/exams/:code", async (req, res) => {
  const result = await q(
    `SELECT id, code, title, subject, kelas, class_id, duration_minutes, status, counts, match_options, pg_options,
            pgk_options, essay_max, max_violations, instructions, pdf_name, pdf_size, pdf_updated_at
     FROM exams WHERE upper(code) = upper($1)`,
    [req.params.code]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Kode ujian tidak ditemukan." });
  const exam = result.rows[0];
  res.json({
    exam: {
      ...exam,
      hasPdf: !!exam.pdf_updated_at,
    },
  });
});

/* --- student: sessions --- */

function publicSession(session, exam) {
  const deadline = new Date(session.deadline).getTime();
  const detail = session.score_detail || computeScore(exam, session.answers || {}, session.manual_scores);
  const submitted = !!session.submitted_at;
  return {
    id: session.id,
    token: session.token,
    examId: session.exam_id,
    studentName: session.student_name,
    studentClass: session.student_class,
    answers: session.answers || {},
    violations: session.violations || 0,
    maxViolations: exam.max_violations,
    startedAt: session.started_at,
    submittedAt: session.submitted_at,
    deadline: session.deadline,
    remainingSeconds: Math.max(0, Math.floor((deadline - Date.now()) / 1000)),
    submitted,
    autoSubmitted: !!session.auto_submitted,
    score: submitted ? detail : null,
    pdfUpdatedAt: exam.pdf_updated_at,
    counts: exam.counts,
    essayMax: exam.essay_max,
    matchOptions: exam.match_options,
    pgOptions: exam.pg_options,
    /** jumlah huruf pilihan soal PG kompleks (tidak pernah kurang dari jumlah kunci) */
    pgkOptions: pgkOptionsFor(exam),
    /** batas pilihan per nomor untuk soal PG kompleks (dari kunci jawaban) */
    pgkLimits: pgkLimits(exam),
    exam: {
      id: exam.id,
      code: exam.code,
      title: exam.title,
      subject: exam.subject,
      kelas: exam.kelas,
      durationMinutes: exam.duration_minutes,
      instructions: exam.instructions,
      maxViolations: exam.max_violations,
      counts: exam.counts,
    },
  };
}

/** daftar kelas + jumlah siswa, dipakai halaman login peserta */
app.get("/api/classes", async (_req, res) => {
  const result = await q(
    `SELECT c.id, c.name, c.level,
            (SELECT count(*)::int FROM students s WHERE s.class_id = c.id AND s.active) AS student_count
     FROM classes c ORDER BY c.sort, c.name`
  );
  res.json({ classes: result.rows });
});

app.get("/api/classes/:id/students", async (req, res) => {
  const result = await q(
    "SELECT id, name, nis FROM students WHERE class_id = $1 AND active ORDER BY name",
    [clampInt(req.params.id, 1, 1_000_000, 0)]
  );
  res.json({ students: result.rows });
});

app.post("/api/exams/:code/sessions", async (req, res) => {
  const studentId = clampInt(req.body?.studentId, 1, 1_000_000, 0);
  if (!studentId) return res.status(400).json({ error: "Pilih nama siswa terlebih dahulu." });

  const found = await q("SELECT * FROM exams WHERE upper(code) = upper($1)", [req.params.code]);
  if (!found.rows.length) return res.status(404).json({ error: "Token ujian tidak ditemukan." });
  const exam = found.rows[0];

  const studentRow = await q(
    `SELECT s.id, s.name, s.class_id, c.name AS class_name
     FROM students s JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1 AND s.active`,
    [studentId]
  );
  if (!studentRow.rows.length) return res.status(404).json({ error: "Siswa tidak ditemukan." });
  const student = studentRow.rows[0];

  if (exam.status !== "open") {
    return res.status(403).json({ error: "Ujian ini belum dibuka atau sudah ditutup oleh guru." });
  }
  if (!exam.pdf_updated_at) {
    return res.status(400).json({ error: "Naskah soal (PDF) belum diunggah oleh guru." });
  }
  if (exam.class_id && exam.class_id !== student.class_id) {
    return res
      .status(403)
      .json({ error: `Token ini untuk kelas ${exam.kelas || "lain"}. Kamu terdaftar di kelas ${student.class_name}.` });
  }

  // one attempt per student: resume the running one, otherwise show the finished one
  const existing = await q(
    `SELECT * FROM sessions WHERE exam_id = $1 AND student_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [exam.id, student.id]
  );
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (!row.submitted_at && new Date(row.deadline).getTime() > Date.now()) {
      return res.json({ session: publicSession(row, exam), resumed: true });
    }
    const finished = row.submitted_at ? row : await finalize(row, exam, true);
    return res.json({ session: publicSession(finished, exam), alreadySubmitted: true });
  }

  const deadline = new Date(Date.now() + exam.duration_minutes * 60 * 1000);
  const created = await q(
    `INSERT INTO sessions (exam_id, student_id, token, student_name, student_class, deadline, last_seen)
     VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING *`,
    [exam.id, student.id, randomToken(20), student.name, student.class_name, deadline]
  );
  await q("INSERT INTO events (session_id, type, detail) VALUES ($1,'start','mulai ujian')", [
    created.rows[0].id,
  ]);
  res.status(201).json({ session: publicSession(created.rows[0], exam) });
});

app.get("/api/sessions/:id", loadSession, async (req, res) => {
  const session = req.sessionRow;
  const exam = req.examRow;
  let row = session;
  if (!session.submitted_at && new Date(session.deadline).getTime() <= Date.now()) {
    row = await finalize(row, exam, true);
  }
  await q("UPDATE sessions SET last_seen = now() WHERE id = $1", [session.id]);
  res.json({ session: publicSession(row, exam) });
});

async function finalize(session, exam, auto) {
  const detail = computeScore(exam, session.answers, session.manual_scores);
  const result = await q(
    `UPDATE sessions SET submitted_at = COALESCE(submitted_at, now()), auto_submitted = $2,
       score = $3, score_detail = $4
     WHERE id = $1 RETURNING *`,
    [session.id, !!auto, detail.nilai, detail]
  );
  if (auto) {
    await q("INSERT INTO events (session_id, type, detail) VALUES ($1,'auto-submit','waktu habis')", [
      session.id,
    ]);
  }
  return result.rows[0] || session;
}

app.put("/api/sessions/:id/answers", loadSession, async (req, res) => {
  const session = req.sessionRow;
  if (session.submitted_at) return res.status(409).json({ error: "Ujian sudah dikumpulkan." });
  if (new Date(session.deadline).getTime() <= Date.now()) {
    const row = await finalize(session, req.examRow, true);
    return res.status(409).json({ error: "Waktu ujian habis.", session: publicSession(row, req.examRow) });
  }
  const answers = cleanAnswers(req.body?.answers, pgkLimits(req.examRow));
  const updated = await q(
    "UPDATE sessions SET answers = $2, last_seen = now() WHERE id = $1 RETURNING *",
    [session.id, answers]
  );
  res.json({ ok: true, savedAt: nowISO(), answers: updated.rows[0].answers });
});

app.post("/api/sessions/:id/violations", loadSession, async (req, res) => {
  const session = req.sessionRow;
  const type = String(req.body?.type || "unknown").slice(0, 40);
  const detail = String(req.body?.detail || "").slice(0, 200);
  if (session.submitted_at) return res.json({ violations: session.violations, locked: false, submitted: true });
  const updated = await q(
    "UPDATE sessions SET violations = violations + 1 WHERE id = $1 RETURNING violations, submitted_at",
    [session.id]
  );
  await q("INSERT INTO events (session_id, type, detail) VALUES ($1,$2,$3)", [session.id, type, detail]);
  const violations = updated.rows[0].violations;
  let locked = false;
  let submitted = !!updated.rows[0].submitted_at;
  if (violations > req.examRow.max_violations) {
    locked = true;
    const row = updated.rows[0].submitted_at
      ? session
      : await finalize(session, req.examRow, true);
    submitted = true;
    await q("INSERT INTO events (session_id, type, detail) VALUES ($1,'lock','batas pelanggaran terlampaui')", [
      session.id,
    ]);
    return res.json({ violations, locked, submitted, session: publicSession(row, req.examRow) });
  }
  res.json({ violations, locked, submitted, maxViolations: req.examRow.max_violations });
});

app.post("/api/sessions/:id/submit", loadSession, async (req, res) => {
  const session = req.sessionRow;
  if (session.submitted_at) {
    return res.json({ session: publicSession(withScore(session, req.examRow), req.examRow) });
  }
  const answers = req.body?.answers ? cleanAnswers(req.body.answers, pgkLimits(req.examRow)) : session.answers;
  const updated = await q("UPDATE sessions SET answers = $2 WHERE id = $1 RETURNING *", [
    session.id,
    answers,
  ]);
  const row = await finalize({ ...updated.rows[0] }, req.examRow, false);
  await q("INSERT INTO events (session_id, type, detail) VALUES ($1,'submit','dikumpulkan siswa')", [
    session.id,
  ]);
  res.json({ session: publicSession(row, req.examRow) });
});

app.get("/api/sessions/:id/pdf", loadSession, async (req, res) => {
  await sendPdf(req.sessionRow.exam_id, res);
});

/* --- admin: results --- */

/**
 * Papan pantau: keadaan ujian saat ini untuk pengawas — sesi yang sedang berjalan,
 * jumlah soal terjawab, dan aliran kejadian (pelanggaran, mulai, kumpul).
 */
const MONITOR_EVENT_LIMIT = 80;

/** Jumlah butir yang sudah dijawab, dihitung dari jsonb answers. */
function answeredTotal(answers) {
  const source = answers && typeof answers === "object" ? answers : {};
  let total = 0;
  for (const type of TYPES) {
    const bucket = source[type];
    if (!bucket || typeof bucket !== "object") continue;
    for (const value of Object.values(bucket)) {
      if (Array.isArray(value)) {
        if (value.length) total += 1;
      } else if (String(value ?? "").trim() !== "") {
        total += 1;
      }
    }
  }
  return total;
}

/**
 * Satu sumber data untuk papan pantau. Dipakai panel guru dan halaman pengawas,
 * jadi isinya harus aman untuk keduanya: kunci jawaban tidak pernah ikut.
 */
async function monitorSnapshot(examId) {
  const examRow = await q(`SELECT ${examPublicColumns} FROM exams WHERE id = $1`, [examId]);
  if (!examRow.rows.length) return null;
  const { answer_key: _answerKey, ...exam } = examRow.rows[0];

  const sessions = await q(
    `SELECT id, student_name, student_class, violations, answers, started_at, deadline,
            submitted_at, auto_submitted, last_seen, graded_at
     FROM sessions WHERE exam_id = $1 ORDER BY started_at ASC`,
    [examId]
  );

  const events = await q(
    `SELECT e.id, e.type, e.detail, e.at, e.session_id, s.student_name, s.student_class
     FROM events e JOIN sessions s ON s.id = e.session_id
     WHERE s.exam_id = $1
     ORDER BY e.id DESC
     LIMIT ${MONITOR_EVENT_LIMIT}`,
    [examId]
  );

  return {
    exam,
    now: nowISO(),
    sessions: sessions.rows.map((row) => ({
      id: row.id,
      studentName: row.student_name,
      studentClass: row.student_class,
      violations: row.violations || 0,
      answered: answeredTotal(row.answers),
      startedAt: row.started_at,
      deadline: row.deadline,
      submittedAt: row.submitted_at,
      autoSubmitted: !!row.auto_submitted,
      lastSeen: row.last_seen,
      graded: !!row.graded_at,
    })),
    events: events.rows.map((row) => ({
      id: Number(row.id),
      type: row.type,
      detail: row.detail,
      at: row.at,
      sessionId: row.session_id,
      studentName: row.student_name,
      studentClass: row.student_class,
    })),
  };
}

app.get("/api/admin/exams/:id/monitor", requireAdmin, async (req, res) => {
  const snapshot = await monitorSnapshot(clampInt(req.params.id, 1, 1_000_000, 0));
  if (!snapshot) return res.status(404).json({ error: "Ujian tidak ditemukan." });
  res.json(snapshot);
});

/* ---- sisi pengawas: hanya baca, tanpa akses ke panel guru ---- */

app.get("/api/proctor/exams", requireProctor, async (_req, res) => {
  const result = await q(
    `SELECT e.id, e.code, e.title, e.subject, e.kelas, e.duration_minutes, e.status,
            (SELECT count(*)::int FROM sessions s WHERE s.exam_id = e.id) AS session_count,
            (SELECT count(*)::int FROM sessions s WHERE s.exam_id = e.id AND s.submitted_at IS NOT NULL) AS submitted_count
     FROM exams e
     WHERE e.status = 'open'
     ORDER BY e.created_at DESC`
  );
  res.json({ exams: result.rows });
});

app.get("/api/proctor/exams/:id/monitor", requireProctor, async (req, res) => {
  const snapshot = await monitorSnapshot(clampInt(req.params.id, 1, 1_000_000, 0));
  if (!snapshot) return res.status(404).json({ error: "Ujian tidak ditemukan." });
  res.json(snapshot);
});

app.get("/api/admin/exams/:id/sessions", requireAdmin, async (req, res) => {
  const examRow = await q(`SELECT ${examPublicColumns} FROM exams WHERE id = $1`, [req.params.id]);
  if (!examRow.rows.length) return res.status(404).json({ error: "Ujian tidak ditemukan." });
  const exam = examRow.rows[0];
  const rows = await q(
    `SELECT id, student_name, student_class, violations, started_at, submitted_at, auto_submitted,
            score, score_detail, manual_scores, deadline
     FROM sessions WHERE exam_id = $1 ORDER BY submitted_at DESC NULLS LAST, started_at ASC`,
    [req.params.id]
  );
  res.json({
    exam,
    sessions: rows.rows.map((row) => {
      const detail = row.score_detail || computeScore(exam, row.answers || {}, row.manual_scores);
      return {
        id: row.id,
        studentName: row.student_name,
        studentClass: row.student_class,
        violations: row.violations,
        startedAt: row.started_at,
        submittedAt: row.submitted_at,
        autoSubmitted: row.auto_submitted,
        deadline: row.deadline,
        manualScores: row.manual_scores || {},
        score: detail,
      };
    }),
  });
});

app.get("/api/admin/sessions/:id", requireAdmin, async (req, res) => {
  const found = await q("SELECT * FROM sessions WHERE id = $1", [req.params.id]);
  if (!found.rows.length) return res.status(404).json({ error: "Sesi tidak ditemukan." });
  const session = found.rows[0];
  const examRow = await q(`SELECT ${examPublicColumns} FROM exams WHERE id = $1`, [session.exam_id]);
  const exam = examRow.rows[0];
  const events = await q("SELECT type, detail, at FROM events WHERE session_id = $1 ORDER BY at DESC LIMIT 100", [
    session.id,
  ]);
  res.json({
    exam,
    session: {
      id: session.id,
      studentName: session.student_name,
      studentClass: session.student_class,
      answers: session.answers,
      violations: session.violations,
      startedAt: session.started_at,
      submittedAt: session.submitted_at,
      autoSubmitted: session.auto_submitted,
      manualScores: session.manual_scores || {},
      score: computeScore(exam, session.answers || {}, session.manual_scores),
    },
    events: events.rows,
  });
});

app.post("/api/admin/sessions/:id/grade", requireAdmin, async (req, res) => {
  const found = await q("SELECT * FROM sessions WHERE id = $1", [req.params.id]);
  if (!found.rows.length) return res.status(404).json({ error: "Sesi tidak ditemukan." });
  const session = found.rows[0];
  const examRow = await q(`SELECT ${examPublicColumns} FROM exams WHERE id = $1`, [session.exam_id]);
  const exam = examRow.rows[0];
  const raw = req.body?.scores && typeof req.body.scores === "object" ? req.body.scores : {};
  const scores = {};
  for (const [num, value] of Object.entries(raw)) {
    const index = Number.parseInt(num, 10);
    const score = Number(value);
    if (!Number.isFinite(index) || index < 1 || index > (exam.counts.essay || 0)) continue;
    if (!Number.isFinite(score)) continue;
    scores[String(index)] = Math.min(exam.essay_max, Math.max(0, Math.round(score * 100) / 100));
  }
  const detail = computeScore(exam, session.answers || {}, scores);
  const updated = await q(
    `UPDATE sessions SET manual_scores = $2, score_detail = $3, score = $4, graded_at = now()
     WHERE id = $1 RETURNING *`,
    [session.id, scores, detail, detail.nilai]
  );
  res.json({ session: { ...updated.rows[0], score: detail } });
});

app.delete("/api/admin/sessions/:id", requireAdmin, async (req, res) => {
  await q("DELETE FROM sessions WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

/**
 * Kop hasil ujian. Nama madrasah, tahun pelajaran, dan nama penanda tangan
 * dibaca dari tabel settings bila ada; kalau tidak, dipakai nilai bawaan di
 * exportData.js. Semua kunci ini opsional.
 */
const LETTER_SETTINGS = [
  "madrasah_name",
  "madrasah_city",
  "academic_year",
  "madrasah_head",
  "subject_teacher",
];

async function letterSettings() {
  try {
    const found = await q("SELECT key, value FROM settings WHERE key = ANY($1)", [LETTER_SETTINGS]);
    const out = {};
    for (const row of found.rows) {
      const value = String(row.value ?? "").trim();
      if (value) out[row.key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Data bersama untuk ekspor PDF dan Excel. */
async function exportPayload(req) {
  const examRow = await q(`SELECT ${examPublicColumns} FROM exams WHERE id = $1`, [req.params.id]);
  if (!examRow.rows.length) return null;
  const exam = examRow.rows[0];
  const sessions = await q(
    "SELECT * FROM sessions WHERE exam_id = $1 ORDER BY student_class ASC, student_name ASC",
    [req.params.id]
  );
  return {
    exam,
    sessions: sessions.rows,
    settings: await letterSettings(),
    scoreOf: (session) => session.score_detail || computeScore(exam, session.answers || {}, session.manual_scores),
  };
}

app.get("/api/admin/exams/:id/export.pdf", requireAdmin, async (req, res) => {
  const payload = await exportPayload(req);
  if (!payload) return res.status(404).json({ error: "Ujian tidak ditemukan." });
  const bytes = await buildResultPdf(payload);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="hasil-${payload.exam.code}.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(bytes));
});

app.get("/api/admin/exams/:id/export.xlsx", requireAdmin, async (req, res) => {
  const payload = await exportPayload(req);
  if (!payload) return res.status(404).json({ error: "Ujian tidak ditemukan." });
  const buffer = await buildResultXlsx(payload);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="hasil-${payload.exam.code}.xlsx"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(buffer);
});

/* --- sweep expired sessions --- */

const sweep = async () => {
  try {
    const expired = await q(
      `SELECT s.* FROM sessions s WHERE s.submitted_at IS NULL AND s.deadline <= now() LIMIT 25`
    );
    for (const row of expired.rows) {
      const examRow = await q("SELECT * FROM exams WHERE id = $1", [row.exam_id]);
      if (examRow.rows.length) await finalize(row, examRow.rows[0], true);
    }
  } catch (err) {
    console.error("[sweep]", err.message);
  }
};

if (!process.env.VERCEL) {
  setInterval(sweep, 60_000).unref?.();
}

app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint tidak ditemukan." }));

app.use((err, _req, res, _next) => {
  console.error("[api error]", err);
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "File terlalu besar (maksimal 40 MB)." });
  }
  res.status(500).json({ error: "Terjadi kesalahan di server." });
});

export default app;
export { initSchema };
