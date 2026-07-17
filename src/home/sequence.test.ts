import { describe, expect, it } from 'vitest';
import { runHomeSequence } from './sequence';

function fakes() {
  const calls: string[] = [];
  const tagline = {
    dissolveIn: async () => { calls.push('dissolveIn'); },
    dissolveOut: async () => { calls.push('dissolveOut'); },
    startFloat: () => { calls.push('startFloat'); },
    stop: () => { calls.push('stop'); },
    hideInstant: () => { calls.push('hideInstant'); },
  };
  const reticles = {
    buildOn: async () => { calls.push('buildOn'); },
    showInstant: () => { calls.push('showInstant'); },
    destroy: () => {},
  };
  return { calls, tagline, reticles };
}

describe('runHomeSequence', () => {
  it('runs dissolve → float → hold → dissolve out → reticles, in order', async () => {
    const { calls, tagline, reticles } = fakes();
    await runHomeSequence({ tagline, reticles, reducedMotion: false, holdSeconds: 0.01 });
    expect(calls).toEqual(['dissolveIn', 'startFloat', 'dissolveOut', 'stop', 'buildOn']);
  });

  it('reduced motion: hides tagline and shows reticles immediately', async () => {
    const { calls, tagline, reticles } = fakes();
    await runHomeSequence({ tagline, reticles, reducedMotion: true });
    expect(calls).toEqual(['hideInstant', 'showInstant']);
  });
});
