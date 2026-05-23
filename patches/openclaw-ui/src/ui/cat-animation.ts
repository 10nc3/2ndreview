/**
 * Pixel Cat Animation — sidebar-brand variant
 * Adapted from BlueDream cat-animation.js for OpenClaw Control UI
 * Smaller scale, simplified physics, self-contained module.
 */

const CAT_CONFIG = Object.freeze({
  CANONICAL_SIZE: 125,
  SCALE: 5.5, // Responsive: cat fills most of the sidebar canvas
  ANIMATION_SPEED: 60,
  JUMP_FRAME_INTERVAL: 18,
  JUMP_HEIGHT: 2.5,
  FLEE_DISTANCE: 100,
  FLEE_STRENGTH: 4,
  COLORS: {
    BODY: "#1a1a1a",
    EAR_INNER: "#3a2a2a",
    EYES: "#22c55e",
    EYE_HIGHLIGHT: "#000000",
    NOSE: "#ec4899",
    WHISKERS: "#ffffff",
  },
});

interface CatState {
  frame: number;
  mouseX: number;
  mouseY: number;
  lastInteraction: number;
  blinkUntil: number;
  nextBlink: number;
  tailPhase: number;
  tailSwing: number;
  lastFrameTime: number;
  tailWagK: number;
  tailWagKNext: number;
  tailWagKChangeAt: number;
  startleEnergy: number;
  wasNear: boolean;
  rafId: number | null;
}

function makeState(): CatState {
  const now = Date.now();
  return {
    frame: 0,
    mouseX: -1000,
    mouseY: -1000,
    lastInteraction: 0,
    blinkUntil: 0,
    nextBlink: now + 5000 + Math.random() * 3000,
    tailPhase: 0,
    tailSwing: 0,
    lastFrameTime: now,
    tailWagK: 0.5 + Math.random() * 0.3,
    tailWagKNext: 0.5 + Math.random() * 0.3,
    tailWagKChangeAt: now + 5000 + Math.random() * 5000,
    startleEnergy: 0,
    wasNear: false,
    rafId: null,
  };
}

function drawPixelCat(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: CatState,
  offsetX: number,
  offsetY: number,
) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Auto-scale: cat fills ~88 % of the smaller canvas dimension
  const minDim = Math.min(W, H);
  const scale = (minDim / CAT_CONFIG.CANONICAL_SIZE) * CAT_CONFIG.SCALE * 0.9;
  const isJump =
    Math.floor(state.frame / CAT_CONFIG.JUMP_FRAME_INTERVAL) % 2 === 0;
  const yOff = isJump ? -CAT_CONFIG.JUMP_HEIGHT * scale : 0;

  const catCX = 20; // cat center X in coord space
  const catCY = 22; // cat center Y
  const centerX = W / 2 - catCX * scale + offsetX;
  const centerY = H / 2 - catCY * scale + offsetY;

  const fill = (x: number, y: number, w: number, h: number) =>
    ctx.fillRect(x * scale + centerX, y * scale + yOff + centerY, w * scale, h * scale);

  // Body
  ctx.fillStyle = CAT_CONFIG.COLORS.BODY;
  fill(14, 22, 12, 8);
  fill(15, 15, 10, 7);
  fill(15, 12, 3, 3); // left ear
  fill(22, 12, 3, 3); // right ear

  // Inner ears
  ctx.fillStyle = CAT_CONFIG.COLORS.EAR_INNER;
  fill(15.75, 12.5, 1.5, 2);
  fill(22.75, 12.5, 1.5, 2);

  // Tail
  ctx.fillStyle = CAT_CONFIG.COLORS.BODY;
  fill(24 + state.tailSwing * 0.4, 24, 2, 5);
  fill(20 + state.tailSwing * 9, 26, 2, 3);

  // Blink
  const now = Date.now();
  const isBlinking = now < state.blinkUntil;
  if (now > state.nextBlink && !isBlinking) {
    state.blinkUntil = now + 260;
    state.nextBlink = now + 5000 + Math.random() * 3000;
  }

  // Eyes
  ctx.fillStyle = CAT_CONFIG.COLORS.EYES;
  const eyeH = isBlinking ? 0.3 * scale : 2 * scale;
  const eyeW = 2 * scale;
  ctx.fillRect(17 * scale + centerX, 17 * scale + yOff + centerY, eyeW, eyeH);
  ctx.fillRect(21 * scale + centerX, 17 * scale + yOff + centerY, eyeW, eyeH);

  // Pupil (vertical slit)
  if (!isBlinking) {
    ctx.fillStyle = CAT_CONFIG.COLORS.EYE_HIGHLIGHT;
    const px = (s: number) => (s + (2 - 0.6) / 2) * scale + centerX;
    const py = (s: number, y: number) => y * scale + yOff + centerY;
    for (const ox of [17, 21]) {
      ctx.fillRect(px(ox), py(ox, 16.95), 0.6 * scale, 0.3 * scale);
      ctx.fillRect((ox + (2 - 0.9) / 2) * scale + centerX, py(ox, 17.25), 0.9 * scale, 0.3 * scale);
      ctx.fillRect((ox + (2 - 1.2) / 2) * scale + centerX, py(ox, 17.55), 1.2 * scale, 0.3 * scale);
      ctx.fillRect((ox + (2 - 1.4) / 2) * scale + centerX, py(ox, 17.85), 1.4 * scale, 0.3 * scale);
      ctx.fillRect((ox + (2 - 1.2) / 2) * scale + centerX, py(ox, 18.15), 1.2 * scale, 0.3 * scale);
      ctx.fillRect((ox + (2 - 0.9) / 2) * scale + centerX, py(ox, 18.45), 0.9 * scale, 0.3 * scale);
      ctx.fillRect((ox + (2 - 0.6) / 2) * scale + centerX, py(ox, 18.75), 0.6 * scale, 0.3 * scale);
    }
  }

  // Nose
  ctx.fillStyle = CAT_CONFIG.COLORS.NOSE;
  fill(19.25, 20, 1.5, 1);

  // Whiskers
  ctx.fillStyle = CAT_CONFIG.COLORS.WHISKERS;
  if (!isJump) {
    fill(12, 19, 2, 1);
    fill(12, 21, 2, 1);
    fill(26, 19, 2, 1);
    fill(26, 21, 2, 1);
  }

  // Paws
  ctx.fillStyle = CAT_CONFIG.COLORS.BODY;
  if (!isJump) {
    fill(15, 30, 3, 2);
    fill(22, 30, 3, 2);
  }
}

function attachListeners(canvas: HTMLCanvasElement, state: CatState) {
  const onMove = (e: MouseEvent) => {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
    state.lastInteraction = Date.now();
  };
  const onLeave = () => {
    state.mouseX = -1000;
    state.mouseY = -1000;
    state.wasNear = false;
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseleave", onLeave);
  return () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseleave", onLeave);
  };
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

export function initSidebarCat(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  resizeCanvas(canvas);
  const state = makeState();
  const cleanup = attachListeners(canvas, state);

  function animate() {
    const now = Date.now();
    const dt = Math.min(now - state.lastFrameTime, 50);
    state.lastFrameTime = now;

    // Resize each frame to track responsive container
    resizeCanvas(canvas);

    // Tail wag
    state.tailWagK += (state.tailWagKNext - state.tailWagK) * 0.002;
    if (now > state.tailWagKChangeAt) {
      state.tailWagKNext = 0.5 + Math.random() * 0.3;
      state.tailWagKChangeAt = now + 5000 + Math.random() * 5000;
    }
    state.startleEnergy *= 0.97;
    state.tailPhase += (dt / (700 * state.tailWagK)) * (1 + state.startleEnergy * 2);
    state.tailSwing = Math.sin(state.tailPhase);

    // Proximity
    const rect = canvas.getBoundingClientRect();
    let offsetX = 0;
    let offsetY = 0;
    const dx = state.mouseX - (rect.left + rect.width / 2);
    const dy = state.mouseY - (rect.top + rect.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    let isNear = false;

    const isIdle = now - state.lastInteraction > 2000;
    if (isIdle && state.mouseX !== -1000) {
      state.mouseX = -1000;
      state.mouseY = -1000;
      state.wasNear = false;
    }

    if (CAT_CONFIG.FLEE_DISTANCE > 0 && !isIdle && dist < CAT_CONFIG.FLEE_DISTANCE) {
      isNear = true;
      const strength = CAT_CONFIG.FLEE_STRENGTH * (1 - dist / CAT_CONFIG.FLEE_DISTANCE);
      offsetX = -(dx / dist) * strength;
      offsetY = -(dy / dist) * strength;
    }

    if (isNear && !state.wasNear) state.startleEnergy = 1.0;
    state.wasNear = isNear;

    drawPixelCat(ctx, canvas, state, offsetX, offsetY);
    state.frame++;
    state.rafId = requestAnimationFrame(animate);
  }

  state.rafId = requestAnimationFrame(animate);

  return () => {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    cleanup();
  };
}
