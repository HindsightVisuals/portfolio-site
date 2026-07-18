import gsap from 'gsap';
import { initStage } from '../three/stage';
import { initBackgroundLayer } from '../three/background';
import { initWorld, DESTINATIONS } from '../three/world';
import { initCameraDirector } from '../three/camera-director';
import { initReticles } from '../home/reticles';

export function initFlyLab(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
  if (!canvas) throw new Error('#bg-canvas not found');

  // hide the normal homepage DOM except chrome; lab drives everything
  document.querySelector<HTMLElement>('.tagline')?.style.setProperty('display', 'none');

  // Populate the reticle field so the home DOM has real content to hide/restore
  const fieldEl = document.querySelector<HTMLElement>('.reticle-field');
  if (fieldEl) initReticles(fieldEl, { reducedMotion: false }).showInstant();

  const stage = initStage(canvas, { reducedMotion: false });
  stage.addLayer(initBackgroundLayer(stage.renderer, { reducedMotion: false, debug: false }));
  const world = initWorld({ reducedMotion: false });
  stage.addLayer(world);
  const director = initCameraDirector(world.camera, DESTINATIONS);
  world.setVelocitySource(() => director.getVelocity());
  stage.onFrame((dt) => director.update(dt));

  const chromeEl = document.querySelector<HTMLElement>('.chrome');

  const hideHomeDom = (): void => {
    if (chromeEl) gsap.set(chromeEl, { autoAlpha: 0 });
    if (fieldEl) {
      fieldEl.style.opacity = '0';
      fieldEl.style.pointerEvents = 'none';
    }
  };

  const showHomeDom = (): void => {
    if (chromeEl) gsap.set(chromeEl, { autoAlpha: 1 });
    if (fieldEl) {
      fieldEl.style.opacity = '1';
      fieldEl.style.pointerEvents = '';
    }
  };

  const reset = (): void => {
    director.jumpTo('home');
    world.setHomeMockVisible(false);
    showHomeDom();
    help.textContent = helpText();
  };

  const fly = (): void => {
    // real treatment-B path: hide chrome/reticle field instantly, show the
    // 3D mock, then restore + hide the mock on arrival.
    hideHomeDom();
    world.setHomeMockVisible(true);
    void director.flyTo('work').then(() => {
      world.setHomeMockVisible(false);
      showHomeDom();
      help.textContent = `${helpText()} — landed. R to reset.`;
    });
  };

  const helpText = (): string => 'FLY LAB · SPACE=fly · R=reset';

  const help = document.createElement('div');
  help.style.cssText =
    'position:fixed;bottom:16px;left:16px;z-index:99;font:12px monospace;color:#141414;background:#ffffffcc;padding:8px 12px;';
  help.textContent = helpText();
  document.body.appendChild(help);

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') fly();
    if (e.key === 'r' || e.key === 'R') reset();
  });

  stage.start();
}
