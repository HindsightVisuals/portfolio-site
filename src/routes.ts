import { SLUGS } from './three/world';

export type DestId = 'home' | 'work' | 'about' | 'contact';

export const DEST_ORDER: DestId[] = ['home', 'work', 'about', 'contact'];

const PATHS: Record<DestId, string> = {
  home: '/',
  work: '/work',
  about: '/about',
  contact: '/contact',
};

const WORK_PREFIX = `${PATHS.work}/`;

/** Deploy base without its trailing slash: '' for dev/root deploys ('/'),
 * '/portfolio-site' when built with --base=/portfolio-site/ (GitHub Pages).
 * All routes are defined in app-space ('/', '/work/[slug]'); the base is
 * stripped from incoming pathnames and prepended to outgoing ones so the
 * rest of the app never sees it. */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** Remove the deploy base from a browser pathname ('' base = passthrough). */
export function stripBase(path: string, base: string = BASE): string {
  if (base && path.startsWith(base)) {
    const rest = path.slice(base.length);
    if (rest === '') return '/';
    if (rest.startsWith('/')) return rest; // segment boundary — '/base-other' must not match
  }
  return path;
}

/** Prepend the deploy base to an app-space path ('' base = passthrough). */
export function withBase(path: string, base: string = BASE): string {
  return base ? `${base}${path}` : path;
}

function normalize(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

export function pathForDest(dest: DestId): string {
  return withBase(PATHS[dest]);
}

export function destForPath(path: string): DestId | null {
  const clean = normalize(stripBase(path));
  for (const d of DEST_ORDER) if (PATHS[d] === clean) return d;
  if (clean.startsWith(WORK_PREFIX)) return 'work'; // /work/[slug] is still the work destination
  return null;
}

/** `/work/[slug]` -> the slug, validated against SLUGS; else null (trailing slash tolerated). */
export function slugForPath(path: string): string | null {
  const clean = normalize(stripBase(path));
  if (!clean.startsWith(WORK_PREFIX)) return null;
  const slug = clean.slice(WORK_PREFIX.length);
  return (SLUGS as readonly string[]).includes(slug) ? slug : null;
}

export function pathForSlug(slug: string): string {
  return withBase(`${WORK_PREFIX}${slug}`);
}
