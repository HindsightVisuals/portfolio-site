/**
 * The `send a signal` contact form (beat 4) — the interactive core mounted
 * into `.contact-modal` by `contact.ts`.
 *
 * Figma places every field's text *inside* the 57px box (85:1227) — those are
 * placeholders, not labels. A placeholder is not an accessible name and it
 * vanishes on the first keystroke, so every control here gets its own
 * visually-hidden `<label>` carrying the same string. See
 * `.superpowers/sdd/2026-08-21-contact-page/task-6-brief.md` for the full
 * accessibility requirements this satisfies.
 *
 * All the shape/validation logic already exists and is tested elsewhere —
 * `BUDGETS` / `SERVICES` / `FIELD_MAX` / `PROJECT_MAX` (contact/inquiry.ts)
 * and `emptyInquiry` / `validate` (contact/form-model.ts). This module is DOM
 * plumbing only: no unit tests cover it, by design (see the brief).
 */

import { BUDGETS, SERVICES, FIELD_MAX, PROJECT_MAX, CONTACT_EMAIL } from '../contact/inquiry';
import type { Inquiry } from '../contact/inquiry';
import { emptyInquiry, validate } from '../contact/form-model';
import type { FieldId, Errors } from '../contact/form-model';

export interface ContactForm {
  el: HTMLFormElement;
  read(): Inquiry;
  onProjectInput(cb: (text: string) => void): void;
  onSubmit(cb: (inquiry: Inquiry) => void): void;
  /**
   * `mailto:` is fire-and-forget — it can only confirm the URL was handed to
   * the browser, never that a message was delivered. Both outcomes below are
   * worded to match that (spec §8): neither claims delivery, and the form's
   * values are left untouched (see `submitInquiry` in `contact/submit.ts`
   * for why clearing would be actively harmful on the one failure mode this
   * code cannot detect).
   */
  showConfirmation(kind: 'sent' | 'transport-failed'): void;
  destroy(): void;
}

export interface ContactFormOpts {
  reducedMotion: boolean;
}

/** Visual + tab order, and the order errors are painted / focused on submit. */
const FIELD_IDS: readonly FieldId[] = ['name', 'email', 'phone', 'budget', 'project'];

/**
 * The placeholder strings, verbatim from Figma — also used as each control's
 * accessible label text (see the module doc comment).
 *
 * Correction 2 (brief task 6, step 1): Figma mixes casing — `Your name*`
 * (lowercase n) against `Your Email*` (capital E) — while the rest of this
 * design is consistently lowercase (`send a signal`,
 * `what services are you interested in?`). Normalised to `Your email*`.
 */
const PLACEHOLDERS: Record<FieldId, string> = {
  name: 'Your name*',
  email: 'Your email*',
  phone: 'Phone (Optional)',
  budget: 'Budget*',
  project: 'Tell us about the project*',
};

const REQUIRED: Record<FieldId, boolean> = {
  name: true,
  email: true,
  phone: false,
  budget: true,
  project: true,
};

const CHIP_HEADING = 'what services are you interested in?';

/**
 * `mailto:` is the only transport (see `contact/submit.ts`'s "THE SEAM" doc
 * comment) and it cannot confirm delivery, so this address has to stay
 * visible on the page as the actual fallback — both permanently, next to the
 * send button, and repeated inside `showConfirmation`'s copy. `CONTACT_EMAIL`
 * is the same constant `mailto.ts` builds the `mailto:` URL from — one source
 * of truth for the address, not a second copy of the string.
 */
function buildMailtoLink(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `mailto:${CONTACT_EMAIL}`;
  link.className = 'contact-mailto-link';
  link.textContent = CONTACT_EMAIL;
  return link;
}

type TextControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

interface FieldRefs {
  control: TextControl;
  error: HTMLParagraphElement;
}

let uid = 0;
/** Unique-per-call ids — cheap insurance against two forms ever sharing a page. */
function nextId(prefix: string): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

function buildLabel(forId: string, text: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'contact-visually-hidden';
  label.htmlFor = forId;
  label.textContent = text;
  return label;
}

function buildError(id: string): HTMLParagraphElement {
  const error = document.createElement('p');
  error.className = 'contact-error';
  error.id = id;
  error.hidden = true;
  return error;
}

function applyRequired(control: TextControl, id: FieldId): void {
  if (!REQUIRED[id]) return;
  control.required = true;
  control.setAttribute('aria-required', 'true');
}

interface BuiltField<C extends TextControl> {
  wrapper: HTMLDivElement;
  control: C;
  error: HTMLParagraphElement;
}

function buildTextField(
  id: FieldId,
  input: { type: string; maxLength: number; autocomplete: string },
): BuiltField<HTMLInputElement> {
  const controlId = nextId(`contact-${id}`);
  const errorId = `${controlId}-error`;

  const control = document.createElement('input');
  control.type = input.type;
  control.id = controlId;
  control.name = id;
  control.className = 'contact-field-control';
  control.placeholder = PLACEHOLDERS[id];
  control.maxLength = input.maxLength;
  control.setAttribute('autocomplete', input.autocomplete);
  applyRequired(control, id);
  control.setAttribute('aria-describedby', errorId);

  const error = buildError(errorId);

  const wrapper = document.createElement('div');
  wrapper.className = 'contact-field';
  wrapper.append(buildLabel(controlId, PLACEHOLDERS[id]), control, error);

  return { wrapper, control, error };
}

function buildBudgetField(): BuiltField<HTMLSelectElement> {
  const id: FieldId = 'budget';
  const controlId = nextId('contact-budget');
  const errorId = `${controlId}-error`;

  const control = document.createElement('select');
  control.id = controlId;
  control.name = id;
  control.className = 'contact-field-control';
  applyRequired(control, id);
  control.setAttribute('aria-describedby', errorId);

  // Disabled + hidden so the placeholder state is real (nothing is
  // pre-selected) rather than a de-facto default of the first band.
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = PLACEHOLDERS.budget;
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  placeholderOption.hidden = true;
  control.append(placeholderOption);

  for (const band of BUDGETS) {
    const option = document.createElement('option');
    option.value = band;
    option.textContent = band;
    control.append(option);
  }

  const error = buildError(errorId);

  const wrapper = document.createElement('div');
  wrapper.className = 'contact-field';
  wrapper.append(buildLabel(controlId, PLACEHOLDERS.budget), control, error);

  return { wrapper, control, error };
}

interface BuiltProjectField extends BuiltField<HTMLTextAreaElement> {
  counter: HTMLParagraphElement;
}

function buildProjectField(): BuiltProjectField {
  const id: FieldId = 'project';
  const controlId = nextId('contact-project');
  const errorId = `${controlId}-error`;

  const control = document.createElement('textarea');
  control.id = controlId;
  control.name = id;
  control.className = 'contact-field-control contact-field-control--project';
  control.placeholder = PLACEHOLDERS.project;
  control.maxLength = PROJECT_MAX;
  applyRequired(control, id);
  control.setAttribute('aria-describedby', errorId);

  const error = buildError(errorId);

  // Not an aria-live region by default — announcing every keystroke is
  // hostile to screen readers. onProjectInputEvt below flips it to
  // 'polite' only once the visitor is close to the cap.
  const counter = document.createElement('p');
  counter.className = 'contact-counter';
  counter.setAttribute('aria-live', 'off');
  counter.textContent = `0 / ${PROJECT_MAX}`;

  const wrapper = document.createElement('div');
  wrapper.className = 'contact-field contact-field--project';
  wrapper.append(buildLabel(controlId, PLACEHOLDERS.project), control, error, counter);

  return { wrapper, control, error, counter };
}

export function buildContactForm(opts: ContactFormOpts): ContactForm {
  const el = document.createElement('form');
  el.className = 'contact-form';
  // Native bubble validation is silent/inconsistent across browsers and
  // fires before our own listeners; validate() (Task 3) is the single
  // source of truth for error text, so the browser's own UI is disabled.
  el.noValidate = true;

  const nameField = buildTextField('name', { type: 'text', maxLength: FIELD_MAX.name, autocomplete: 'name' });
  const emailField = buildTextField('email', { type: 'email', maxLength: FIELD_MAX.email, autocomplete: 'email' });
  const phoneField = buildTextField('phone', { type: 'tel', maxLength: FIELD_MAX.phone, autocomplete: 'tel' });
  const budgetField = buildBudgetField();
  const projectField = buildProjectField();

  const refs = new Map<FieldId, FieldRefs>([
    ['name', { control: nameField.control, error: nameField.error }],
    ['email', { control: emailField.control, error: emailField.error }],
    ['phone', { control: phoneField.control, error: phoneField.error }],
    ['budget', { control: budgetField.control, error: budgetField.error }],
    ['project', { control: projectField.control, error: projectField.error }],
  ]);

  const row1 = document.createElement('div');
  row1.className = 'contact-row';
  row1.append(nameField.wrapper, emailField.wrapper);

  const row2 = document.createElement('div');
  row2.className = 'contact-row';
  row2.append(phoneField.wrapper, budgetField.wrapper);

  // --- chips (Step 2) ---
  const chipHeadingId = nextId('contact-chips-heading');
  const chipHeading = document.createElement('p');
  chipHeading.className = 'contact-chips-heading';
  chipHeading.id = chipHeadingId;
  chipHeading.textContent = CHIP_HEADING;

  const chipGroup = document.createElement('div');
  chipGroup.className = 'contact-chips';
  chipGroup.setAttribute('role', 'group');
  chipGroup.setAttribute('aria-labelledby', chipHeadingId);

  const chipCleanups: Array<() => void> = [];
  for (const service of SERVICES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'contact-chip';
    chip.textContent = service;
    chip.dataset.service = service;
    chip.setAttribute('aria-pressed', 'false');
    const onClick = (): void => {
      const pressed = chip.getAttribute('aria-pressed') === 'true';
      chip.setAttribute('aria-pressed', pressed ? 'false' : 'true');
    };
    chip.addEventListener('click', onClick);
    chipCleanups.push(() => chip.removeEventListener('click', onClick));
    chipGroup.append(chip);
  }

  const chipSection = document.createElement('div');
  chipSection.className = 'contact-chip-section';
  chipSection.append(chipHeading, chipGroup);

  // --- submit ---
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'contact-submit';
  submit.textContent = 'Send Message';

  // Permanent fallback (spec §8): a visitor with no mail client sees the
  // browser do nothing when `mailto:` fails silently, so the address has to
  // be readable here regardless of whether showConfirmation ever runs.
  const fallback = document.createElement('p');
  fallback.className = 'contact-fallback';
  fallback.append('Prefer email? Write to ', buildMailtoLink(), ' directly.');

  const submitRow = document.createElement('div');
  submitRow.className = 'contact-submit-row';
  submitRow.append(submit, fallback);

  // --- confirmation (Step 4) ---
  // Built once, hidden until showConfirmation() runs; the fields stay in the
  // DOM underneath with their values intact (see the ContactForm doc
  // comment above — no branch here ever calls el.reset() or clears a
  // control).
  const confirmationHeading = document.createElement('h2');
  confirmationHeading.className = 'contact-confirmation-heading';

  const confirmationText = document.createElement('p');
  confirmationText.className = 'contact-confirmation-text';

  // Not `hidden` from mount: a screen reader only picks up a `role="status"`
  // region's mutations if the region was already present in the accessibility
  // tree when the mutation happens. Flipping `hidden` and populating the text
  // in the same call (the old code did both inside showConfirmation) risks
  // the content landing before the region is un-hidden, so the announcement
  // can be missed. Visibility is CSS-driven instead, via the form's own
  // `[data-confirmation]` attribute (see contact.css) — the live region
  // itself exists, empty, from the start.
  const confirmation = document.createElement('div');
  confirmation.className = 'contact-confirmation';
  confirmation.setAttribute('role', 'status');
  confirmation.setAttribute('aria-live', 'polite');
  confirmation.append(confirmationHeading, confirmationText);

  el.append(row1, row2, projectField.wrapper, chipSection, submitRow, confirmation);

  const read = (): Inquiry => {
    const services: string[] = [];
    chipGroup.querySelectorAll<HTMLButtonElement>('.contact-chip').forEach((chip) => {
      if (chip.getAttribute('aria-pressed') === 'true') services.push(chip.dataset.service ?? '');
    });
    return {
      ...emptyInquiry(),
      name: nameField.control.value,
      email: emailField.control.value,
      phone: phoneField.control.value,
      budget: budgetField.control.value,
      project: projectField.control.value,
      services,
    };
  };

  // --- validation display (Step 4) ---
  const paintField = (id: FieldId, errors: Errors): void => {
    const ref = refs.get(id);
    if (!ref) return;
    const message = errors[id];
    if (message) {
      ref.error.textContent = message;
      ref.error.hidden = false;
      ref.control.setAttribute('aria-invalid', 'true');
    } else {
      ref.error.textContent = '';
      ref.error.hidden = true;
      ref.control.removeAttribute('aria-invalid');
    }
  };

  const cleanups: Array<() => void> = [...chipCleanups];

  for (const id of FIELD_IDS) {
    const ref = refs.get(id);
    if (!ref) continue;
    const onBlur = (): void => paintField(id, validate(read()));
    ref.control.addEventListener('blur', onBlur);
    cleanups.push(() => ref.control.removeEventListener('blur', onBlur));
  }

  // --- character counter (Step 3) ---
  const projectInputCbs = new Set<(text: string) => void>();
  const onProjectInputEvt = (): void => {
    const text = projectField.control.value;
    const used = text.length;
    projectField.counter.textContent = `${used} / ${PROJECT_MAX}`;
    projectField.counter.setAttribute('aria-live', used > PROJECT_MAX * 0.9 ? 'polite' : 'off');
    for (const cb of projectInputCbs) cb(text);
  };
  projectField.control.addEventListener('input', onProjectInputEvt);
  cleanups.push(() => projectField.control.removeEventListener('input', onProjectInputEvt));

  // --- submit (Step 4) ---
  const submitCbs = new Set<(inquiry: Inquiry) => void>();
  const onSubmitEvt = (e: SubmitEvent): void => {
    e.preventDefault();
    const inquiry = read();
    const errors = validate(inquiry);
    if (Object.keys(errors).length > 0) {
      for (const id of FIELD_IDS) paintField(id, errors);
      // A long form whose error sits above the fold otherwise leaves a
      // keyboard/screen-reader visitor stuck — move focus to the first
      // invalid control, and scroll it into view (smoothly unless the
      // visitor asked for reduced motion).
      const firstInvalidId = FIELD_IDS.find((id) => errors[id]);
      const firstInvalid = firstInvalidId ? refs.get(firstInvalidId)?.control : undefined;
      firstInvalid?.focus();
      firstInvalid?.scrollIntoView({ behavior: opts.reducedMotion ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    for (const cb of submitCbs) cb(inquiry);
  };
  el.addEventListener('submit', onSubmitEvt);
  cleanups.push(() => el.removeEventListener('submit', onSubmitEvt));

  return {
    el,
    read,
    onProjectInput(cb) {
      projectInputCbs.add(cb);
    },
    onSubmit(cb) {
      submitCbs.add(cb);
    },
    showConfirmation(kind) {
      // `el.dataset.confirmation` is what contact.css hooks to swap the
      // fields out for the confirmation block below — see the `[data-
      // confirmation]` rules there. Nothing here touches a control's
      // `.value`, so the visitor's typed message survives underneath.
      el.dataset.confirmation = kind;
      if (kind === 'sent') {
        confirmationHeading.textContent = 'your mail client should have opened';
        confirmationText.replaceChildren(
          "If it didn't, write to ",
          buildMailtoLink(),
          ' directly — everything you typed is still in this form.',
        );
      } else {
        confirmationHeading.textContent = "we couldn't open your mail client";
        confirmationText.replaceChildren('Write to ', buildMailtoLink(), ' directly — everything you typed is still in this form.');
      }
    },
    destroy() {
      for (const fn of cleanups) fn();
      projectInputCbs.clear();
      submitCbs.clear();
    },
  };
}
