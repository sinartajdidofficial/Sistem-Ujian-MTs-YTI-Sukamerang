import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { ApiError, adminApi } from "../lib/api";
import type { ClassRow, StudentRow, SubjectRow } from "../lib/types";

export type Catalog = { classes: ClassRow[]; subjects: SubjectRow[]; students: StudentRow[] };

type Props = { catalog: Catalog; onReload: () => Promise<void> };

export default function MasterData({ catalog, onReload }: Props) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-brand/20 bg-brand-soft/50 p-3.5 text-[11.5px] leading-relaxed text-brand">
        Data di sini dipakai di seluruh sistem: pilihan kelas &amp; mapel saat membuat ujian, dan daftar nama pada
        halaman login peserta.
      </div>
      <ClassSection catalog={catalog} onReload={onReload} />
      <SubjectSection catalog={catalog} onReload={onReload} />
      <StudentSection catalog={catalog} onReload={onReload} />
    </div>
  );
}

/* ------------------------------------------------------------------ shell */

function Section({
  icon: Icon,
  title,
  count,
  children,
  hint,
}: {
  icon: ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  count?: number;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-extrabold leading-tight text-ink">{title}</p>
          {hint && <p className="truncate text-[10.5px] text-muted">{hint}</p>}
        </div>
        {count !== undefined && (
          <span className="rounded-md bg-paper px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-ink-soft ring-1 ring-line">
            {count}
          </span>
        )}
      </div>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

function AddRow({
  placeholder,
  value,
  onChange,
  onSubmit,
  busy,
  label,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onSubmit();
      }}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="field flex-1"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="btn-primary shrink-0 px-3.5"
        aria-label={`Simpan ${label.toLowerCase()}`}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />}
      </button>
    </form>
  );
}

function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[11px] font-semibold text-danger">{message}</p>
  );
}

/* ------------------------------------------------------------------ kelas */

function ClassSection({ catalog, onReload }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const add = async () => {
    setBusy(true);
    setError("");
    try {
      await adminApi.addClass(name.trim());
      setName("");
      await onReload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah kelas.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (id: number) => {
    try {
      await adminApi.renameClass(id, draft.trim());
      setEditing(null);
      await onReload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengubah kelas.");
    }
  };

  const remove = async (row: ClassRow) => {
    if (!window.confirm(`Hapus kelas ${row.name}? ${row.student_count || 0} siswa di kelas ini ikut terhapus.`))
      return;
    try {
      await adminApi.deleteClass(row.id);
      await onReload();
    } catch {
      setError("Gagal menghapus kelas.");
    }
  };

  return (
    <Section icon={GraduationCap} title="Kelas" count={catalog.classes.length} hint="7A, 8B, 9A, dan seterusnya">
      <AddRow
        label="Tambah kelas"
        placeholder="Nama kelas baru, mis. 9C"
        value={name}
        onChange={setName}
        onSubmit={() => void add()}
        busy={busy}
      />
      <ErrorLine message={error} />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {catalog.classes.length === 0 && (
          <p className="py-2 text-[11.5px] text-muted">Belum ada kelas.</p>
        )}
        {catalog.classes.map((row) =>
          editing === row.id ? (
            <div key={row.id} className="flex items-center gap-1 rounded-lg border border-brand/40 bg-white p-1">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label={`Nama kelas ${row.name}`}
                className="w-20 rounded px-1.5 py-1 text-[12px] font-bold outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => void save(row.id)}
                aria-label="Simpan"
                className="rounded p-1 text-brand hover:bg-brand-soft"
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Batal"
                className="rounded p-1 text-muted hover:bg-paper"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <div
              key={row.id}
              className="group flex items-center gap-1.5 rounded-lg border border-line bg-white py-1 pl-2.5 pr-1"
            >
              <span className="text-[12px] font-bold text-ink">{row.name}</span>
              <span className="text-[10px] font-semibold text-muted">{row.student_count || 0} siswa</span>
              <button
                type="button"
                onClick={() => {
                  setEditing(row.id);
                  setDraft(row.name);
                }}
                aria-label={`Ubah kelas ${row.name}`}
                className="rounded p-1 text-muted transition hover:bg-brand-soft hover:text-brand"
              >
                <Pencil size={11} />
              </button>
              <button
                type="button"
                onClick={() => void remove(row)}
                aria-label={`Hapus kelas ${row.name}`}
                className="rounded p-1 text-muted transition hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ mapel */

function SubjectSection({ catalog, onReload }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const add = async () => {
    setBusy(true);
    setError("");
    try {
      await adminApi.addSubject(name.trim());
      setName("");
      await onReload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah mapel.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (id: number) => {
    try {
      await adminApi.renameSubject(id, draft.trim());
      setEditing(null);
      await onReload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengubah mapel.");
    }
  };

  const remove = async (row: SubjectRow) => {
    if (!window.confirm(`Hapus mapel ${row.name}?`)) return;
    try {
      await adminApi.deleteSubject(row.id);
      await onReload();
    } catch {
      setError("Gagal menghapus mapel.");
    }
  };

  return (
    <Section icon={BookOpen} title="Mata pelajaran" count={catalog.subjects.length} hint="Dipakai saat membuat ujian">
      <AddRow
        label="Tambah mapel"
        placeholder="Nama mapel baru, mis. Fikih"
        value={name}
        onChange={setName}
        onSubmit={() => void add()}
        busy={busy}
      />
      <ErrorLine message={error} />
      <div className="mt-3 grid gap-1 sm:grid-cols-2">
        {catalog.subjects.length === 0 && <p className="py-2 text-[11.5px] text-muted">Belum ada mapel.</p>}
        {catalog.subjects.map((row) =>
          editing === row.id ? (
            <div key={row.id} className="flex items-center gap-1.5 rounded-lg border border-brand/40 bg-white p-1.5">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label={`Nama mapel ${row.name}`}
                className="min-w-0 flex-1 rounded px-1.5 py-1 text-[12px] font-semibold outline-none"
                autoFocus
              />
              <button type="button" onClick={() => void save(row.id)} aria-label="Simpan" className="rounded p-1 text-brand hover:bg-brand-soft">
                <Check size={14} />
              </button>
              <button type="button" onClick={() => setEditing(null)} aria-label="Batal" className="rounded p-1 text-muted hover:bg-paper">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div key={row.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-paper">
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{row.name}</span>
              {row.exam_count ? (
                <span className="text-[10px] font-semibold text-muted">{row.exam_count} ujian</span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setEditing(row.id);
                  setDraft(row.name);
                }}
                aria-label={`Ubah mapel ${row.name}`}
                className="rounded p-1.5 text-muted transition hover:bg-brand-soft hover:text-brand"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={() => void remove(row)}
                aria-label={`Hapus mapel ${row.name}`}
                className="rounded p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ siswa */

function StudentSection({ catalog, onReload }: Props) {
  const [classId, setClassId] = useState(() => String(catalog.classes[0]?.id ?? ""));
  const [name, setName] = useState("");
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const students = useMemo(
    () => catalog.students.filter((row) => String(row.class_id) === classId),
    [catalog.students, classId]
  );

  // kelas datang dari server, jadi pilih yang pertama begitu daftarnya siap
  useEffect(() => {
    if (!catalog.classes.length) return;
    if (!classId || !catalog.classes.some((row) => String(row.id) === classId)) {
      setClassId(String(catalog.classes[0].id));
    }
  }, [catalog.classes, classId]);

  const addOne = async () => {
    if (!classId) {
      setError("Pilih kelas dulu.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminApi.addStudents(Number(classId), [name.trim()]);
      setName("");
      setNotice(
        result.added
          ? "Siswa ditambahkan."
          : `Nama itu sudah ada di kelas ${catalog.classes.find((row) => String(row.id) === classId)?.name || "ini"}.`
      );
      await onReload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah siswa.");
    } finally {
      setBusy(false);
    }
  };

  const addBulk = async () => {
    if (!classId) {
      setError("Pilih kelas dulu.");
      return;
    }
    const names = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!names.length) {
      setError("Tulis minimal satu nama.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminApi.addStudents(Number(classId), names);
      setBulkText("");
      setBulk(false);
      setNotice(`${result.added} siswa ditambahkan${result.skipped ? `, ${result.skipped} duplikat dilewati` : ""}.`);
      await onReload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah siswa.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: StudentRow) => {
    if (!window.confirm(`Hapus ${row.name} dari daftar siswa?`)) return;
    try {
      await adminApi.deleteStudent(row.id);
      await onReload();
    } catch {
      setError("Gagal menghapus siswa.");
    }
  };

  const selectedClass = catalog.classes.find((row) => String(row.id) === classId);

  return (
    <Section
      icon={Users}
      title="Siswa"
      count={catalog.students.length}
      hint="Nama yang muncul di halaman login peserta"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative">
          <select
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setError("");
              setNotice("");
            }}
            aria-label="Pilih kelas"
            className="field appearance-none pr-9"
          >
            <option value="">Pilih kelas</option>
            {catalog.classes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        </div>

        {bulk ? (
          <button
            type="button"
            onClick={() => setBulk(false)}
            className="btn-ghost justify-center text-[12px]"
          >
            <X size={14} /> Batal tambah banyak
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setBulk(true)}
            disabled={!classId}
            className="btn-ghost justify-center text-[12px] disabled:opacity-50"
          >
            <UserPlus size={14} /> Tambah banyak sekaligus
          </button>
        )}
      </div>

      <div className="mt-2.5">
        {bulk ? (
          <div className="rounded-lg border border-line bg-paper/60 p-2.5">
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={5}
              placeholder={"Satu nama per baris:\nAhmad Fauzan\nNur Hidayah\nSiti Aisyah"}
              className="field resize-y text-[12.5px] leading-relaxed"
            />
            <button
              type="button"
              onClick={() => void addBulk()}
              disabled={busy || !bulkText.trim()}
              className="btn-primary mt-2 w-full text-[12.5px]"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Simpan {bulkText.split(/\r?\n/).filter((line) => line.trim()).length || 0} nama ke{" "}
              {selectedClass?.name || "kelas"}
            </button>
          </div>
        ) : (
          <AddRow
            label="Tambah siswa"
            placeholder={classId ? `Nama siswa baru di ${selectedClass?.name || "kelas ini"}` : "Pilih kelas dulu"}
            value={name}
            onChange={setName}
            onSubmit={() => void addOne()}
            busy={busy}
          />
        )}
      </div>

      <ErrorLine message={error} />
      {notice && (
        <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-[11px] font-semibold text-brand">{notice}</p>
      )}

      <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-line">
        {students.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11.5px] text-muted">
            {classId ? "Belum ada siswa di kelas ini." : "Pilih kelas untuk melihat daftar siswa."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {students.map((row, index) => (
              <li key={row.id} className="flex items-center gap-2 bg-white px-3 py-2">
                <span className="w-5 text-[10.5px] font-bold tabular-nums text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{row.name}</span>
                <button
                  type="button"
                  onClick={() => void remove(row)}
                  aria-label={`Hapus ${row.name}`}
                  className="rounded p-1.5 text-muted transition hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-[10.5px] text-muted">
        {students.length} siswa di kelas {selectedClass?.name || "—"}
      </p>
    </Section>
  );
}
