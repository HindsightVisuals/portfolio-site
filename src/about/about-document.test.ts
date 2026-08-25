// @vitest-environment jsdom
// src/about/about-document.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAboutPath } from './about-path';
import { documentHeightFor } from './about-scrub';
import { ABOUT_MARKERS } from './about-markers';
import { mountAboutDocument } from './about-document';
import { DESTINATIONS } from '../three/world';
import { buildFooter } from '../page2d/footer';

const ANCHOR_Z = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ; // -26
const path = buildAboutPath(new THREE.Vector3(0, 0, ANCHOR_Z));

const mount = (h = 1000) => {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  // The footer callback now receives the gate element and must actually
  // place it (as buildFooter's `gate` slot) for it to mount at all — the
  // panel no longer gets appended to the beat directly by
  // mountAboutDocument, it only reaches the DOM through the footer it's
  // handed to. See about-document.ts and this task's report.
  return {
    parent,
    doc: mountAboutDocument(parent, path, h, (gate) => buildFooter({ onNav: () => {}, gate })),
  };
};

describe('mountAboutDocument', () => {
  it('mounts one section per beat, in path order', () => {
    const { doc, parent } = mount();
    const ids = [...doc.root.querySelectorAll('[data-beat]')].map((s) => s.getAttribute('data-beat'));
    expect(ids).toEqual(ABOUT_MARKERS.map((m) => m.id));
    doc.destroy();
    parent.remove();
  });

  it('is exactly as tall as the path pacing asks for', () => {
    const { doc, parent } = mount(1000);
    const total = ABOUT_MARKERS.reduce(
      (sum, m) => sum + parseFloat(doc.sectionFor(m.id).style.height),
      0,
    );
    expect(total).toBeCloseTo(documentHeightFor(path, 1000), 0);
    doc.destroy();
    parent.remove();
  });

  it('gives each beat a share of the height proportional to its span on the path', () => {
    const { doc, parent } = mount(1000);
    const h = (i: number): number => parseFloat(doc.sectionFor(ABOUT_MARKERS[i].id).style.height);
    const span = (i: number): number =>
      path.tForBeat(ABOUT_MARKERS[i + 1].id) - path.tForBeat(ABOUT_MARKERS[i].id);
    // capabilities->contact is a longer stretch of path than lander->team, so
    // it must be a taller section, or the scrub would race through it.
    expect(span(5) > span(2)).toBe(true);
    expect(h(5)).toBeGreaterThan(h(2));
    doc.destroy();
    parent.remove();
  });

  it('re-sizes every section when the viewport changes', () => {
    const { doc, parent } = mount(1000);
    const before = parseFloat(doc.sectionFor('lander').style.height);
    doc.resize(2000);
    expect(parseFloat(doc.sectionFor('lander').style.height)).toBeCloseTo(before * 2, 0);
    doc.destroy();
    parent.remove();
  });

  it('reads as a document with the canvas gone — landmark plus a heading per beat', () => {
    const { doc, parent } = mount();
    expect(doc.root.tagName).toBe('MAIN');
    for (const m of ABOUT_MARKERS) {
      expect(doc.sectionFor(m.id).querySelector('h2')).not.toBeNull();
    }
    doc.destroy();
    parent.remove();
  });

  it('removes itself cleanly', () => {
    const { doc, parent } = mount();
    doc.destroy();
    expect(parent.querySelector('main')).toBeNull();
    parent.remove();
  });

  it('mounts the site footer in the last beat', () => {
    const { doc, parent } = mount();
    expect(doc.sectionFor('ai').querySelector('footer.cs-footer')).not.toBeNull();
    doc.destroy();
    parent.remove();
  });

  // Changed for this task: the gate used to be appended to the beat as a
  // sibling of the footer, presented as a fixed panel floating over the
  // world. The designer's mockup (Figma 110:2) puts it INSIDE the footer's
  // own bottom band instead — a sibling of the WORK/ABOUT/CONTACT nav column,
  // not of the footer itself — so this now also pins that it is a descendant
  // of the footer, not merely of the last beat.
  it('mounts the gate indicator inside the footer, in the last beat, with its label', () => {
    const { doc, parent } = mount();
    const last = doc.sectionFor('ai');
    const footer = last.querySelector('footer.cs-footer');
    expect(footer).not.toBeNull();
    const gate = last.querySelector('.about-gate');
    expect(gate).not.toBeNull();
    expect(footer!.contains(gate)).toBe(true);
    expect(gate!.textContent).toContain('keep scrolling to return home');
    expect(gate!.querySelector('.about-gate-fill')).not.toBeNull();
    doc.destroy();
    parent.remove();
  });
});
