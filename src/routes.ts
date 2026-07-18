export type DestId = 'home' | 'work' | 'about' | 'contact';

export const DEST_ORDER: DestId[] = ['home', 'work', 'about', 'contact'];

const PATHS: Record<DestId, string> = {
  home: '/',
  work: '/work',
  about: '/about',
  contact: '/contact',
};

export function pathForDest(dest: DestId): string {
  return PATHS[dest];
}

export function destForPath(path: string): DestId | null {
  const clean = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  for (const d of DEST_ORDER) if (PATHS[d] === clean) return d;
  return null;
}
