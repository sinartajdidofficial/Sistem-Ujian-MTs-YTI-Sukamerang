import type { ReactNode } from "react";
import { Check, Eraser, PenLine } from "lucide-react";
import type { Answers, Counts, QuestionType } from "../lib/types";

export const LETTERS = ["A", "B", "C", "D", "E"];

export const TABS: { key: QuestionType; label: string; short: string; hint: string }[] = [
  { key: "pg", label: "Pilihan Ganda", short: "PG", hint: "Pilih satu jawaban untuk setiap nomor." },
  { key: "pgk", label: "PG Kompleks", short: "PGK", hint: "Jawaban benar bisa lebih dari satu." },
  { key: "bs", label: "Benar / Salah", short: "B/S", hint: "Pilih B (benar) atau S (salah)." },
  { key: "match", label: "Menjodohkan", short: "Jodoh", hint: "Pasangkan nomor dengan huruf jawaban." },
  { key: "essay", label: "Uraian", short: "Uraian", hint: "Tulis jawaban pada kolom yang tersedia." },
];

type PanelProps = {
  counts: Counts;
  answers: Answers;
  pgOptions: number;
  /** batas pilihan per nomor untuk PG kompleks — diambil dari kunci jawaban */
  pgkLimits: Record<string, number>;
  matchOptions: number;
  essayMax: number;
  onChange: (type: QuestionType, no: number, value: string | string[]) => void;
  onClear: (type: QuestionType, no: number) => void;
};

export function answeredCount(type: QuestionType, answers: Answers) {
  return Object.keys(answers[type] || {}).filter((key) => {
    const value = answers[type][key];
    if (Array.isArray(value)) return value.length > 0;
    return String(value ?? "").trim().length > 0;
  }).length;
}

export function totalAnswered(counts: Counts, answers: Answers) {
  return TABS.reduce((sum, tab) => sum + (counts[tab.key] > 0 ? answeredCount(tab.key, answers) : 0), 0);
}

export function totalQuestions(counts: Counts) {
  return TABS.reduce((sum, tab) => sum + (counts[tab.key] || 0), 0);
}

function Row({
  no,
  filled,
  children,
  onClear,
}: {
  no: number;
  filled: boolean;
  children: ReactNode;
  onClear?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
        filled ? "border-brand/35 bg-brand-soft/50" : "border-line bg-white"
      }`}
    >
      <span
        className={`w-6 shrink-0 text-center text-[11px] font-extrabold tabular-nums ${
          filled ? "text-brand" : "text-muted"
        }`}
      >
        {no}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
      {onClear && filled && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Kosongkan jawaban nomor ${no}`}
          className="shrink-0 rounded-md p-1 text-muted transition hover:bg-white hover:text-danger"
        >
          <Eraser size={13} />
        </button>
      )}
    </div>
  );
}

function LetterButton({
  letter,
  selected,
  onClick,
  multi,
  disabled,
}: {
  letter: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-disabled={disabled}
      disabled={disabled}
      aria-label={multi ? `Pilih ${letter}` : `Jawaban ${letter}`}
      className={`relative grid h-9 w-10 place-items-center rounded-md border text-sm font-bold transition ${
        selected
          ? "border-brand bg-brand text-white shadow-sm"
          : disabled
            ? "cursor-not-allowed border-line bg-paper text-muted/40"
            : "border-line bg-white text-ink-soft hover:border-brand/40 hover:bg-brand-soft/60"
      }`}
    >
      {letter}
      {multi && selected && (
        <span className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-sand text-[8px] text-brand-deep">
          <Check size={9} strokeWidth={4} />
        </span>
      )}
    </button>
  );
}

export function PgPanel({ counts, answers, pgOptions, onChange, onClear }: PanelProps) {
  const letters = LETTERS.slice(0, pgOptions || 4);
  return (
    <div className="space-y-1.5">
      {Array.from({ length: counts.pg }, (_, index) => {
        const no = index + 1;
        const value = answers.pg[String(no)];
        return (
          <Row key={no} no={no} filled={!!value} onClear={() => onClear("pg", no)}>
            {letters.map((letter) => (
              <LetterButton
                key={letter}
                letter={letter}
                selected={value === letter}
                onClick={() => onChange("pg", no, letter)}
              />
            ))}
          </Row>
        );
      })}
    </div>
  );
}

export function PgkPanel({ counts, answers, pgOptions, pgkLimits, onChange, onClear }: PanelProps) {
  const letters = LETTERS.slice(0, pgOptions || 4);

  return (
    <div className="space-y-1.5">
      {Array.from({ length: counts.pgk }, (_, index) => {
        const no = index + 1;
        const selected = answers.pgk[String(no)] || [];
        // batas per nomor mengikuti kunci: 2 kunci → 2 pilihan, 3 kunci → 3
        const limit = Math.min(pgkLimits[String(no)] || 0, letters.length);
        const full = limit > 0 && selected.length >= limit;
        return (
          <Row key={no} no={no} filled={selected.length > 0} onClear={() => onClear("pgk", no)}>
            {letters.map((letter) => {
              const isSelected = selected.includes(letter);
              return (
                <LetterButton
                  key={letter}
                  letter={letter}
                  multi
                  selected={isSelected}
                  disabled={full && !isSelected}
                  onClick={() => {
                    if (full && !isSelected) return;
                    const next = isSelected
                      ? selected.filter((item) => item !== letter)
                      : [...selected, letter].sort();
                    onChange("pgk", no, next);
                  }}
                />
              );
            })}
            {limit > 0 && (
              <span
                className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  full ? "bg-brand-soft text-brand" : "bg-paper text-muted"
                }`}
                title={`Maksimal ${limit} pilihan`}
              >
                {selected.length}/{limit}
              </span>
            )}
          </Row>
        );
      })}
    </div>
  );
}

export function BsPanel({ counts, answers, onChange, onClear }: PanelProps) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: counts.bs }, (_, index) => {
        const no = index + 1;
        const value = answers.bs[String(no)];
        return (
          <Row key={no} no={no} filled={!!value} onClear={() => onClear("bs", no)}>
            {[
              { key: "B", text: "Benar" },
              { key: "S", text: "Salah" },
            ].map((option) => {
              const selected = value === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onChange("bs", no, option.key)}
                  aria-pressed={selected}
                  className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                    selected
                      ? option.key === "B"
                        ? "border-brand bg-brand text-white"
                        : "border-danger bg-danger text-white"
                      : "border-line bg-white text-ink-soft hover:border-brand/40 hover:bg-brand-soft/60"
                  }`}
                >
                  <span className={`text-[11px] font-extrabold ${selected ? "opacity-80" : "text-muted"}`}>
                    {option.key}
                  </span>
                  {option.text}
                </button>
              );
            })}
          </Row>
        );
      })}
    </div>
  );
}

export function MatchPanel({ counts, answers, matchOptions, onChange, onClear }: PanelProps) {
  const letters = LETTERS.concat(["F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"]).slice(
    0,
    Math.max(2, matchOptions || counts.match || 4)
  );
  return (
    <div className="space-y-1.5">
      {Array.from({ length: counts.match }, (_, index) => {
        const no = index + 1;
        const value = answers.match[String(no)];
        return (
          <Row key={no} no={no} filled={!!value} onClear={() => onClear("match", no)}>
            <div className="grid flex-1 grid-cols-5 gap-1.5 sm:grid-cols-8">
              {letters.map((letter) => (
                <LetterButton
                  key={letter}
                  letter={letter}
                  selected={value === letter}
                  onClick={() => onChange("match", no, letter)}
                />
              ))}
            </div>
          </Row>
        );
      })}
    </div>
  );
}

export function EssayPanel({ counts, answers, essayMax, onChange }: PanelProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: counts.essay }, (_, index) => {
        const no = index + 1;
        const value = answers.essay[String(no)] || "";
        return (
          <div key={no} className="rounded-lg border border-line bg-white p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
                <span className="grid h-5 w-5 place-items-center rounded bg-brand-soft text-[10px] font-extrabold text-brand">
                  {no}
                </span>
                Uraian nomor {no}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                {essayMax} poin
              </span>
            </div>
            <textarea
              value={value}
              onChange={(event) => onChange("essay", no, event.target.value.slice(0, 5000))}
              rows={4}
              spellCheck={false}
              placeholder="Tulis jawaban uraian di sini…"
              className="w-full resize-y rounded-md border border-line bg-paper/40 p-2.5 text-sm leading-relaxed text-ink outline-none transition focus:border-brand focus:bg-white"
            />
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
              <span className="inline-flex items-center gap-1">
                <PenLine size={11} /> Tersimpan otomatis
              </span>
              <span className="tabular-nums">{value.length}/5000</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PanelFor(props: { type: QuestionType } & PanelProps) {
  switch (props.type) {
    case "pg":
      return <PgPanel {...props} />;
    case "pgk":
      return <PgkPanel {...props} />;
    case "bs":
      return <BsPanel {...props} />;
    case "match":
      return <MatchPanel {...props} />;
    case "essay":
      return <EssayPanel {...props} />;
    default:
      return null;
  }
}
