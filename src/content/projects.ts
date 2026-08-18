export interface Project {
  title: string;
  slug: string;
  order: number;
  client: string;
  year: string;
  role: string;
  tools: string[];
  disciplines: string[];
  brief: string;
  /** One-line statement headline, shown large on the case study page. */
  statement: string;
  /** External link for the page's CTA. Empty string when the project has no live site. */
  url: string;
  /** CTA label — 'visit site' for Spy Hop, a placeholder for the rest. */
  cta: string;
  process: string[];
  deliverables: string[];
  pullQuote?: string;
}

const projectModules = import.meta.glob<Project>('./projects/*.json', {
  eager: true,
  import: 'default',
});

const projects: Project[] = Object.values(projectModules).sort(
  (a, b) => a.order - b.order
);

export const ALL_PROJECTS: Project[] = projects;

export function getProject(slug: string): Project {
  const project = projects.find((p) => p.slug === slug);
  if (!project) {
    throw new Error(`Project not found: ${slug}`);
  }
  return project;
}
