# Sistem Asesmen Sumatif Akhir — MTs YTI Sukamerang

Sistem ujian berbasis komputer untuk madrasah: naskah soal PDF yang bisa di-zoom, lima tipe
soal (pilihan ganda, PG kompleks, benar/salah, menjodohkan, uraian), layar penuh dengan alarm
pelanggaran, serta panel guru untuk data siswa, kunci jawaban, dan nilai.

- **Frontend**: React + Vite + TypeScript + Tailwind
- **Backend**: Express (Node.js) sebagai satu fungsi serverless di Vercel
- **Database**: PostgreSQL (Supabase)
- **Penyimpanan naskah**: Supabase Storage (opsional, otomatis dipakai bila dikonfigurasi)

## Struktur

```
api/index.js          pintu masuk serverless di Vercel (membungkus server/app.js)
server/app.js         seluruh API (auth guru, ujian, sesi, penilaian, data induk)
server/db.js          koneksi + skema database
server/index.js       menjalankan server biasa (untuk lokal / preview)
src/                  aplikasi React
supabase/schema.sql   skema database untuk Supabase
vercel.json           konfigurasi deploy Vercel
DEPLOY.md             panduan online ke Vercel + Supabase
```

## Menjalankan lokal

```bash
npm install
npm --prefix server install
cp .env.example .env          # lalu isi DATABASE_URL
npm run dev                   # http://localhost:5173
node server/index.js          # API di http://localhost:8787 (terminal terpisah)
```

## Login

- **Peserta** — halaman utama: pilih kelas → pilih nama → masukkan token ujian.
- **Guru** — `/guru`, kata sandi bawaan `MTsYTI2026` (segera ganti di panel).

Panduan deploy lengkap ada di [DEPLOY.md](DEPLOY.md).
