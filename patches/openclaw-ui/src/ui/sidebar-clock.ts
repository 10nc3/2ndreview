/**
 * Sidebar Clock — Digital + Analog modes
 * Expanded: HH:MM:SS - DD-MMM-YY
 * Collapsed: Analog canvas clock face
 */

interface ClockState {
  rafId: number | null;
  intervalId: ReturnType<typeof setInterval> | null;
}

function makeState(): ClockState {
  return { rafId: null, intervalId: null };
}

function formatTimeBangkok(now: Date): string {
  // Bangkok is UTC+7
  const bangkokTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  const hh = String(bangkokTime.getUTCHours()).padStart(2, "0");
  const mm = String(bangkokTime.getUTCMinutes()).padStart(2, "0");
  const ss = String(bangkokTime.getUTCSeconds()).padStart(2, "0");
  const dd = String(bangkokTime.getUTCDate()).padStart(2, "0");
  const mmm = bangkokTime.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const yy = String(bangkokTime.getUTCFullYear()).slice(-2);
  return `${hh}:${mm}:${ss} - ${dd}-${mmm}-${yy}`;
}

function drawAnalogClock(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  now: Date,
) {
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(cx, cy) - 2;

  ctx.clearRect(0, 0, W, H);

  // Face
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tick marks
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const isMajor = i % 3 === 0;
    const tickLen = isMajor ? 4 : 2;
    const innerR = r - tickLen - 1;
    const outerR = r - 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
    ctx.strokeStyle = isMajor ? "rgba(148, 163, 184, 0.5)" : "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = isMajor ? 1.2 : 0.6;
    ctx.stroke();
  }

  // Bangkok time
  const bangkokTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  const hrs = bangkokTime.getUTCHours() % 12;
  const mins = bangkokTime.getUTCMinutes();
  const secs = bangkokTime.getUTCSeconds();
  const ms = bangkokTime.getUTCMilliseconds();

  // Hour hand
  const hrAngle = ((hrs + mins / 60) * 30 - 90) * (Math.PI / 180);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hrAngle) * (r * 0.45), cy + Math.sin(hrAngle) * (r * 0.45));
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.stroke();

  // Minute hand
  const minAngle = ((mins + secs / 60) * 6 - 90) * (Math.PI / 180);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(minAngle) * (r * 0.7), cy + Math.sin(minAngle) * (r * 0.7));
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.stroke();

  // Second hand
  const secAngle = ((secs + ms / 1000) * 6 - 90) * (Math.PI / 180);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(secAngle) * (r * 0.8), cy + Math.sin(secAngle) * (r * 0.8));
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 0.8;
  ctx.lineCap = "round";
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fillStyle = "#3b82f6";
  ctx.fill();
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.round(rect.width * dpr);
  const targetH = Math.round(rect.height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
}

export function initSidebarClock(
  digitalEl: HTMLElement,
  canvas: HTMLCanvasElement,
  getCollapsed: () => boolean,
) {
  const state = makeState();

  function updateDigital() {
    digitalEl.textContent = formatTimeBangkok(new Date());
  }

  function animateAnalog() {
    resizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawAnalogClock(ctx, canvas, new Date());
    state.rafId = requestAnimationFrame(animateAnalog);
  }

  function sync() {
    const collapsed = getCollapsed();
    if (collapsed) {
      // Show analog
      digitalEl.style.display = "none";
      canvas.style.display = "block";
      if (!state.rafId) {
        state.rafId = requestAnimationFrame(animateAnalog);
      }
      if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = null;
      }
    } else {
      // Show digital
      digitalEl.style.display = "";
      canvas.style.display = "none";
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
      updateDigital();
      if (!state.intervalId) {
        state.intervalId = setInterval(updateDigital, 1000);
      }
    }
  }

  sync();

  return {
    sync,
    cleanup() {
      if (state.rafId) cancelAnimationFrame(state.rafId);
      if (state.intervalId) clearInterval(state.intervalId);
    },
  };
}
