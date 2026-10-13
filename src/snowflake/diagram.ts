import { getHabit, Habit, LAB_TEMP_MAX_C, LAB_TEMP_MIN_C } from './nakaya';

const HABIT_COLORS: Record<Habit, string> = {
  plate: 'rgba(158, 201, 255, 0.15)',
  sector_plate: 'rgba(158, 201, 255, 0.25)',
  stellar_dendrite: 'rgba(158, 201, 255, 0.4)',
  fernlike_dendrite: 'rgba(158, 201, 255, 0.5)',
  needle: 'rgba(138, 155, 176, 0.2)',
  column: 'rgba(138, 155, 176, 0.1)',
  capped_column: 'rgba(138, 155, 176, 0.3)',
};

export function initNakayaDiagram(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Logical size (drawing units) comes from the initial attributes; the backing
  // store is scaled by devicePixelRatio so the diagram stays sharp on HiDPI.
  const width = canvas.width;
  const height = canvas.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function toX(temp: number) {
    // 0 to -40 maps to width to 0 (0 on right, -40 on left)
    return ((temp - LAB_TEMP_MIN_C) / (LAB_TEMP_MAX_C - LAB_TEMP_MIN_C)) * width;
  }

  function toY(ss: number) {
    // 0 to 1 maps to height to 0 (bottom to top)
    return height - ss * height;
  }

  // Cache static background (morphology regions, grid, labels) to offscreen canvas
  const cacheCanvas = document.createElement('canvas');
  cacheCanvas.width = canvas.width;
  cacheCanvas.height = canvas.height;
  const cacheCtx = cacheCanvas.getContext('2d');
  cacheCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);

  function drawBackground() {
    if (!cacheCtx) return;
    cacheCtx.clearRect(0, 0, width, height);

    // Sample morphology regions (high-density grid)
    const res = 4;
    for (let x = 0; x < width; x += res) {
      for (let y = 0; y < height; y += res) {
        const temp = (x / width) * (LAB_TEMP_MAX_C - LAB_TEMP_MIN_C) + LAB_TEMP_MIN_C;
        const ss = (height - y) / height;
        const habit = getHabit(temp, ss);
        cacheCtx.fillStyle = HABIT_COLORS[habit];
        cacheCtx.fillRect(x, y, res, res);
      }
    }

    // Grid lines
    cacheCtx.strokeStyle = 'rgba(230, 237, 245, 0.05)';
    cacheCtx.lineWidth = 1;
    cacheCtx.beginPath();
    for (let t = LAB_TEMP_MIN_C; t <= LAB_TEMP_MAX_C; t += 10) {
      const x = toX(t);
      cacheCtx.moveTo(x, 0);
      cacheCtx.lineTo(x, height);
    }
    for (let s = 0; s <= 1; s += 0.25) {
      const y = toY(s);
      cacheCtx.moveTo(0, y);
      cacheCtx.lineTo(width, y);
    }
    cacheCtx.stroke();

    // Labels
    cacheCtx.fillStyle = 'rgba(230, 237, 245, 0.3)';
    cacheCtx.font = 'italic 8px "JetBrains Mono"';
    cacheCtx.fillText('Dendrites', toX(-15), toY(0.8));
    cacheCtx.fillText('Plates', toX(-15), toY(0.2));
    cacheCtx.fillText('Columns', toX(-7), toY(0.2));
    cacheCtx.fillText('Needles', toX(-7), toY(0.8));
  }

  drawBackground();

  let isDisposed = false;
  let lastPath: { temp: number; ss: number }[] = [];
  let lastPreview: { temp: number; ss: number } | undefined;
  // Re-draw background when fonts are ready to ensure JetBrains Mono is used
  if (document.fonts) {
    document.fonts.ready.then(() => {
      if (isDisposed) return;
      drawBackground();
      render();
    });
  }

  function drawPath(path: { temp: number; ss: number }[]) {
    if (path.length === 0) return;

    // Draw the path line
    ctx!.beginPath();
    ctx!.strokeStyle = 'rgba(255, 199, 138, 0.6)'; // accent-hot
    ctx!.lineWidth = 2;
    ctx!.setLineDash([2, 2]);
    ctx!.moveTo(toX(path[0].temp), toY(path[0].ss));
    for (let i = 1; i < path.length; i++) {
      ctx!.lineTo(toX(path[i].temp), toY(path[i].ss));
    }
    ctx!.stroke();
    ctx!.setLineDash([]);

    // Draw start/end points
    const start = path[0];
    const end = path[path.length - 1];

    ctx!.fillStyle = '#ffc78a';
    ctx!.beginPath();
    ctx!.arc(toX(start.temp), toY(start.ss), 3, 0, Math.PI * 2);
    ctx!.fill();

    ctx!.strokeStyle = '#ffc78a';
    ctx!.beginPath();
    ctx!.arc(toX(end.temp), toY(end.ss), 5, 0, Math.PI * 2);
    ctx!.stroke();
  }

  function drawPreviewPoint(point: { temp: number; ss: number }) {
    const x = toX(point.temp);
    const y = toY(point.ss);

    ctx!.save();
    ctx!.strokeStyle = 'rgba(230, 237, 245, 0.25)';
    ctx!.lineWidth = 1;
    ctx!.setLineDash([2, 4]);

    // Horizontal alignment guide
    ctx!.beginPath();
    ctx!.moveTo(0, y);
    ctx!.lineTo(width, y);
    ctx!.stroke();

    // Vertical alignment guide
    ctx!.beginPath();
    ctx!.moveTo(x, 0);
    ctx!.lineTo(x, height);
    ctx!.stroke();

    // Preview point dot
    ctx!.fillStyle = 'rgba(255, 199, 138, 0.8)';
    ctx!.beginPath();
    ctx!.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx!.fill();

    ctx!.restore();
  }

  function render() {
    ctx!.clearRect(0, 0, width, height);
    // Fast blit of pre-rendered background at logical size
    ctx!.drawImage(cacheCanvas, 0, 0, width, height);
    drawPath(lastPath);
    if (lastPreview) {
      drawPreviewPoint(lastPreview);
    }
  }

  return {
    update: (path: { temp: number; ss: number }[], previewPoint?: { temp: number; ss: number }) => {
      if (isDisposed) return;
      lastPath = path;
      lastPreview = previewPoint;
      render();
    },
    dispose: () => {
      isDisposed = true;
    }
  };
}
