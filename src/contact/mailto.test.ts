import { describe, expect, it } from 'vitest';
import { BUDGETS, CONTACT_EMAIL, FIELD_MAX, PROJECT_MAX, SERVICES, type Inquiry } from './inquiry';
import { buildMailtoUrl, fitsInMailto, MAILTO_URL_MAX } from './mailto';

const base: Inquiry = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '',
  budget: BUDGETS[1],
  project: 'A short brief.',
  services: ['3D Rendering'],
};

describe('buildMailtoUrl', () => {
  it('addresses the mail to the contact address', () => {
    expect(buildMailtoUrl(base)).toMatch(new RegExp(`^mailto:${CONTACT_EMAIL}\\?`));
  });

  it('carries every answered field into the body', () => {
    const url = decodeURIComponent(buildMailtoUrl(base));
    expect(url).toContain('Ada Lovelace');
    expect(url).toContain('ada@example.com');
    expect(url).toContain(BUDGETS[1]);
    expect(url).toContain('A short brief.');
    expect(url).toContain('3D Rendering');
  });

  it('omits the phone line entirely when it is blank, rather than printing an empty label', () => {
    const url = decodeURIComponent(buildMailtoUrl(base));
    expect(url).not.toMatch(/Phone:\s*$/m);
    expect(url).not.toContain('Phone:\n');
  });

  it('includes the phone line when it is given', () => {
    const url = decodeURIComponent(buildMailtoUrl({ ...base, phone: '555-0100' }));
    expect(url).toContain('555-0100');
  });

  it('lists every selected service, comma separated', () => {
    const url = decodeURIComponent(
      buildMailtoUrl({ ...base, services: ['Brand Design', 'App Design'] }),
    );
    expect(url).toContain('Brand Design, App Design');
  });

  it('says so explicitly when no service was picked, rather than leaving a blank', () => {
    const url = decodeURIComponent(buildMailtoUrl({ ...base, services: [] }));
    expect(url).toMatch(/None specified|none/i);
  });

  it('percent-encodes newlines and ampersands so the body cannot break the URL', () => {
    const url = buildMailtoUrl({ ...base, project: 'Line one\nLine two & more' });
    // A raw & would start a new mailto header; a raw newline is invalid in a URL.
    const afterBody = url.slice(url.indexOf('body='));
    expect(afterBody).not.toContain('\n');
    expect(afterBody.slice('body='.length)).not.toContain('&');
  });

  it('round-trips an encoded body back to the original text', () => {
    const project = `Curly 'quotes', em—dash, 100% & "quotes"`;
    const url = buildMailtoUrl({ ...base, project });
    const body = decodeURIComponent(url.split('body=')[1]);
    expect(body).toContain(project);
  });
});

describe('fitsInMailto', () => {
  const longestBudget = [...BUDGETS].sort((a, b) => b.length - a.length)[0];

  it('accepts the realistic worst case: every short field ASCII-maxed, all services, a full-length brief', () => {
    const worst: Inquiry = {
      name: 'a'.repeat(FIELD_MAX.name),
      email: `${'a'.repeat(FIELD_MAX.email - 7)}@ex.com`,
      phone: '1'.repeat(FIELD_MAX.phone),
      budget: longestBudget,
      project: 'a'.repeat(PROJECT_MAX),
      services: [...SERVICES], // all eleven
    };
    expect(fitsInMailto(worst)).toBe(true);
    expect(buildMailtoUrl(worst).length).toBeLessThanOrEqual(MAILTO_URL_MAX);
  });

  it('rejects a message that is short in characters but huge once encoded', () => {
    // The case a character cap cannot catch: one emoji is 12 encoded characters,
    // so this is well under PROJECT_MAX yet far over the URL budget.
    const emoji: Inquiry = { ...base, project: '😀'.repeat(PROJECT_MAX / 2) };
    expect(emoji.project.length).toBeLessThan(PROJECT_MAX * 2);
    expect(fitsInMailto(emoji)).toBe(false);
  });

  it('agrees with the URL it measures — never reports true for an oversize URL', () => {
    for (const n of [0, 100, 500, PROJECT_MAX, PROJECT_MAX * 4]) {
      const probe: Inquiry = { ...base, project: 'a'.repeat(n) };
      expect(fitsInMailto(probe)).toBe(buildMailtoUrl(probe).length <= MAILTO_URL_MAX);
    }
  });
});
