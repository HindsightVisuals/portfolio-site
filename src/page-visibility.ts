/**
 * Subscribe to page visibility.
 *
 * Every animation loop on this site — the world stage, the cursor, the case
 * study's logo, its RD field, its curtain — ran unconditionally, forever. Chrome
 * throttles rAF in a background tab but does not stop it, and a WebGL loop that
 * keeps stepping a simulation in a tab nobody is looking at is pure heat and
 * battery. One helper so every loop gates the same way.
 *
 * Both functions tolerate a missing `document`: stage.ts is unit-tested in
 * vitest's node environment, and a visibility gate must not be the thing that
 * makes it un-testable.
 */

const hasDocument = (): boolean => typeof document !== 'undefined';

export function onPageVisibility(cb: (visible: boolean) => void): () => void {
  if (!hasDocument()) return () => {};
  const handler = (): void => cb(!document.hidden);
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

/** Current visibility, for a loop deciding whether to start at all. */
export function pageVisible(): boolean {
  return hasDocument() ? !document.hidden : true;
}
