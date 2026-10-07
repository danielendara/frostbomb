export interface UrlWriteCoalescer {
  /** Run now if the interval has elapsed, otherwise schedule one trailing run. */
  request(): void;
  /** Run a pending write immediately; no-op when nothing is pending. */
  flush(): void;
  /** Drop a pending write without running it. */
  cancel(): void;
}

/**
 * Leading + trailing time throttle for incidental history writes. `write`
 * takes no arguments on purpose: it must rebuild its output from current
 * state when it runs. A throwing `write` is caught and warned about.
 */
export function createUrlWriteCoalescer(
  write: () => void,
  intervalMs: number,
  now: () => number = () => performance.now(),
): UrlWriteCoalescer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRun = Number.NEGATIVE_INFINITY;

  function run(): void {
    timer = null;
    lastRun = now();
    try {
      write();
    } catch (err) {
      console.warn("URL write failed", err);
    }
  }

  return {
    request() {
      if (timer !== null) return;
      const wait = lastRun + intervalMs - now();
      if (wait <= 0) {
        run();
      } else {
        timer = setTimeout(run, wait);
      }
    },
    flush() {
      if (timer === null) return;
      clearTimeout(timer);
      run();
    },
    cancel() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}
