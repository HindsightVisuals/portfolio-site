import { CONTACT_EMAIL, type Inquiry } from './inquiry';

/**
 * Practical ceiling for a mailto: URL. The spec quotes ~2000; this sits under
 * it because the figure is a floor across mail clients and browsers, not a
 * standard — IE's old 2083 limit is the usual citation and several clients are
 * tighter still.
 */
export const MAILTO_URL_MAX = 1900;

const SUBJECT = 'New enquiry from the commms site';

function bodyFor(inquiry: Inquiry): string {
  const lines = [
    `Name: ${inquiry.name}`,
    `Email: ${inquiry.email}`,
  ];
  // A blank phone prints nothing at all — an empty "Phone:" line reads as a
  // form defect in the received mail.
  if (inquiry.phone.trim()) lines.push(`Phone: ${inquiry.phone}`);
  lines.push(`Budget: ${inquiry.budget}`);
  lines.push(
    `Services: ${inquiry.services.length ? inquiry.services.join(', ') : 'None specified'}`,
  );
  lines.push('', 'Project:', inquiry.project);
  return lines.join('\n');
}

/**
 * The inquiry as a mailto: URL.
 *
 * encodeURIComponent is what makes this safe: an unencoded `&` in the message
 * would start a new mailto header, and a raw newline is not legal in a URL at
 * all. Both appear in ordinary prose, so neither is a hypothetical.
 */
export function buildMailtoUrl(inquiry: Inquiry): string {
  const subject = encodeURIComponent(SUBJECT);
  const body = encodeURIComponent(bodyFor(inquiry));
  return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
}

/**
 * Whether this inquiry actually fits in a mailto: URL.
 *
 * THE guarantee. It measures the real URL rather than counting characters,
 * because encoding is what decides the length: `PROJECT_MAX` characters of
 * ASCII is ~1100 characters of URL, and the same count of emoji is ~13000.
 * Validation calls this; the textarea's maxLength is only a convenience for
 * the common case.
 */
export function fitsInMailto(inquiry: Inquiry): boolean {
  return buildMailtoUrl(inquiry).length <= MAILTO_URL_MAX;
}
