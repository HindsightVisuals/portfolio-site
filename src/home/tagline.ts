import gsap from 'gsap';

const IN_DURATION = 1.2;
const OUT_DURATION = 1.2;
const FLOAT_PX = 4;
const FLOAT_CYCLE_S = 8;
/* dissolve endpoints */
const SCALE_DISSOLVED = 140; // feDisplacementMap scale when fully dissolved
const BLUR_DISSOLVED = 10;
/* the subtle "W" wave — slow oscillation of the noise frequency for variation */
const BASE_FREQ_X = 0.02;
const BASE_FREQ_Y = 0.028;
const WAVE_FREQ_Y = 0.034;
const WAVE_CYCLE_S = 3.5;

export interface TaglineHandle {
  dissolveIn(): Promise<void>;
  dissolveOut(): Promise<void>;
  startFloat(): void;
  stop(): void;
  hideInstant(): void;
}

export function initTagline(el: HTMLElement): TaglineHandle {
  const turbulence = document.querySelector('#dissolve feTurbulence');
  const displacement = document.querySelector('#dissolve feDisplacementMap');
  const blur = document.querySelector('#dissolve feGaussianBlur');
  if (!turbulence || !displacement || !blur) throw new Error('#dissolve filter primitives not found');

  el.style.filter = 'url(#dissolve)';

  const state = { scale: SCALE_DISSOLVED, blur: BLUR_DISSOLVED, bfy: BASE_FREQ_Y };
  const apply = (): void => {
    displacement.setAttribute('scale', String(state.scale));
    blur.setAttribute('stdDeviation', String(state.blur));
    turbulence.setAttribute('baseFrequency', `${BASE_FREQ_X} ${state.bfy}`);
  };
  apply();
  gsap.set(el, { opacity: 0 });

  let floatTween: gsap.core.Tween | null = null;
  let waveTween: gsap.core.Tween | null = null;

  const startWave = (): void => {
    waveTween ??= gsap.to(state, {
      bfy: WAVE_FREQ_Y,
      duration: WAVE_CYCLE_S,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      onUpdate: apply,
    });
  };

  const stopTweens = (): void => {
    floatTween?.kill();
    waveTween?.kill();
    floatTween = null;
    waveTween = null;
  };

  return {
    dissolveIn(): Promise<void> {
      startWave();
      return new Promise((resolve) => {
        gsap.to(el, { opacity: 1, duration: IN_DURATION, ease: 'power2.out' });
        gsap.to(state, {
          scale: 0,
          blur: 0,
          duration: IN_DURATION,
          ease: 'power2.out',
          onUpdate: apply,
          onComplete: resolve,
        });
      });
    },

    dissolveOut(): Promise<void> {
      return new Promise((resolve) => {
        gsap.to(el, { opacity: 0, duration: OUT_DURATION, ease: 'power2.in' });
        gsap.to(state, {
          scale: SCALE_DISSOLVED,
          blur: BLUR_DISSOLVED,
          duration: OUT_DURATION,
          ease: 'power2.in',
          onUpdate: apply,
          onComplete: resolve,
        });
      });
    },

    startFloat(): void {
      floatTween ??= gsap.fromTo(
        el,
        { x: -FLOAT_PX, y: -FLOAT_PX },
        { x: FLOAT_PX, y: FLOAT_PX, duration: FLOAT_CYCLE_S, ease: 'sine.inOut', yoyo: true, repeat: -1 },
      );
    },

    stop(): void {
      stopTweens();
    },

    hideInstant(): void {
      stopTweens();
      gsap.set(el, { opacity: 0 });
    },
  };
}
