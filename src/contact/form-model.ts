import { BUDGETS, FIELD_MAX, PROJECT_MAX, type Inquiry } from './inquiry';
import { fitsInMailto } from './mailto';

export type FieldId = 'name' | 'email' | 'phone' | 'budget' | 'project';
export type Errors = Partial<Record<FieldId, string>>;

/**
 * Deliberately permissive. The only address this can truly validate is one the
 * visitor can still mistype, so the job is to catch the shapes that are
 * certainly wrong — no @, no dot in the domain, whitespace — and let everything
 * else through. A stricter pattern rejects real addresses.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emptyInquiry(): Inquiry {
  // A fresh object every call: a shared constant would carry one visitor's
  // chip selections into the next open of the page.
  return { name: '', email: '', phone: '', budget: '', project: '', services: [] };
}

export function validate(inquiry: Inquiry): Errors {
  const errors: Errors = {};

  const name = inquiry.name.trim();
  if (!name) errors.name = 'Please tell us your name.';
  else if (inquiry.name.length > FIELD_MAX.name) {
    errors.name = `That name is longer than ${FIELD_MAX.name} characters.`;
  }

  const email = inquiry.email.trim();
  if (!email) errors.email = 'We need an email address to reply to.';
  else if (inquiry.email.length > FIELD_MAX.email) {
    errors.email = `That address is longer than ${FIELD_MAX.email} characters.`;
  } else if (!EMAIL_RE.test(email)) {
    errors.email = 'That does not look like an email address.';
  }

  // Phone is optional by design — only its length is bounded.
  if (inquiry.phone.length > FIELD_MAX.phone) {
    errors.phone = `That number is longer than ${FIELD_MAX.phone} characters.`;
  }

  if (!inquiry.budget.trim()) errors.budget = 'Please pick a budget range.';
  else if (!BUDGETS.includes(inquiry.budget)) {
    errors.budget = 'Please pick one of the listed budget ranges.';
  }

  const project = inquiry.project.trim();
  if (!project) errors.project = 'Please tell us a little about the project.';
  else if (inquiry.project.length > PROJECT_MAX) {
    errors.project = `Please keep this under ${PROJECT_MAX} characters.`;
  } else if (!fitsInMailto(inquiry)) {
    // The character cap passed but the encoded URL did not. Emoji and other
    // multi-byte characters cost up to 12 characters each once encoded, so a
    // short-looking message can still overflow. This is the real guarantee —
    // without it the browser silently truncates the message.
    errors.project = 'Please shorten your message — it is too long to send.';
  }

  return errors;
}

export function isValid(inquiry: Inquiry): boolean {
  return Object.keys(validate(inquiry)).length === 0;
}
