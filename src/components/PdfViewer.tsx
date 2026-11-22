import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Scan,
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** standard PDF fonts (Helvetica, Times, …) for documents that do not embed them */
const STANDARD_FONTS = `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`;

type Props = {
  url: string;
};

type FitMode = "page" | "width";

const MIN_SCALE = 0.3;
const MAX_SCALE = 5;
const GUTTER = 20;

const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

export default function PdfViewer({ url }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const baseRef = useRef({ w: 0, h: 0 });

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [base, setBase] = useState({ w: 0, h: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [fit, setFit] = useState<FitMode>("page");
  /** null = follow the fit mode, a number = the student chose a zoom level */
  const [manualScale, setManualScale] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  /* ---- load the document ---- */
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMsg("");
    setPage(1);
    setManualScale(null);
    baseRef.current = { w: 0, h: 0 };
    setBase({ w: 0, h: 0 });

    const task = pdfjs.getDocument({ url, standardFontDataUrl: STANDARD_FONTS });
    task.promise
      .then((doc) => {
        if (cancelled) {
          void task.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : "PDF gagal dimuat.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      void task.destroy();
      renderTaskRef.current?.cancel();
      docRef.current = null;
    };
  }, [url, reloadKey]);

  /* ---- watch the available space (window resize, fullscreen, tab switch) ---- */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setViewport((current) => (current.w === w && current.h === h ? current : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [status]);

  /* ---- scale that fits the page into the panel ---- */
  const fitScale = useMemo(() => {
    if (!base.w || viewport.w < 40 || viewport.h < 40) return 1;
    const availableW = viewport.w - GUTTER * 2;
    const availableH = viewport.h - GUTTER * 2;
    const byWidth = availableW / base.w;
    if (fit === "width") return clampScale(byWidth);
    return clampScale(Math.min(byWidth, availableH / base.h));
  }, [base, viewport, fit]);

  const scale = manualScale ?? fitScale;

  /* ---- render the current page ---- */
  useEffect(() => {
    if (status !== "ready") return;
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    let cancelled = false;
    setRendering(true);

    const run = async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;

        const natural = pdfPage.getViewport({ scale: 1 });
        if (baseRef.current.w !== natural.width || baseRef.current.h !== natural.height) {
          baseRef.current = { w: natural.width, h: natural.height };
          setBase(baseRef.current);
        }

        const next = pdfPage.getViewport({ scale });
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(next.width * dpr);
        canvas.height = Math.floor(next.height * dpr);
        canvas.style.width = `${Math.floor(next.width)}px`;
        canvas.style.height = `${Math.floor(next.height)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderTaskRef.current?.cancel();
        const task = pdfPage.render({
          canvasContext: ctx,
          viewport: next,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name !== "RenderingCancelledException" && !cancelled) {
          setRendering(false);
          setErrorMsg(err instanceof Error ? err.message : "Gagal menggambar halaman.");
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [status, page, scale, reloadKey]);

  /* ---- controls ---- */
  const zoom = useCallback(
    (direction: 1 | -1) => {
      const step = scale < 1 ? 0.1 : scale < 2 ? 0.15 : 0.25;
      setManualScale(clampScale(Number((scale + direction * step).toFixed(2))));
    },
    [scale]
  );

  const resetFit = useCallback(
    (mode: FitMode) => {
      setFit(mode);
      setManualScale(null);
    },
    []
  );

  const goPage = useCallback(
    (target: number) => {
      setPage((current) => {
        const next = Math.min(Math.max(1, target), Math.max(1, numPages));
        if (next !== current) {
          scrollRef.current?.scrollTo({ top: 0, left: 0 });
        }
        return next;
      });
    },
    [numPages]
  );

  /* ctrl + wheel zooms the sheet, not the whole page */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setManualScale((current) => clampScale((current ?? fitScale) + (event.deltaY > 0 ? -0.1 : 0.1)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [fitScale]);

  const percent = Math.round(scale * 100);
  const isFitted = manualScale === null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white">
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1.5 border-b border-line bg-paper-deep/70 px-2.5 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goPage(page - 1)}
            disabled={page <= 1}
            aria-label="Halaman sebelumnya"
            className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-ink-soft transition hover:bg-paper disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[70px] text-center text-[11.5px] font-semibold tabular-nums text-ink-soft">
            {numPages ? `${page} / ${numPages}` : "—"}
          </span>
          <button
            type="button"
            onClick={() => goPage(page + 1)}
            disabled={page >= numPages}
            aria-label="Halaman berikutnya"
            className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-ink-soft transition hover:bg-paper disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <span className="hidden h-5 w-px shrink-0 bg-line sm:block" aria-hidden="true" />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoom(-1)}
            aria-label="Perkecil"
            className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-ink-soft transition hover:bg-paper active:scale-95"
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            onClick={() => resetFit(fit)}
            aria-label="Kembalikan ke ukuran pas"
            title="Kembalikan ke ukuran pas"
            className={`min-w-[46px] rounded-md px-1.5 py-1 text-center text-[11.5px] font-bold tabular-nums transition ${
              isFitted ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-paper"
            }`}
          >
            {percent}%
          </button>
          <button
            type="button"
            onClick={() => zoom(1)}
            aria-label="Perbesar"
            className="grid h-8 w-8 place-items-center rounded-md border border-line bg-white text-ink-soft transition hover:bg-paper active:scale-95"
          >
            <Plus size={16} />
          </button>

          <div className="flex overflow-hidden rounded-md border border-line bg-white sm:ml-1">
            <button
              type="button"
              onClick={() => resetFit("page")}
              aria-pressed={isFitted && fit === "page"}
              title="Pas satu halaman"
              className={`inline-flex items-center gap-1 px-2 py-1.5 text-[10.5px] font-bold transition ${
                isFitted && fit === "page" ? "bg-brand text-white" : "text-ink-soft hover:bg-paper"
              }`}
            >
              <Scan size={13} /> Halaman
            </button>
            <button
              type="button"
              onClick={() => resetFit("width")}
              aria-pressed={isFitted && fit === "width"}
              title="Pas lebar layar"
              className={`inline-flex items-center gap-1 px-2 py-1.5 text-[10.5px] font-bold transition ${
                isFitted && fit === "width" ? "bg-brand text-white" : "text-ink-soft hover:bg-paper"
              }`}
            >
              <Maximize2 size={13} /> Lebar
            </button>
          </div>
        </div>
      </div>

      {/* page */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-[#e8e6dd]"
        onContextMenu={(event) => event.preventDefault()}
      >
        {status === "loading" && (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-muted">
            <Loader2 className="animate-spin" size={22} />
            <p className="text-[13px] font-medium">Memuat naskah soal…</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[13px] font-semibold text-danger">Naskah soal gagal dimuat.</p>
            <p className="max-w-sm text-[11.5px] text-muted">{errorMsg}</p>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="btn-ghost">
              <RefreshCw size={14} /> Coba lagi
            </button>
          </div>
        )}

        {status === "ready" && (
          <div className="flex min-h-full min-w-full" style={{ padding: GUTTER }}>
            <div className="relative m-auto w-fit shrink-0">
              <canvas
                ref={canvasRef}
                className="block rounded-sm bg-white shadow-[0_10px_30px_-12px_rgba(13,31,25,0.45)]"
              />
              {rendering && <div className="pointer-events-none absolute inset-0 bg-white/40" />}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-white px-2.5 py-1.5 text-[10.5px] text-muted">
        <span className="inline-flex shrink-0 items-center gap-1 font-bold uppercase tracking-wider text-brand">
          <FileText size={11} /> Naskah Soal
        </span>
        <span className="truncate text-right">
          <span className="hidden sm:inline">Geser untuk membaca · Ctrl + scroll untuk zoom</span>
          <span className="sm:hidden">Geser untuk membaca</span>
          <span className="hidden md:inline"> · tidak dapat disalin</span>
        </span>
      </div>
    </div>
  );
}
