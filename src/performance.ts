const PREFIX = 'frostbomb:';

export function markPerformance(name: string): void {
  performance.mark(`${PREFIX}${name}`);
}

export function createOneTimeMark(name: string): () => void {
  let marked = false;
  return () => {
    if (marked) return;
    marked = true;
    markPerformance(name);
  };
}

export function measurePerformance<T>(name: string, operation: () => T): T {
  const start = `${name}-start`;
  const end = `${name}-end`;
  markPerformance(start);
  const result = operation();
  markPerformance(end);
  performance.measure(`${PREFIX}${name}`, `${PREFIX}${start}`, `${PREFIX}${end}`);
  return result;
}
