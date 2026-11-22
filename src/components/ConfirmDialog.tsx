import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Trash2, TriangleAlert } from "lucide-react";

/**
 * Konfirmasi sebelum menghapus data — pengganti window.confirm bawaan browser.
 *
 * Pakai di dalam komponen:
 *   const askConfirm = useConfirm();
 *   const ok = await askConfirm({ title: "Hapus mapel?", message: "..." });
 *   if (!ok) return;
 */

export type ConfirmOptions = {
  title: string;
  message: ReactNode;
  /** baris kecil di bawah pesan; bawaan: "Tindakan ini tidak bisa dibatalkan." */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm harus dipakai di dalam <ConfirmProvider>");
  return context;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [options, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {options && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-brand-deep/70 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl slide-up sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
                <TriangleAlert size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="confirm-title" className="text-[14px] font-extrabold leading-snug tracking-tight text-ink">
                  {options.title}
                </h2>
                <p id="confirm-desc" className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                  {options.message}
                </p>
                <p className="mt-2.5 rounded-lg bg-paper px-2.5 py-2 text-[10.5px] font-semibold leading-relaxed text-muted">
                  {options.note || "Tindakan ini tidak bisa dibatalkan."}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => close(false)}
                className="btn-ghost w-full justify-center py-2.5"
              >
                {options.cancelLabel || "Batal"}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-danger px-3 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-[#96190f] active:translate-y-px"
              >
                <Trash2 size={14} />
                {options.confirmLabel || "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
