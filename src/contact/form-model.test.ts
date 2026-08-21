import { describe, expect, it } from 'vitest';
import { BUDGETS, FIELD_MAX, PROJECT_MAX, type Inquiry } from './inquiry';
import { emptyInquiry, isValid, validate } from './form-model';

const good = (over: Partial<Inquiry> = {}): Inquiry => ({
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '',
  budget: BUDGETS[0],
  project: 'We need a launch film.',
  services: [],
  ...over,
});

describe('emptyInquiry', () => {
  it('starts every field blank and selects nothing', () => {
    const e = emptyInquiry();
    expect(e.name).toBe('');
    expect(e.budget).toBe('');
    expect(e.services).toEqual([]);
  });

  it('returns a fresh object each call — a shared one would leak between opens', () => {
    const a = emptyInquiry();
    a.services.push('Brand Design');
    expect(emptyInquiry().services).toEqual([]);
  });
});

describe('validate — required fields', () => {
  it('accepts a complete inquiry', () => {
    expect(validate(good())).toEqual({});
    expect(isValid(good())).toBe(true);
  });

  it('requires a name', () => {
    expect(validate(good({ name: '' })).name).toBeTruthy();
  });

  it('treats whitespace as absent, not as an answer', () => {
    expect(validate(good({ name: '   ' })).name).toBeTruthy();
    expect(validate(good({ project: ' \n\t ' })).project).toBeTruthy();
  });

  it('requires an email, a budget and a project description', () => {
    expect(validate(good({ email: '' })).email).toBeTruthy();
    expect(validate(good({ budget: '' })).budget).toBeTruthy();
    expect(validate(good({ project: '' })).project).toBeTruthy();
  });

  it('does NOT require a phone — it is marked optional in the design', () => {
    expect(validate(good({ phone: '' })).phone).toBeUndefined();
  });

  it('does NOT require a service — the chips are a multi-select, not a gate', () => {
    expect(validate(good({ services: [] }))).toEqual({});
  });
});

describe('validate — email shape', () => {
  it('rejects an address with no @', () => {
    expect(validate(good({ email: 'ada.example.com' })).email).toBeTruthy();
  });

  it('rejects an address with no domain dot', () => {
    expect(validate(good({ email: 'ada@example' })).email).toBeTruthy();
  });

  it('rejects an address with a space', () => {
    expect(validate(good({ email: 'ada lovelace@example.com' })).email).toBeTruthy();
  });

  it('accepts ordinary addresses, including plus-addressing and subdomains', () => {
    for (const email of ['a@b.co', 'ada+work@mail.example.com', 'ADA@EXAMPLE.COM']) {
      expect(validate(good({ email })).email).toBeUndefined();
    }
  });
});

describe('validate — length caps', () => {
  it('rejects a name past its cap', () => {
    expect(validate(good({ name: 'a'.repeat(FIELD_MAX.name + 1) })).name).toBeTruthy();
  });

  it('accepts a name exactly at the cap — the boundary is inclusive', () => {
    expect(validate(good({ name: 'a'.repeat(FIELD_MAX.name) })).name).toBeUndefined();
  });

  it('rejects a project past the character cap', () => {
    expect(validate(good({ project: 'a'.repeat(PROJECT_MAX + 1) })).project).toBeTruthy();
  });

  it('accepts a project exactly at the cap', () => {
    expect(validate(good({ project: 'a'.repeat(PROJECT_MAX) })).project).toBeUndefined();
  });

  it('rejects a message that is under the character cap but overflows the URL once encoded', () => {
    // The case the character cap cannot see — an emoji costs 12 encoded
    // characters. Without this check the form would hand the browser a URL that
    // silently truncates the visitor's message.
    const emoji = '😀'.repeat(PROJECT_MAX / 2);
    expect(emoji.length).toBeLessThanOrEqual(PROJECT_MAX);
    expect(validate(good({ project: emoji })).project).toBeTruthy();
  });
});

describe('validate — budget must be one of the offered bands', () => {
  it('rejects a band that is not on the list', () => {
    expect(validate(good({ budget: '$1,000,000' })).budget).toBeTruthy();
  });

  it('accepts every offered band', () => {
    for (const budget of BUDGETS) {
      expect(validate(good({ budget })).budget).toBeUndefined();
    }
  });
});

describe('error messages', () => {
  it('are human sentences, not field names or codes', () => {
    const errs = validate({ ...good(), name: '', email: 'nope', budget: '', project: '' });
    for (const msg of Object.values(errs)) {
      expect(msg.length).toBeGreaterThan(8);
      expect(msg).not.toMatch(/^[a-z]+$/); // not a bare token like "required"
    }
  });
});
