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

function normalize(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

export function pathForDest(dest: DestId): string {
  return PATHS[dest];
}

export function destForPath(path: string): DestId | null {
  const clean = normalize(path);
  for (const d of DEST_ORDER) if (PATHS[d] === clean) return d;
  if (clean.startsWith(WORK_PREFIX)) return 'work'; // /work/[slug] is still the work destination
  return null;
}

/** `/work/[slug]` -> the slug, validated against SLUGS; else null (trailing slash tolerated). */
export function slugForPath(path: string): string | null {
  const clean = normalize(path);
  if (!clean.startsWith(WORK_PREFIX)) return null;
  const slug = clean.slice(WORK_PREFIX.length);
  return (SLUGS as readonly string[]).includes(slug) ? slug : null;
}

export function pathForSlug(slug: string): string {
  return `${WORK_PREFIX}${slug}`;
}
