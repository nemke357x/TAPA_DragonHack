import { RepositoryProfile } from "@/lib/types";

type FileSignal = {
  path: string;
  content?: string;
};

const frameworkSignals: Record<string, string[]> = {
  Next: ["next", "next.config", "app/", "pages/"],
  React: ["react", "vite", "jsx", "tsx"],
  Vue: ["vue", "nuxt"],
  Svelte: ["svelte", "sveltekit"],
  Express: ["express"],
  NestJS: ["@nestjs"],
  Prisma: ["prisma", "schema.prisma"],
  Tailwind: ["tailwind"],
  Supabase: ["supabase"],
  Jest: ["jest"],
  Vitest: ["vitest"],
  Playwright: ["playwright"],
  Cypress: ["cypress"]
};

export function extractRepositoryProfile(input: {
  owner: string;
  repositoryName: string;
  defaultBranch: string;
  description?: string;
  stars?: number;
  forks?: number;
  openIssues?: number;
  sourceUrl: string;
  languages: Record<string, number>;
  topLevelStructure: string[];
  files: FileSignal[];
  fileTree?: string[];
}): RepositoryProfile {
  const fileText = input.files
    .map((file) => `${file.path}\n${file.content ?? ""}`)
    .join("\n")
    .toLowerCase();
  const structureText = input.topLevelStructure.join("\n").toLowerCase();
  const combined = `${fileText}\n${structureText}`;
  const importantFiles = input.files.map((file) => file.path);
  const detectedFrameworks = Object.entries(frameworkSignals)
    .filter(([, signals]) => signals.some((signal) => combined.includes(signal.toLowerCase())))
    .map(([framework]) => framework);
  const packageManager = detectPackageManager(importantFiles);
  const detectedLanguages = Object.keys(input.languages);
  const frontendStack = unique([
    ...pick(detectedFrameworks, ["Next", "React", "Vue", "Svelte", "Tailwind"]),
    ...pick(detectedLanguages, ["JavaScript", "TypeScript", "CSS", "HTML"])
  ]);
  const backendStack = unique([
    ...pick(detectedFrameworks, ["Express", "NestJS"]),
    ...pick(detectedLanguages, ["Python", "Go", "Java", "Ruby", "PHP", "C#"])
  ]);
  const databaseOrInfraHints = unique(
    detectSignals(combined, {
      Prisma: ["prisma", "schema.prisma"],
      Supabase: ["supabase"],
      Postgres: ["postgres", "postgresql"],
      MySQL: ["mysql"],
      Redis: ["redis"],
      Docker: ["dockerfile", "docker-compose"],
      Vercel: ["vercel.json"],
      GitHubActions: [".github/workflows"]
    })
  );
  const testingSetup = unique(
    detectSignals(combined, {
      Jest: ["jest"],
      Vitest: ["vitest"],
      Playwright: ["playwright"],
      Cypress: ["cypress"],
      TestingLibrary: ["@testing-library"],
      Pytest: ["pytest"]
    })
  );
  const architectureNotes = detectArchitecture(input.topLevelStructure, combined);
  const complexitySignals = detectComplexity(input.topLevelStructure, combined, input.openIssues ?? 0);
  const implementationOverheadHints = detectOverhead(
    combined,
    detectedFrameworks,
    testingSetup,
    databaseOrInfraHints
  );

  return {
    repositoryName: input.repositoryName,
    owner: input.owner,
    defaultBranch: input.defaultBranch,
    description: input.description,
    stars: input.stars,
    forks: input.forks,
    openIssues: input.openIssues,
    detectedLanguages,
    detectedFrameworks,
    packageManager,
    frontendStack,
    backendStack,
    databaseOrInfraHints,
    testingSetup,
    architectureNotes,
    topLevelStructure: input.topLevelStructure,
    importantFiles,
    fileTree: input.fileTree,
    sampledFiles: input.files.map((file) => ({
      path: file.path,
      content: file.content?.slice(0, 5000),
      summary: summarizeFile(file.path, file.content)
    })),
    complexitySignals,
    implementationOverheadHints,
    repoSummary: summarizeRepo({
      name: `${input.owner}/${input.repositoryName}`,
      description: input.description,
      languages: detectedLanguages,
      frameworks: detectedFrameworks,
      packageManager,
      architectureNotes
    }),
    importedAt: new Date().toISOString(),
    sourceUrl: input.sourceUrl
  };
}

function summarizeFile(path: string, content = "") {
  const firstLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");

  return `${path}${firstLines ? `: ${firstLines.slice(0, 220)}` : ""}`;
}

function detectPackageManager(files: string[]) {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lockb") || files.includes("bun.lock")) return "bun";
  if (files.includes("package-lock.json")) return "npm";
  if (files.includes("poetry.lock")) return "poetry";
  if (files.includes("Pipfile.lock")) return "pipenv";
  return undefined;
}

function detectSignals(text: string, signals: Record<string, string[]>) {
  return Object.entries(signals)
    .filter(([, values]) => values.some((value) => text.includes(value.toLowerCase())))
    .map(([label]) => label);
}

function detectArchitecture(structure: string[], text: string) {
  const notes: string[] = [];
  const names = structure.map((item) => item.toLowerCase());
  if (names.includes("tree:apps") || names.includes("tree:packages")) {
    notes.push("Monorepo-style folder layout detected.");
  }
  if (names.includes("tree:src")) notes.push("Source code is organized under src.");
  if (names.includes("tree:app")) notes.push("App router or application entry folder detected.");
  if (names.includes("tree:server") || names.includes("tree:api")) {
    notes.push("Backend/API directory detected.");
  }
  if (text.includes("middleware")) notes.push("Middleware layer likely affects implementation scope.");
  return notes;
}

function detectComplexity(structure: string[], text: string, openIssues: number) {
  const signals: string[] = [];
  if (structure.length > 18) signals.push("Large top-level structure.");
  if (text.includes("turbo") || text.includes("nx")) signals.push("Workspace orchestration detected.");
  if (text.includes("docker")) signals.push("Containerized setup may add environment overhead.");
  if (text.includes("auth") || text.includes("permission")) signals.push("Auth or permission code likely exists.");
  if (openIssues > 100) signals.push("High open issue count may indicate maintenance complexity.");
  return signals;
}

function detectOverhead(
  text: string,
  frameworks: string[],
  testingSetup: string[],
  infra: string[]
) {
  const hints: string[] = [];
  if (frameworks.includes("Next")) hints.push("Changes may touch routing, server/client boundaries, or build behavior.");
  if (testingSetup.length) hints.push("Existing test setup can reduce verification setup time.");
  if (infra.length) hints.push("Infra/database dependencies may increase coordination and review load.");
  if (text.includes("typescript")) hints.push("Type contracts may add implementation and review overhead.");
  return hints;
}

function summarizeRepo(input: {
  name: string;
  description?: string;
  languages: string[];
  frameworks: string[];
  packageManager?: string;
  architectureNotes: string[];
}) {
  const stack = [...input.frameworks.slice(0, 4), ...input.languages.slice(0, 3)].join(", ");
  return `${input.name} appears to be ${input.description ?? "a software repository"}${
    stack ? ` using ${stack}` : ""
  }${input.packageManager ? ` with ${input.packageManager} package management` : ""}. ${
    input.architectureNotes[0] ?? "Repository context is available for task planning."
  }`;
}

function pick(values: string[], allowed: string[]) {
  return values.filter((value) => allowed.includes(value));
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
