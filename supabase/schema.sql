-- ============================================================
--  Sistem Asesmen Sumatif Akhir — MTs YTI Sukamerang
--  Skema database untuk Supabase
--
--  Cara pakai:
--  1. Buka project Supabase -> menu "SQL Editor" -> "New query".
--  2. Tempel seluruh isi file ini, lalu tekan "Run".
--  3. Aman dijalankan ulang: semua perintah memakai IF NOT EXISTS.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Pengaturan aplikasi (kata sandi guru disimpan sebagai hash)
-- ------------------------------------------------------------
create table if not exists settings (
  key text primary key,
  value text not null
);

-- ------------------------------------------------------------
-- Ujian
-- ------------------------------------------------------------
create table if not exists exams (
  id serial primary key,
  code text unique not null,
  title text not null,
  subject text not null default '',
  kelas text not null default '',
  duration_minutes int not null default 60,
  status text not null default 'draft',          -- draft | open | closed
  counts jsonb not null default '{"pg":0,"pgk":0,"bs":0,"match":0,"essay":0}'::jsonb,
  answer_key jsonb not null default '{}'::jsonb,
  match_options int not null default 0,
  pg_options int not null default 4,
  pgk_options int not null default 5, -- jumlah huruf pilihan soal PG kompleks
  essay_max int not null default 10,
  points jsonb not null default '{"pg":1,"pgk":1,"bs":1,"match":1,"essay":10}',  -- poin per tipe soal
  max_violations int not null default 5,
  pgk_max int not null default 0,              -- tidak dipakai lagi: batas PGK mengikuti kunci jawaban
  instructions text not null default '',
  pdf bytea,                                      -- dipakai bila file disimpan di database
  pdf_path text,                                  -- dipakai bila file disimpan di Supabase Storage
  pdf_name text,
  pdf_size int,
  pdf_updated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table exams add column if not exists pdf_path text;
alter table exams add column if not exists pgk_max int not null default 0;
alter table exams add column if not exists pgk_options int not null default 5;

-- poin per tipe soal; database lama diisi dari essay_max supaya nilai tidak berubah
alter table exams add column if not exists points jsonb;
update exams set points = jsonb_build_object('pg', 1, 'pgk', 1, 'bs', 1, 'match', 1, 'essay', essay_max)
  where points is null;
alter table exams alter column points set default '{"pg":1,"pgk":1,"bs":1,"match":1,"essay":10}';
alter table exams alter column points set not null;
alter table exams add column if not exists class_id int;
alter table exams add column if not exists subject_id int;

-- ------------------------------------------------------------
-- Sesi login guru
-- ------------------------------------------------------------
create table if not exists admin_sessions (
  token text primary key,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Data induk: kelas, mapel, siswa
-- ------------------------------------------------------------
create table if not exists classes (
  id serial primary key,
  name text not null unique,
  level text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists subjects (
  id serial primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id serial primary key,
  class_id int not null references classes(id) on delete cascade,
  name text not null,
  nis text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists students_unique_name on students (class_id, lower(name));
create index if not exists students_class_idx on students(class_id);

-- ------------------------------------------------------------
-- Sesi ujian siswa
-- ------------------------------------------------------------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  exam_id int not null references exams(id) on delete cascade,
  student_id int references students(id) on delete set null,
  token text not null,
  student_name text not null,
  student_class text not null,
  answers jsonb not null default '{}'::jsonb,
  violations int not null default 0,
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  score numeric,
  score_detail jsonb,
  manual_scores jsonb not null default '{}'::jsonb,
  graded_at timestamptz,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

alter table sessions add column if not exists student_id int references students(id) on delete set null;

create table if not exists events (
  id bigserial primary key,
  session_id uuid references sessions(id) on delete cascade,
  type text not null,
  detail text,
  at timestamptz not null default now()
);

create index if not exists sessions_exam_idx on sessions(exam_id);
create index if not exists sessions_student_idx on sessions(exam_id, student_id);
create index if not exists events_session_idx on events(session_id);

-- ------------------------------------------------------------
-- Kunci asing yang dipasang setelah semua tabel siap
-- ------------------------------------------------------------
do $$
begin
  alter table exams add constraint exams_class_fk
    foreign key (class_id) references classes(id) on delete set null;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table exams add constraint exams_subject_fk
    foreign key (subject_id) references subjects(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- Keamanan: aplikasi hanya mengakses database lewat server (koneksi
-- Postgres langsung). RLS ditutup supaya kunci "anon" Supabase tidak
-- bisa membaca data siswa, jawaban, atau nilai.
-- ------------------------------------------------------------
alter table settings enable row level security;
alter table exams enable row level security;
alter table admin_sessions enable row level security;
alter table sessions enable row level security;
alter table events enable row level security;
alter table classes enable row level security;
alter table subjects enable row level security;
alter table students enable row level security;

-- ------------------------------------------------------------
-- Data awal: 6 kelas dan 14 mata pelajaran madrasah
-- (boleh diubah/dihapus dari Panel Guru -> Data Induk)
-- ------------------------------------------------------------
insert into classes (name, level, sort) values
  ('7A', '7', 0), ('7B', '7', 1),
  ('8A', '8', 2), ('8B', '8', 3),
  ('9A', '9', 4), ('9B', '9', 5)
on conflict (name) do nothing;

insert into subjects (name) values
  ('Al-Qur''an Hadis'),
  ('Akidah Akhlak'),
  ('Fikih'),
  ('Sejarah Kebudayaan Islam'),
  ('Bahasa Arab'),
  ('Bahasa Indonesia'),
  ('Bahasa Inggris'),
  ('Matematika'),
  ('Ilmu Pengetahuan Alam'),
  ('Ilmu Pengetahuan Sosial'),
  ('Pendidikan Pancasila'),
  ('Informatika'),
  ('Seni Budaya'),
  ('PJOK')
on conflict (name) do nothing;
