import { getHabit, Habit } from './nakaya.ts';

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

  const width = canvas.width;
  const height = canvas.height;

  function toX(temp: number) {
    // 0 to -40 maps to width to 0 (0 on right, -40 on left)
    return ((temp + 40) / 40) * width;
  }

  function toY(ss: number) {
    // 0 to 1 maps to height to 0 (bottom to top)
    return height - ss * height;
  }

  function drawBackground() {
    ctx!.clearRect(0, 0, width, height);

    // We can sample the grid to draw the regions
    const res = 4;
    for (let x = 0; x < width; x += res) {
      for (let y = 0; y < height; y += res) {
        const temp = (x / width) * 40 - 40;
        const ss = (height - y) / height;
        const habit = getHabit(temp, ss);
        ctx!.fillStyle = HABIT_COLORS[habit];
        ctx!.fillRect(x, y, res, res);
      }
    }

    // Grid lines
    ctx!.strokeStyle = 'rgba(230, 237, 245, 0.05)';
    ctx!.lineWidth = 1;
    ctx!.beginPath();
    for (let t = -40; t <= 0; t += 10) {
      const x = toX(t);
      ctx!.moveTo(x, 0);
      ctx!.lineTo(x, height);
    }
    for (let s = 0; s <= 1; s += 0.25) {
      const y = toY(s);
      ctx!.moveTo(0, y);
      ctx!.lineTo(width, y);
    }
    ctx!.stroke();

    // Labels for regions (rough positions)
    ctx!.fillStyle = 'rgba(230, 237, 245, 0.3)';
    ctx!.font = 'italic 8px "JetBrains Mono"';
    ctx!.fillText('Dendrites', toX(-15), toY(0.8));
    ctx!.fillText('Plates', toX(-15), toY(0.2));
    ctx!.fillText('Columns', toX(-7), toY(0.2));
    ctx!.fillText('Needles', toX(-7), toY(0.8));
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

  return {
    update: (path: { temp: number; ss: number }[]) => {
      drawBackground();
      drawPath(path);
    }
  };
}
