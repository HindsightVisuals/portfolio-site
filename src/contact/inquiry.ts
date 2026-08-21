/**
 * The contact inquiry's shape and its fixed vocabulary.
 *
 * Pure data, no logic, so that `mailto.ts` (which needs the maxima to size its
 * URL) and `form-model.ts` (which needs the shape and mailto's cap) can both
 * depend on it without importing each other.
 *
 * Every string here is copied verbatim from Figma `85:1227`. They are content,
 * not defaults — changing one changes the design.
 */

export interface Inquiry {
  name: string;
  email: string;
  phone: string;
  budget: string;
  project: string;
  services: string[];
}

/** Adam's real address — the low-friction path, and the one recruiters use. */
export const CONTACT_EMAIL = 'adam.tarr.studio@gmail.com';

/**
 * Budget is an input band the visitor PICKS, never an estimate quoted at them.
 * The spec is explicit that a live cost readout would alienate the
 * hiring-manager half of the audience and publish a price anchor before the
 * conversation starts.
 */
export const BUDGETS: readonly string[] = Object.freeze([
  '$5,000 or under',
  '$5,500–$12,000',
  '$12,000–$25,000',
  '$25,000–$50K',
  'Above $50K',
]);

/** The eleven chips, in Figma's own order (three rows, left to right). */
export const SERVICES: readonly string[] = Object.freeze([
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

/**
 * Caps on the short free-text fields. These are not arbitrary: `mailto.ts`
 * spends them when computing how many characters the project description can
 * have before the built URL overflows.
 */
export const FIELD_MAX = Object.freeze({
  name: 80,
  email: 120,
  phone: 40,
});

/**
 * Character cap for the project description — the textarea's `maxLength` and
 * the counter's denominator.
 *
 * Chosen, not derived, and it is NOT the thing that keeps the mailto URL legal.
 * A character cap cannot do that job: `encodeURIComponent` turns one emoji into
 * twelve characters, so 1100 characters can be anywhere from ~1100 to ~13000 in
 * the URL. `fitsInMailto()` in mailto.ts is the actual guarantee.
 *
 * 1100 is the largest round value that leaves the common case comfortable:
 * every short field at its ASCII maximum plus 1100 ASCII characters here builds
 * a 1769-character URL, inside MAILTO_URL_MAX (1900). Verified by measurement,
 * not estimated.
 */
export const PROJECT_MAX = 1100;
