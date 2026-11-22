import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ShieldX } from "lucide-react";
import { ApiError, adminApi, adminToken, proctorUrl } from "../lib/api";

/**
 * Jembatan untuk tautan lama /guru/pantau (dan tombol "Pantau" di panel guru).
 *
 * Halaman pengawas kini berdiri sendiri di /pantau#k=… — satu tautan untuk semua
 * ujian, tanpa kata sandi guru, dan tanpa tautan balik ke panel guru. Komponen
 * ini hanya menerjemahkan tautan gaya lama menjadi tautan pengawas yang benar.
 */
export default function ProctorEntry() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminToken.get()) {
      setError("Kamu belum masuk sebagai guru. Masuk dulu untuk membuka papan pantau.");
      return;
    }
    let cancelled = false;
    adminApi
      .getProctorKey()
      .then(({ key }) => {
        if (cancelled) return;
        const target = proctorUrl(key);
        navigate(target.slice(target.indexOf("/pantau")), { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Gagal membuka papan pantau.");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4 py-10">
      <div className="card w-full max-w-sm p-6 text-center">
        {error ? (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger">
              <ShieldX size={22} />
            </span>
            <h1 className="mt-3 text-[15px] font-extrabold text-ink">Papan pantau tidak bisa dibuka</h1>
            <p className="mx-auto mt-1.5 max-w-[17rem] text-[12px] leading-relaxed text-muted">{error}</p>
            <Link to="/guru" className="btn-primary mt-4 w-full py-2.5">
              Ke panel guru
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto animate-spin text-brand" size={22} />
            <p className="mt-3 text-[13px] font-extrabold text-ink">Membuka papan pantau…</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              Halaman pengawas dibuka di tab yang sama. Tekan tombol kembali untuk balik ke panel guru.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
