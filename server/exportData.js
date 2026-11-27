/**
 * Data untuk kop dan tabel hasil ujian — dipakai bersama oleh ekspor PDF dan
 * Excel, supaya angka di kedua berkas selalu sama.
 */

/** Tahun pelajaran di kop. Bisa ditimpa lewat baris `academic_year` di tabel settings. */
export const ACADEMIC_YEAR = "2026/2027";

/** Nama madrasah di kop. Bisa ditimpa lewat baris `madrasah_name` di tabel settings. */
export const MADRASAH_NAME = "MTs YTI Sukamerang";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** 2026-01-12 → "12 Januari 2026" */
export function formatTanggal(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Judul di kop. Ujian madrasah hanya memakai dua nama: ASAS Ganjil dan ASAT
 * Genap, jadi judulnya dibakukan — singkatan dalam kurung seperti di berkas
 * resmi madrasah. Judul lain ditampilkan apa adanya.
 */
export function examHeading(exam) {
  const title = String(exam?.title || "").trim();
  const upper = title.toUpperCase();
  if (upper.startsWith("ASAS")) {
    const sisa = title.replace(/^ASAS\s*/i, "").trim();
    return `Hasil Asesmen Sumatif Akhir Semester (ASAS)${sisa ? ` ${sisa}` : ""}`;
  }
  if (upper.startsWith("ASAT")) {
    const sisa = title.replace(/^ASAT\s*/i, "").trim();
    return `Hasil Asesmen Sumatif Akhir Tahun (ASAT)${sisa ? ` ${sisa}` : ""}`;
  }
  return `Hasil ${title || "Ujian"}`;
}

/** Isi kop + kotak informasi. */
export function letterInfo(exam, sessions, settings) {
  const tanggalUjian =
    (sessions || [])
      .map((row) => row.started_at)
      .filter(Boolean)
      .sort()[0] || exam?.created_at || null;
  return {
    heading: examHeading(exam),
    madrasah: String(settings?.madrasah_name || "").trim() || MADRASAH_NAME,
    academicYear: String(settings?.academic_year || "").trim() || ACADEMIC_YEAR,
    tempat: String(settings?.madrasah_city || "").trim() || "Sukamerang",
    items: [
      { label: "Nama Mata Pelajaran", value: String(exam?.subject || "").trim() || "-" },
      { label: "Kelas", value: String(exam?.kelas || "").trim() || "-" },
      { label: "Tanggal Ujian", value: formatTanggal(tanggalUjian) },
    ],
    headName: String(settings?.madrasah_head || "").trim(),
    teacherName: String(settings?.subject_teacher || "").trim(),
  };
}

/** "83,33" — koma desimal seperti tulisan Indonesia. */
export function fmtNum(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const rounded = Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
  return text.replace(".", ",");
}

/**
 * Satu baris tabel per peserta. `scoreOf(session)` mengembalikan rincian nilai
 * (hasil computeScore) untuk sesi yang sudah dikumpulkan.
 */
export function resultRows(sessions, scoreOf) {
  return (sessions || []).map((session, index) => {
    const submitted = !!session.submitted_at;
    const detail = submitted ? scoreOf(session) : null;
    const hitung = (jenis) => {
      const list = detail?.detail?.[jenis] || [];
      return {
        benar: list.filter((item) => item.correct).length,
        total: list.length,
      };
    };
    return {
      no: index + 1,
      nama: String(session.student_name || "").trim() || "-",
      submitted,
      pg: hitung("pg"),
      pgk: hitung("pgk"),
      bs: hitung("bs"),
      match: hitung("match"),
      essay: { earned: detail?.essayEarned ?? 0, total: detail?.essayTotal ?? 0 },
      nilai: detail?.nilai ?? null,
    };
  });
}

/** "18/20" — jumlah benar dari jumlah soal yang punya kunci. */
export function countText(row, key) {
  if (!row.submitted) return "-";
  const item = row[key];
  return item.total > 0 ? `${item.benar}/${item.total}` : "-";
}

/** "7/10" — poin uraian yang diperoleh dari poin maksimal. */
export function essayText(row) {
  if (!row.submitted) return "-";
  return row.essay.total > 0 ? `${fmtNum(row.essay.earned)}/${fmtNum(row.essay.total)}` : "-";
}

/** Total nilai; tanda "–" bila peserta belum selesai atau uraian belum dinilai. */
export function nilaiText(row) {
  if (!row.submitted) return "-";
  if (row.nilai === null || row.nilai === undefined) return "belum dinilai";
  return fmtNum(row.nilai);
}

/** Baris tabel siap gambar: satu kunci per kolom. */
export function tableCells(row) {
  return [
    String(row.no),
    row.nama,
    countText(row, "pg"),
    countText(row, "pgk"),
    countText(row, "bs"),
    countText(row, "match"),
    essayText(row),
    nilaiText(row),
  ];
}
