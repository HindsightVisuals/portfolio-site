import { describe, expect, it } from 'vitest';
import {
  SPINE_PERIOD,
  nearestWrapped,
  resolveSnapTargetLooped,
  sameSpot,
  wrapDelta,
} from './loop';

const RESTS = [34, -26, -86, -146]; // home, work, about, contact

describe('wrapDelta', () => {
  it('returns the plain delta when it is already shortest', () => {
    expect(wrapDelta(34, -26)).toBe(-60);
    expect(wrapDelta(-26, 34)).toBe(60);
  });
  it('wraps when the other direction is shorter', () => {
    // contact (-146) to home (34): +180 plain, -60 wrapped — wrapped wins
    expect(wrapDelta(-146, 34)).toBe(-60);
    expect(wrapDelta(34, -146)).toBe(60);
  });
});

describe('nearestWrapped', () => {
  it('returns the anchor instance nearest the reference', () => {
    expect(nearestWrapped(34, 30)).toBe(34);
    expect(nearestWrapped(34, -190)).toBe(-206); // home's next instance down-spine
    expect(nearestWrapped(-146, 80)).toBe(94);   // contact's instance above home
  });
});

describe('sameSpot', () => {
  it('matches across wraps', () => {
    expect(sameSpot(34, -206)).toBe(true);
    expect(sameSpot(34, 94)).toBe(false);
    expect(sameSpot(-146, 94)).toBe(true);
  });
});

describe('resolveSnapTargetLooped', () => {
  it('behaves like linear snap inside one period', () => {
    expect(resolveSnapTargetLooped(30, 0, RESTS)).toBe(34);
    expect(resolveSnapTargetLooped(20, -5, RESTS)).toBe(-26);
  });
  it('continues past contact to the next home instance', () => {
    expect(resolveSnapTargetLooped(-160, -5, RESTS)).toBe(-206);
  });
  it('continues up past home to the previous contact instance', () => {
    expect(resolveSnapTargetLooped(50, 5, RESTS)).toBe(94);
  });
  it('period sanity', () => {
    expect(SPINE_PERIOD).toBe(240);
  });
});
