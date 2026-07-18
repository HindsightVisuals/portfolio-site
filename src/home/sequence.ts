import type { TaglineHandle } from './tagline';
import type { ReticleField } from './reticles';

const HOLD_SECONDS = 4;

export interface SequenceDeps {
  tagline: TaglineHandle;
  reticles: ReticleField;
  reducedMotion: boolean;
  holdSeconds?: number;
  shouldAbort?: () => boolean;
}

const delay = (s: number): Promise<void> => new Promise((r) => setTimeout(r, s * 1000));

/** Intro: tagline dissolves in, floats ~4s, dissolves out, then reticles build on. */
export async function runHomeSequence({
  tagline,
  reticles,
  reducedMotion,
  holdSeconds = HOLD_SECONDS,
  shouldAbort,
}: SequenceDeps): Promise<void> {
  if (reducedMotion) {
    tagline.hideInstant();
    reticles.showInstant();
    return;
  }
  await tagline.dissolveIn();
  if (shouldAbort?.()) return;
  tagline.startFloat();
  await delay(holdSeconds);
  if (shouldAbort?.()) return;
  await tagline.dissolveOut();
  tagline.stop();
  if (shouldAbort?.()) return;
  await reticles.buildOn();
}
