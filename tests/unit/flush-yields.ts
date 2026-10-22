/** Drain `yieldToMain()` fallbacks (`setTimeout(0)`) in unit tests. */
export async function flushMainThreadYields(rounds = 24): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
