let context: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

/** Call from a click handler so the browser lets us play sounds later. */
export function unlockAudio() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    /* ignore */
  }
}

let activeNodes: { stop: () => void } | null = null;

/**
 * Two-tone siren that repeats a few times — loud enough to be a real warning,
 * short enough not to be unbearable.
 */
export function playAlarm(severity: "warning" | "lock" = "warning") {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  stopAlarm();

  const repeats = severity === "lock" ? 4 : 2;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const start = ctx.currentTime + 0.02;
  const cycle = 0.62;
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.22, start + 0.04);

  for (let i = 0; i < repeats; i += 1) {
    const base = start + i * cycle;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(760, base);
    osc.frequency.linearRampToValueAtTime(1040, base + 0.16);
    osc.frequency.linearRampToValueAtTime(760, base + 0.32);
    osc.frequency.linearRampToValueAtTime(1040, base + 0.46);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, base);
    gain.gain.exponentialRampToValueAtTime(0.9, base + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, base + 0.58);
    osc.connect(gain).connect(master);
    osc.start(base);
    osc.stop(base + 0.58);
  }

  const total = repeats * cycle + 0.1;
  master.gain.setValueAtTime(0.22, start + total - 0.12);
  master.gain.exponentialRampToValueAtTime(0.0001, start + total);

  const timer = window.setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
  }, (total + 0.4) * 1000);

  activeNodes = {
    stop: () => {
      window.clearTimeout(timer);
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(0.0001, ctx.currentTime);
        master.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export function stopAlarm() {
  activeNodes?.stop();
  activeNodes = null;
}

/**
 * Nada pendek dua ketuk untuk notifikasi pengawas — jauh lebih tenang daripada
 * sirine peserta, cukup untuk menarik perhatian di ruang guru.
 */
export function playNotify() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const start = ctx.currentTime + 0.02;
  [0, 0.22].forEach((offset, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = start + offset;
    osc.type = "sine";
    osc.frequency.setValueAtTime(index === 0 ? 880 : 1180, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.18);
  });
}

/** Best effort: clear whatever the OS clipboard captured on a screenshot attempt. */
export function wipeClipboard() {
  try {
    void navigator.clipboard?.writeText("").catch(() => {});
  } catch {
    /* ignore */
  }
}
