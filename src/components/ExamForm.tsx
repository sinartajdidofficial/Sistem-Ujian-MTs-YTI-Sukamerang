import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import type { ClassRow, Counts, QuestionType, SubjectRow } from "../lib/types";

export type ExamFormValues = {
  title: string;
  subject_id: string;
  class_id: string;
  duration_minutes: number;
  counts: Counts;
  pg_options: number;
  pgk_max: number;
  match_options: number;
  essay_max: number;
  max_violations: number;
  instructions: string;
};

export const defaultExamForm = (): ExamFormValues => ({
  title: "",
  subject_id: "",
  class_id: "",
  duration_minutes: 60,
  counts: { pg: 20, pgk: 0, bs: 0, match: 0, essay: 1 },
  pg_options: 4,
  pgk_max: 0,
  match_options: 5,
  essay_max: 10,
  max_violations: 5,
  instructions: "",
});

/** Nama ujian untuk asesmen sumatif: hanya dua periode ini yang dipakai madrasah. */
const EXAM_NAMES: { value: string; hint: string }[] = [
  { value: "ASAS Ganjil", hint: "Asesmen Sumatif Akhir Semester Ganjil" },
  { value: "ASAT Genap", hint: "Asesmen Sumatif Akhir Tahun (Semester Genap)" },
];

const TYPE_LABELS: { key: QuestionType; label: string }[] = [
  { key: "pg", label: "Pilihan ganda" },
  { key: "pgk", label: "PG kompleks" },
  { key: "bs", label: "Benar / salah" },
  { key: "match", label: "Menjodohkan" },
  { key: "essay", label: "Uraian" },
];

export default function ExamForm({
  initial,
  classes,
  subjects,
  submitLabel,
  busy,
  onSubmit,
}: {
  initial: ExamFormValues;
  classes: ClassRow[];
  subjects: SubjectRow[];
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: ExamFormValues) => void;
}) {
  const [values, setValues] = useState<ExamFormValues>(initial);

  const set = <K extends keyof ExamFormValues>(key: K, value: ExamFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const total = TYPE_LABELS.reduce((sum, item) => sum + (values.counts[item.key] || 0), 0);

  /** Judul lama (mis. dari ujian yang sudah ada) tetap ditampilkan supaya tidak berubah sendiri. */
  const nameOptions = EXAM_NAMES.some((item) => item.value === values.title) || !values.title.trim()
    ? EXAM_NAMES
    : [...EXAM_NAMES, { value: values.title, hint: "Nama yang sudah tersimpan di ujian ini" }];

  const activeNameHint = EXAM_NAMES.find((item) => item.value === values.title)?.hint || "";

  /** 8A dan 8B satu jenjang (kelas 8) — dikelompokkan supaya rombel tidak tertukar. */
  const classGroups = classes.reduce<{ level: string; rows: ClassRow[] }[]>((groups, row) => {
    const level = (row.level || row.name.slice(0, 1) || "lain").trim();
    const found = groups.find((group) => group.level === level);
    if (found) found.rows.push(row);
    else groups.push({ level, rows: [row] });
    return groups;
  }, []);

  const selectedClass = classes.find((row) => String(row.id) === values.class_id);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-[12px] font-bold text-ink-soft" htmlFor="f-title">
            Nama ujian
          </label>
          <div className="relative">
            <select
              id="f-title"
              required
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              className="field appearance-none pr-9"
            >
              <option value="" disabled>
                Pilih nama ujian
              </option>
              {nameOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
            {activeNameHint || "Pilih ASAS untuk semester ganjil atau ASAT untuk semester genap."}
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-bold text-ink-soft" htmlFor="f-subject">
            Mata pelajaran
          </label>
          <div className="relative">
            <select
              id="f-subject"
              value={values.subject_id}
              onChange={(event) => set("subject_id", event.target.value)}
              className="field appearance-none pr-9"
            >
              <option value="">{subjects.length ? "Pilih mapel" : "Belum ada mapel"}</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-bold text-ink-soft" htmlFor="f-kelas">
            Kelas (rombel)
          </label>
          <div className="relative">
            <select
              id="f-kelas"
              required
              value={values.class_id}
              onChange={(event) => set("class_id", event.target.value)}
              className="field appearance-none pr-9"
            >
              <option value="" disabled>
                {classes.length ? "Pilih satu rombel" : "Belum ada kelas"}
              </option>
              {classGroups.map((group) =>
                group.rows.length > 1 ? (
                  <optgroup key={group.level} label={`Jenjang ${group.level}`}>
                    {group.rows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  group.rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))
                )
              )}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
            {selectedClass
              ? `Ujian ini hanya untuk rombel ${selectedClass.name}. Siswa rombel lain tidak bisa memakai token-nya.`
              : "Satu ujian untuk satu rombel — pilih 8A, 8B, dan seterusnya, bukan seluruh jenjang."}
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-bold text-ink-soft" htmlFor="f-duration">
            Durasi (menit)
          </label>
          <input
            id="f-duration"
            type="number"
            min={5}
            max={300}
            value={values.duration_minutes}
            onChange={(event) => set("duration_minutes", Number(event.target.value))}
            className="field"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-bold text-ink-soft" htmlFor="f-violations">
            Batas pelanggaran
          </label>
          <input
            id="f-violations"
            type="number"
            min={1}
            max={20}
            value={values.max_violations}
            onChange={(event) => set("max_violations", Number(event.target.value))}
            className="field"
          />
        </div>
      </div>

      <div className="rounded-xl border border-line bg-paper/60 p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-extrabold text-ink">Jumlah soal per tipe</p>
          <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-brand ring-1 ring-line">
            {total} soal
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TYPE_LABELS.map((item) => (
            <label key={item.key} className="block">
              <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">
                {item.label}
              </span>
              <input
                type="number"
                min={0}
                max={200}
                value={values.counts[item.key]}
                onChange={(event) =>
                  set("counts", { ...values.counts, [item.key]: Math.max(0, Number(event.target.value) || 0) })
                }
                className="field px-2 py-1.5 text-sm"
                aria-label={`Jumlah soal ${item.label}`}
              />
            </label>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">
              Opsi PG (A–…)
            </span>
            <select
              value={values.pg_options}
              onChange={(event) => set("pg_options", Number(event.target.value))}
              className="field px-2 py-1.5 text-sm"
            >
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} opsi
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">
              Pilihan jodoh
            </span>
            <input
              type="number"
              min={2}
              max={15}
              value={values.match_options}
              onChange={(event) => set("match_options", Number(event.target.value))}
              className="field px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">
              Batas pilihan PGK
            </span>
            <select
              id="f-pgk-max"
              value={values.pgk_max}
              onChange={(event) => set("pgk_max", Number(event.target.value))}
              className="field px-2 py-1.5 text-sm"
            >
              <option value={0}>Bebas</option>
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Maks. {n} jawaban
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">
              Poin maks. uraian
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={values.essay_max}
              onChange={(event) => set("essay_max", Number(event.target.value))}
              className="field px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-bold text-ink-soft" htmlFor="f-instructions">
          Catatan untuk peserta (opsional)
        </label>
        <textarea
          id="f-instructions"
          value={values.instructions}
          onChange={(event) => set("instructions", event.target.value)}
          rows={2}
          placeholder="Contoh: Kerjakan soal pilihan ganda lebih dulu."
          className="field resize-y"
        />
      </div>

      <button
        type="submit"
        disabled={busy || !values.title.trim() || !values.class_id}
        className="btn-primary w-full"
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        {submitLabel}
      </button>
    </form>
  );
}
