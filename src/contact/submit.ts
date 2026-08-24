import { isValid } from './form-model';
import { buildMailtoUrl } from './mailto';
import type { Inquiry } from './inquiry';

export type SubmitResult = { ok: true } | { ok: false; reason: 'invalid' | 'transport' };
export type Transport = (url: string) => void;

const defaultTransport: Transport = (url) => {
  window.location.href = url;
};

/**
 * THE SEAM. Everything about how an inquiry leaves the page lives here.
 *
 * Today that is a `mailto:` hand-off — Adam's explicit choice, with Basin
 * deferred (spec §8). When Basin arrives, this function's body becomes a POST
 * and its signature does not move; no caller changes.
 *
 * Note what `{ ok: true }` does and does not mean. `mailto:` is fire-and-forget:
 * it means the URL was handed to the browser, NOT that a message was delivered.
 * The confirmation copy in Task 8 is worded to match, and must stay that way
 * until a transport exists that can actually confirm delivery.
 */
export function submitInquiry(inquiry: Inquiry, transport: Transport = defaultTransport): SubmitResult {
  if (!isValid(inquiry)) return { ok: false, reason: 'invalid' };
  try {
    transport(buildMailtoUrl(inquiry));
  } catch {
    // No mail client, or a blocked navigation. The page has to keep the
    // address visible for exactly this case.
    return { ok: false, reason: 'transport' };
  }
  return { ok: true };
}
