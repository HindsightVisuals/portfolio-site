/**
 * Lazy entry point for everything a 2D takeover page needs.
 *
 * None of this is reachable until the user opens a case study or About, but all
 * of it used to ship in the initial bundle — including GLTFLoader, which only
 * the case study's 3D logo uses, and the whole case-study stylesheet. Lighthouse
 * measured 97 KiB of unused JavaScript on first load as a result.
 *
 * Re-exported through one module so main.ts pays for exactly one dynamic import
 * rather than nine, and so the bundler can put the lot in a single chunk.
 * `src/lab/fly.ts` already established this pattern.
 */

export { buildCaseStudy } from './case-study';
export { buildContact } from './contact';
export { buildNavbar } from './navbar';
export { mountReveal } from './reveal';
export { initStrip } from './strip';
export { initLogoStage } from './logo-stage';
export { initRdSurface } from './rd-surface';
export { mountCurtain } from './curtain-live';
export { initBehindPanel } from './behind-panel';
