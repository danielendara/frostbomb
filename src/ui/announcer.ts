/**
 * Screen reader live region debouncer and announcer.
 */
export function announce(message: string): void {
  const announcer = document.getElementById("a11y-announcer");
  if (announcer) {
    announcer.textContent = "";
    // Small delay to ensure the DOM change is registered so identical consecutive messages are re-read
    setTimeout(() => {
      announcer.textContent = message;
    }, 50);
  }
}
