# Panduan Online — Vercel + Supabase

Panduan ini untuk menaikkan Sistem Asesmen Sumatif Akhir MTs YTI Sukamerang ke internet
memakai **Vercel** (hosting) dan **Supabase** (database + penyimpanan naskah PDF).

Perkiraan waktu: 20–30 menit. Tidak perlu menulis kode.

---

## 1. Siapkan Supabase (database)

1. Buka [supabase.com](https://supabase.com) → daftar/masuk → **New project**.
2. Isi:
   - **Name**: `mts-yti-asesmen`
   - **Database Password**: buat kata sandi kuat, **catat** (nanti dipakai di connection string).
   - **Region**: pilih **Southeast Asia (Singapore)** — paling dekat ke Sukamerang.
3. Tunggu ± 2 menit sampai project selesai dibuat.
4. Buka menu **SQL Editor** → **New query** → tempel seluruh isi file `supabase/schema.sql`
   → tekan **Run**. Semua tabel, 6 kelas, dan 14 mapel langsung dibuat.
5. Ambil dua nilai ini (nanti dipakai di Vercel):

   **a. Connection string (database)**
   → **Project Settings** (ikon gerigi) → **Database** → bagian **Connection pooling**
   → pilih **Transaction** → salin **URI**. Bentuknya:

   ```
   postgresql://postgres.abcdefgh:RAHASIA@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require
   ```

   > Penting: pakai **Connection pooling** (port **6543**). Koneksi "Direct connection"
   > (port 5432) hanya IPv6 dan tidak bisa dipakai dari Vercel.
   > Kalau `[YOUR-PASSWORD]` masih tertulis, ganti dengan kata sandi dari langkah 2.

   **b. Kunci API**
   → **Project Settings** → **API** → catat **Project URL** dan **service_role** key
   (tombol *Reveal*). Kunci ini rahasia — hanya untuk server, jangan ditempel di mana pun
   selain Environment Variables Vercel.

6. **Storage (opsional, dibuat otomatis):** naskah PDF disimpan di bucket `exam-files`.
   Bucket ini dibuat sendiri oleh aplikasi saat guru mengunggah PDF pertama kali.
   Kalau ingin manual: menu **Storage** → **New bucket** → nama `exam-files` → **Private**.

---

## 2. Unggah kode ke GitHub

1. Buka [github.com](https://github.com) → **New repository** → nama mis. `asesmen-mts-yti`
   → **Private** → **Create repository**.
2. Ekstrak file ZIP project ini di komputer (jangan unggah folder `node_modules`).
3. Di halaman repo kosong, klik **uploading an existing file**, lalu **tarik semua isi folder**
   hasil ekstrak (bukan foldernya, tapi isinya: `src`, `server`, `api`, `public`,
   `supabase`, `package.json`, `vercel.json`, dst.) → **Commit changes**.

> Cara lain yang lebih nyaman: pakai **GitHub Desktop**, pilih *Add local repository*,
> arahkan ke folder project, lalu **Publish repository**.

---

## 3. Deploy di Vercel

1. Buka [vercel.com/new](https://vercel.com/new) → masuk dengan akun GitHub.
2. Pilih repo `asesmen-mts-yti` → **Import**.
3. Vercel otomatis mendeteksi **Vite**. Biarkan:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Buka **Environment Variables**, tambahkan satu per satu:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | connection string pooler dari langkah 1.5a |
   | `SUPABASE_URL` | Project URL dari langkah 1.5b |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key dari langkah 1.5b |
   | `SUPABASE_BUCKET` | `exam-files` |
   | `EXAM_ADMIN_PASSWORD` | kata sandi guru pertama (mis. `MTsYTI2026`) |

5. Klik **Deploy** dan tunggu ± 1–2 menit.
6. Buka alamat yang diberikan Vercel (mis. `https://asesmen-mts-yti.vercel.app`).

---

## 4. Setelah aplikasi online

1. Buka `alamat-vercel-anda/guru` → masuk dengan kata sandi guru
   (`MTsYTI2026` kalau tidak diubah di langkah 3.4).
2. Klik ikon ⚙ di kanan atas → **ganti kata sandi**.
3. Buka tab **Data Induk**: rapikan daftar kelas, mapel, dan isi nama siswa
   (bisa **Tambah banyak sekaligus** dengan menempel satu nama per baris).
4. Buat ujian di tab **Ujian** → unggah PDF → isi kunci jawaban → **Buka** ujian.
5. Bagikan tautan `alamat-vercel-anda/?kode=XXXXXX` atau cukup token 6 hurufnya
   kepada siswa. Siswa memilih kelas → nama → token.

---

## Catatan penting

- **Ukuran PDF.** Dengan Supabase Storage aktif, PDF diunggah langsung dari browser ke
  Supabase, jadi ukurannya longgar (sampai 200 MB). Tanpa Storage, file melewati server
  Vercel yang membatasi **4 MB** per unggahan.
- **Jangan bagikan** `SUPABASE_SERVICE_ROLE_KEY` ke siapa pun. Kalau bocor, buat ulang
  di Supabase (API → *Reset*).
- **Kunci tabel.** RLS sudah diaktifkan tanpa policy, sehingga kunci `anon` Supabase tidak
  bisa membaca data siswa/nilai. Aplikasi mengakses database lewat server, bukan langsung.
- **Mengganti kata sandi guru** hanya bisa dari panel guru. Mengubah `EXAM_ADMIN_PASSWORD`
  di Vercel tidak menimpa kata sandi yang sudah tersimpan.
- **Update aplikasi.** Setiap kali file di GitHub diperbarui (commit), Vercel otomatis
  membuat versi baru dalam ± 1 menit.
- **Domain sendiri** (mis. `asesmen.mtsyti.sch.id`): Vercel → Settings → Domains →
  tambahkan domain, lalu arahkan DNS sesuai petunjuk Vercel.
- **Menjalankan di komputer** (opsional): buat file `.env` dari contoh `.env.example`,
  lalu `npm install`, `npm --prefix server install`, `npm run dev` dan
  `node server/index.js` di terminal terpisah.
