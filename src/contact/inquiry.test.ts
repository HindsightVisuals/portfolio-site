import { describe, expect, it } from 'vitest';
import { BUDGETS, CONTACT_EMAIL, FIELD_MAX, PROJECT_MAX, SERVICES } from './inquiry';

describe('BUDGETS', () => {
  it('carries the five bands from the design, in order and verbatim', () => {
    expect(BUDGETS).toEqual([
      '$5,000 or under',
      '$5,500–$12,000',
      '$12,000–$25,000',
      '$25,000–$50K',
      'Above $50K',
    ]);
  });

  it('is an input band the visitor picks, never a quote — no band is a single number', () => {
    // Guards the anti-anchoring rule in the spec: budget is chosen, not estimated.
    for (const b of BUDGETS) expect(b).toMatch(/under|–|Above/);
  });
});

describe('SERVICES', () => {
  it('carries all eleven chips from Figma 85:1227, in order and verbatim', () => {
    expect(SERVICES).toEqual([
      'Brand Design',
      'Landing Page',
      '3D Rendering',
      'Product Rendering',
      'eCommerce',
      'Marketing Site',
      '3D Animation',
      '3D Website',
      'User Experience Design',
      'Brand Strategy',
      'App Design',
    ]);
  });

  it('has exactly eleven, matching the spec', () => {
    expect(SERVICES).toHaveLength(11);
  });

  it('has no duplicates — a duplicate chip would double-submit a service', () => {
    expect(new Set(SERVICES).size).toBe(SERVICES.length);
  });
});

describe('CONTACT_EMAIL', () => {
  it("is Adam's real address", () => {
    expect(CONTACT_EMAIL).toBe('adam.tarr.studio@gmail.com');
  });
});

describe('FIELD_MAX', () => {
  it('bounds every free-text field that is not the project description', () => {
    expect(FIELD_MAX.name).toBeGreaterThan(0);
    expect(FIELD_MAX.email).toBeGreaterThan(0);
    expect(FIELD_MAX.phone).toBeGreaterThan(0);
  });
});

describe('PROJECT_MAX', () => {
  it('leaves room for a real brief', () => {
    expect(PROJECT_MAX).toBeGreaterThanOrEqual(1000);
  });

  it('is a plain character cap for the textarea, not a URL guarantee', () => {
    // The guarantee is fitsInMailto() in mailto.ts — an emoji encodes to 12
    // characters, so no character count can bound a URL length. See mailto.ts.
    expect(Number.isInteger(PROJECT_MAX)).toBe(true);
  });
});
