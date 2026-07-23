import { describe, it, expect } from 'vitest';
import { ALL_PROJECTS, getProject } from './projects';
import { SLUGS } from '../three/world';

describe('projects loader', () => {
  it('ALL_PROJECTS has length 8', () => {
    expect(ALL_PROJECTS).toHaveLength(8);
  });

  it('orders 1..8 are unique and sequential', () => {
    const orders = ALL_PROJECTS.map((p) => p.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('slugs match SLUGS from world.ts exactly', () => {
    const projectSlugs = ALL_PROJECTS.map((p) => p.slug);
    expect(projectSlugs).toEqual([...SLUGS]);
  });

  it('getProject("naboso").client is truthy', () => {
    const project = getProject('naboso');
    expect(project.client).toBeTruthy();
  });

  it('getProject("nope") throws', () => {
    expect(() => getProject('nope')).toThrow();
  });

  it('each project has required string fields', () => {
    ALL_PROJECTS.forEach((p) => {
      expect(typeof p.title).toBe('string');
      expect(typeof p.slug).toBe('string');
      expect(typeof p.client).toBe('string');
      expect(typeof p.year).toBe('string');
      expect(typeof p.role).toBe('string');
      expect(typeof p.brief).toBe('string');
    });
  });

  it('each project has required array fields', () => {
    ALL_PROJECTS.forEach((p) => {
      expect(Array.isArray(p.tools)).toBe(true);
      expect(Array.isArray(p.disciplines)).toBe(true);
      expect(Array.isArray(p.process)).toBe(true);
      expect(Array.isArray(p.deliverables)).toBe(true);
    });
  });

  it('pullQuote is optional string when present', () => {
    ALL_PROJECTS.forEach((p) => {
      if (p.pullQuote !== undefined) {
        expect(typeof p.pullQuote).toBe('string');
      }
    });
  });
});
