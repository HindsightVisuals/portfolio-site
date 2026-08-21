import { describe, expect, it, vi } from 'vitest';
import { BUDGETS, type Inquiry } from './inquiry';
import { submitInquiry } from './submit';

const good: Inquiry = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '',
  budget: BUDGETS[0],
  project: 'We need a launch film.',
  services: ['3D Animation'],
};

describe('submitInquiry', () => {
  it('hands the transport a mailto URL for a valid inquiry', () => {
    const transport = vi.fn();
    const result = submitInquiry(good, transport);
    expect(result).toEqual({ ok: true });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toMatch(/^mailto:/);
  });

  it('refuses an invalid inquiry without touching the transport', () => {
    const transport = vi.fn();
    const result = submitInquiry({ ...good, email: 'nope' }, transport);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('reports a transport failure rather than throwing at the caller', () => {
    const transport = vi.fn(() => {
      throw new Error('popup blocked');
    });
    expect(submitInquiry(good, transport)).toEqual({ ok: false, reason: 'transport' });
  });
});
