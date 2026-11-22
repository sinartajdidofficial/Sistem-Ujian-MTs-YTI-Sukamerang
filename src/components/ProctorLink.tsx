import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Radar, RefreshCcw } from "lucide-react";
import { ApiError, adminApi, proctorUrl } from "../lib/api";
import { useConfirm } from "./ConfirmDialog";

/**
 * Tautan pengawas.
 *
 * Guru menyalin satu tautan (mis. https://…/pantau#k=…) lalu membagikannya ke
 * pengawas. Pengawas membukanya tanpa kata sandi dan tidak bisa masuk ke panel
 * guru. Mengganti tautan mematikan tautan lama seketika.
 */
export default function ProctorLink() {
  const askConfirm = useConfirm();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getProctorKey()
      .then(({ key: value }) => {
        if (cancelled) return;
        setKey(value);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Gagal memuat tautan pengawas.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const url = key ? proctorUrl(key) : "";

  const salin = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [url]);

  const ganti = async () => {
    const ok = await askConfirm({
      title: "Ganti tautan pengawas?",
      message: "Tautan yang sekarang langsung tidak bisa dipakai lagi oleh pengawas.",
      note: "Setelah diganti, bagikan tautan baru ke pengawas.",
      confirmLabel: "Ganti tautan",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await adminApi.rotateProctorKey();
      setKey(result.key);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengganti tautan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mb-3 p-3.5">
      <div className="flex items-start gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Radar size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand">Tautan pengawas</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            Satu tautan untuk semua ujian. Bagikan ke pengawas — mereka memilih sendiri ujian yang mau dipantau
            dan tidak bisa masuk ke panel guru.
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <p
          title={url}
          className="min-w-0 flex-1 truncate rounded-lg border border-line bg-paper px-2.5 py-2 font-mono text-[10.5px] text-ink-soft"
        >
          {url || (error ? "Tautan gagal dimuat" : "Menyiapkan tautan…")}
        </p>
        <button
          type="button"
          onClick={() => void salin()}
          disabled={!url}
          aria-label="Salin tautan pengawas"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-white transition active:opacity-80 disabled:opacity-40"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <a
          href={url || undefined}
          target="_blank"
          rel="noreferrer"
          aria-label="Buka papan pantau di tab baru"
          aria-disabled={!url}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-white text-ink-soft transition hover:bg-paper ${
            url ? "" : "pointer-events-none opacity-40"
          }`}
        >
          <ExternalLink size={14} />
        </a>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void ganti()}
          disabled={busy || !url}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-soft transition hover:text-danger disabled:opacity-50"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCcw size={11} />} Ganti tautan
        </button>
        <span className="text-[10px] font-semibold text-muted">Tautan bersifat rahasia</span>
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11px] font-semibold text-danger">{error}</p>
      )}
    </section>
  );
}
