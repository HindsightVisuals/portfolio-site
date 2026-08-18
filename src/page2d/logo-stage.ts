/**
 * The case study's 3D logo — a scroll-scrubbed Blender clip framed against DOM
 * elements.
 *
 * Its own canvas, above the page (brief 7.4: "the logo and three.js scene
 * should be on top of everything else on the page"), NOT part of the main world
 * scene — that camera is busy holding the WORK wall behind the takeover, and
 * the logo needs its own framing.
 *
 * Three things compose onto the same object, in this order:
 *   1. the mixer writes the animated node's TRS from the Blender clip
 *   2. a parent group carries the DOM-rect framing (position + scale)
 *   3. mouse-tracked rotation and a slow float ride on that same parent
 *
 * The offsets MUST live on the parent. The mixer rewrites the node's transform
 * on every scrub, so anything written to the node itself is overwritten on the
 * next frame.
 *
 * Asset: public/work/spy-hop-logo.glb — one node, one mesh, one clip
 * (`CurveAction`, 3 TRS channels, 45 baked LINEAR keys, 1.5s). Baking at 30fps
 * preserves Blender's bezier easing inside the sample values, so scrubbing with
 * `mixer.setTime()` reproduces the authored motion exactly, with no re-keying.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { approachExp } from '../three/magnet';
import { worldPerPx } from '../three/framing';
import { ease, logoPhase, rectCenter, rectLerp, trackProgress, type Rect } from './logo-track';
import { offsetWithin } from './scroll-offset';

/** Camera distance. Arbitrary — worldPerPx() makes the framing independent of it. */
const CAM_Z = 100;
const FOV = 35;

/** Peak mouse-tracked rotation, radians. A few degrees — it is a lean, not a spin. */
const TILT_MAX = 0.18;
/** How fast the tilt follows the pointer, per second. */
const TILT_EASE = 2.4;
/** Keep-alive float: brief 7.7 asks for 30-50px. */
const FLOAT_PX = 40;
/** Float period, seconds. Slow enough to read as breathing, not bobbing. */
const FLOAT_PERIOD = 6.5;
/** How much of the panel a landed logo fills. Figma leaves it a little air. */
const FIT = 0.86;

export interface LogoStage {
  /** Re-measure after a resize or a reflow. */
  measure(): void;
  destroy(): void;
}

export interface LogoStageOpts {
  reducedMotion: boolean;
  /** Slug — only Spy Hop has a Blender file today; others get no stage. */
  slug: string;
}

/** Which projects have a 3D logo. Data, so adding one is not a code change. */
const LOGO_ASSETS: Record<string, string> = {
  'spy-hop': 'work/spy-hop-logo.glb',
};

export function initLogoStage(
  article: HTMLElement,
  baseUrl: (p: string) => string,
  opts: LogoStageOpts,
): LogoStage | null {
  const asset = LOGO_ASSETS[opts.slug];
  const heroEl = article.querySelector<HTMLElement>('[data-logo-stage]');
  const landingEl = article.querySelector<HTMLElement>('[data-logo-landing]');
  const scroller = article.closest<HTMLElement>('.takeover');
  if (!asset || !heroEl || !landingEl || !scroller) return null;

  const canvas = document.createElement('canvas');
  canvas.className = 'cs-logo-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  article.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearAlpha(0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
  camera.position.z = CAM_Z;

  // The Blender light was dropped on export — the web scene lights itself so
  // the extrusion reads against the near-black page.
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(-3, -1, 2);
  scene.add(rim);

  /** Carries framing + offsets; the clip owns everything inside it. */
  const group = new THREE.Group();
  scene.add(group);

  let mixer: THREE.AnimationMixer | null = null;
  let clipDuration = 0;
  /** The logo's size at the clip's END state — the reference the DOM rect is
   *  matched against, so a LANDED logo fits its panel. The clip's own scale
   *  animation (9.15 -> 3.49 -> 7.37) then plays around that, which is why it
   *  arrives oversized and settles: that is the authored motion, not a bug. */
  let refWidth = 1;
  let refHeight = 1;
  let loaded = false;

  let raf = 0;
  let pointerX = 0;
  let pointerY = 0;
  let tiltX = 0;
  let tiltY = 0;
  let startedAt = 0;
  let landingRestX = 0;
  let heroTop = 0;
  let landingTop = 0;

  const loader = new GLTFLoader();
  loader.load(baseUrl(asset), (gltf) => {
    group.add(gltf.scene);
    if (gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(gltf.scene);
      const clip = gltf.animations[0];
      clipDuration = clip.duration;
      const action = mixer.clipAction(clip);
      action.play();
      // Measure at the END of the clip: that is the state the logo lands in, so
      // matching THAT to the panel is what makes the landing sit correctly. The
      // clip's own scale animation then plays around it, which is the intent.
      mixer.setTime(clipDuration);
    }
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    refWidth = size.x || 1;
    refHeight = size.y || 1;
    // Re-centre the model on its own bounds so framing is about its middle,
    // not about whatever origin Blender happened to leave it at.
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    gltf.scene.position.sub(centre);
    loaded = true;
    measure();
    frame();
  });

  const sizeCanvas = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = scroller.clientWidth;
    const h = scroller.clientHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true); // updateStyle: the CSS box must match the viewport exactly
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const measure = (): void => {
    sizeCanvas();
    landingRestX = landingEl.getBoundingClientRect().x;
    heroTop = offsetWithin(heroEl, scroller);
    landingTop = offsetWithin(landingEl, scroller);
  };

  /** A DOM rect in the canvas's own coordinate space. */
  const localRect = (el: HTMLElement): Rect => {
    const r = el.getBoundingClientRect();
    const host = scroller.getBoundingClientRect();
    return { x: r.x - host.x, y: r.y - host.y, width: r.width, height: r.height };
  };

  const apply = (): void => {
    if (!loaded) return;
    const vpW = scroller.clientWidth;
    const vpH = scroller.clientHeight;
    const wpp = worldPerPx(CAM_Z, FOV, vpH);

    const hero = localRect(heroEl);
    const landing = localRect(landingEl);
    // Measured in the scroller's scroll space, cached at measure() time: the
    // landing panel sits inside the translated strip rail, so reading it live
    // would fold the rail's own travel back into the handover range.
    const startTop = heroTop;
    const endTop = landingTop;
    const progress = trackProgress(scroller.scrollTop, startTop, endTop);
    const target = rectLerp(hero, landing, ease(progress));

    // Scrub the clip with the same progress — the logo animates AS it travels,
    // then holds its landed pose.
    if (mixer) mixer.setTime(progress * clipDuration);

    // Pin the canvas back over the viewport — see .cs-logo-canvas in the CSS.
    canvas.style.transform = `translate3d(0, ${scroller.scrollTop}px, 0)`;

    const c = rectCenter(target);
    // Screen pixels -> world units, origin at the canvas centre, y flipped.
    group.position.x = (c.x - vpW / 2) * wpp;
    group.position.y = -(c.y - vpH / 2) * wpp;

    // Contain-fit, not height-match: the logo is much wider than it is tall, so
    // matching height alone pushed it straight out of the sides of the panel.
    const scale =
      Math.min((target.width * wpp) / refWidth, (target.height * wpp) / refHeight) * FIT;
    group.scale.setScalar(scale);

    const phase = logoPhase(progress, landing.x, landingRestX);
    // Keep-alive float and pointer tilt ride on the framing, never on the
    // animated node — the mixer would overwrite them.
    if (!opts.reducedMotion) {
      const t = (performance.now() - startedAt) / 1000;
      group.position.y += Math.sin((t / FLOAT_PERIOD) * Math.PI * 2) * FLOAT_PX * wpp;
      group.rotation.y = tiltX;
      group.rotation.x = tiltY;
    }
    canvas.dataset.phase = phase;
    renderer.render(scene, camera);
  };

  const frame = (): void => {
    raf = 0;
    if (!opts.reducedMotion) {
      const dt = 1 / 60;
      tiltX = approachExp(tiltX, pointerX * TILT_MAX, dt, TILT_EASE);
      tiltY = approachExp(tiltY, pointerY * TILT_MAX, dt, TILT_EASE);
    }
    apply();
    // The float and the tilt both keep moving with no input, so this loop runs
    // for as long as the page is open rather than parking on idle.
    if (!opts.reducedMotion) raf = requestAnimationFrame(frame);
  };

  const onPointerMove = (e: PointerEvent): void => {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    pointerY = (e.clientY / window.innerHeight) * 2 - 1;
  };

  const onScroll = (): void => {
    // Under reduced motion there is no rAF loop, so scroll drives the frame.
    if (opts.reducedMotion) apply();
  };

  startedAt = performance.now();
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('resize', measure);
  scroller.addEventListener('scroll', onScroll, { passive: true });
  measure();

  return {
    measure,
    destroy(): void {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', measure);
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      mixer?.stopAllAction();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose();
        }
      });
      renderer.dispose();
      canvas.remove();
    },
  };
}
