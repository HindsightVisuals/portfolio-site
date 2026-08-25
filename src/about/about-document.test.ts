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
  return { parent, doc: mountAboutDocument(parent, path, h, () => buildFooter({ onNav: () => {} })) };
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
});
