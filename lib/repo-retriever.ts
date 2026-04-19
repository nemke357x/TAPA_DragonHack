import { RepositoryContextBundle, RepositoryFileContext, RepositoryProfile } from "@/lib/types";

const manifestPatterns = [
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  "next.config",
  "vite.config",
  "tailwind.config",
  "prisma/schema.prisma",
  "dockerfile",
  "docker-compose",
  ".github/workflows"
];

const areaKeywords: Record<string, string[]> = {
  frontend: ["app", "pages", "components", "ui", "view", "screen", "form", "css", "tailwind", "client"],
  backend: ["api", "server", "route", "controller", "service", "handler", "resolver", "action"],
  database: ["db", "database", "schema", "model", "migration", "prisma", "supabase", "sql"],
  auth: ["auth", "login", "session", "token", "password", "permission", "role", "middleware"],
  tests: ["test", "spec", "e2e", "playwright", "cypress", "__tests__"],
  jobs: ["job", "queue", "worker", "cron", "schedule"],
  analytics: ["analytics", "event", "track", "metric", "report"],
  notifications: ["notification", "email", "mail", "sms", "push", "webhook"],
  config: ["config", "env", "settings", "deploy", "docker", "workflow"]
};

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "user",
  "users",
  "task",
  "build",
  "add",
  "fix",
  "create",
  "update",
  "need",
  "needs",
  "should"
]);

export function buildRepositoryContextBundle(
  taskText: string,
  profile: RepositoryProfile
): RepositoryContextBundle {
  const fileTree = profile.fileTree?.length ? profile.fileTree : profile.importantFiles;
  const sampledByPath = new Map((profile.sampledFiles ?? []).map((file) => [file.path, file]));
  const taskTokens = tokenize(taskText);
  const rankedFiles = rankRepositoryFiles(taskText, profile)
    .slice(0, 18)
    .map((file) => ({
      ...file,
      content: sampledByPath.get(file.path)?.content,
      summary: sampledByPath.get(file.path)?.summary ?? file.summary
    }));
  const manifestFiles = (profile.sampledFiles ?? [])
    .filter((file) => isManifest(file.path))
    .slice(0, 8);
  const matchedAreas = Object.entries(areaKeywords)
    .filter(([, keywords]) =>
      keywords.some((keyword) => taskTokens.includes(keyword) || taskText.toLowerCase().includes(keyword))
    )
    .map(([area]) => area);

  return {
    repository: {
      owner: profile.owner,
      name: profile.repositoryName,
      defaultBranch: profile.defaultBranch,
      sourceUrl: profile.sourceUrl
    },
    taskText,
    repoSummary: profile.repoSummary,
    frameworks: profile.detectedFrameworks,
    languages: profile.detectedLanguages,
    packageManager: profile.packageManager,
    topLevelStructure: profile.topLevelStructure,
    rankedFiles,
    manifestFiles,
    architectureSignals: profile.architectureNotes,
    complexitySignals: profile.complexitySignals,
    reuseSignals: buildReuseSignals(taskText, profile, rankedFiles),
    riskSignals: buildRiskSignals(taskText, profile, rankedFiles),
    retrievalNotes: [
      `Ranked ${fileTree.length} repository paths against ${taskTokens.length} task tokens.`,
      rankedFiles.length
        ? `Top file match: ${rankedFiles[0].path}.`
        : "No specific file match was available; repository-level signals were used.",
      matchedAreas.length
        ? `Task language points to ${matchedAreas.join(", ")} areas.`
        : "Task language did not strongly point to a specific technical area."
    ]
  };
}

export function rankRepositoryFiles(
  taskText: string,
  profile: RepositoryProfile
): RepositoryFileContext[] {
  const task = taskText.toLowerCase();
  const tokens = tokenize(taskText);
  const fileTree = profile.fileTree?.length ? profile.fileTree : profile.importantFiles;
  const sampledByPath = new Map((profile.sampledFiles ?? []).map((file) => [file.path, file]));

  return fileTree
    .filter((path) => !shouldIgnorePath(path))
    .map((path) => {
      const lower = path.toLowerCase();
      let score = 0;
      const reasons: string[] = [];

      tokens.forEach((token) => {
        if (lower.includes(token)) {
          score += token.length > 4 ? 8 : 4;
        }
      });

      Object.entries(areaKeywords).forEach(([area, keywords]) => {
        const taskMatchesArea = keywords.some((keyword) => task.includes(keyword));
        const pathMatchesArea = keywords.some((keyword) => lower.includes(keyword));
        if (taskMatchesArea && pathMatchesArea) {
          score += 12;
          reasons.push(`${area} signal`);
        }
      });

      if (isManifest(path)) {
        score += 10;
        reasons.push("manifest/tooling file");
      }

      if (sampledByPath.has(path)) {
        score += 8;
        reasons.push("snippet available");
      }

      if (/\.(test|spec)\./i.test(path) || lower.includes("__tests__")) {
        score += task.includes("test") || task.includes("bug") ? 10 : 2;
      }

      if (lower.includes("readme")) {
        score += 5;
        reasons.push("repository documentation");
      }

      return {
        path,
        score,
        reason: reasons.length ? reasons.join(", ") : "task/path keyword similarity",
        summary: sampledByPath.get(path)?.summary
      };
    })
    .filter((file) => file.score !== undefined && file.score > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function buildReuseSignals(
  taskText: string,
  profile: RepositoryProfile,
  rankedFiles: RepositoryFileContext[]
) {
  const signals: string[] = [];
  const lower = taskText.toLowerCase();

  if (rankedFiles.length >= 4) {
    signals.push("Several related files were found, suggesting existing patterns can be reused.");
  }
  if (profile.testingSetup.length) {
    signals.push(`Existing test setup detected: ${profile.testingSetup.slice(0, 3).join(", ")}.`);
  }
  if (profile.frontendStack.length && /ui|form|page|screen|component/.test(lower)) {
    signals.push("Frontend stack and component structure are available for reuse.");
  }
  if (profile.backendStack.length && /api|server|endpoint|webhook/.test(lower)) {
    signals.push("Backend stack signals suggest service/API patterns may already exist.");
  }
  if (!signals.length) {
    signals.push("Reuse opportunities are unclear from imported repository metadata.");
  }

  return signals;
}

function buildRiskSignals(
  taskText: string,
  profile: RepositoryProfile,
  rankedFiles: RepositoryFileContext[]
) {
  const signals = [...profile.complexitySignals, ...profile.implementationOverheadHints];
  const lower = taskText.toLowerCase();

  if (lower.includes("auth") || lower.includes("permission") || lower.includes("password")) {
    signals.push("Task appears to touch auth or permissions.");
  }
  if (lower.includes("migration") || lower.includes("database") || lower.includes("schema")) {
    signals.push("Task may require database/schema changes.");
  }
  if (rankedFiles.length > 12) {
    signals.push("Many potentially relevant files may increase change coordination.");
  }
  if (!profile.testingSetup.length) {
    signals.push("No imported test setup signal was detected.");
  }

  return Array.from(new Set(signals));
}

function tokenize(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2 && !stopWords.has(token))
    )
  );
}

function isManifest(path: string) {
  const lower = path.toLowerCase();
  return manifestPatterns.some((pattern) => lower.includes(pattern));
}

function shouldIgnorePath(path: string) {
  const lower = path.toLowerCase();
  return (
    lower.includes("node_modules/") ||
    lower.includes(".next/") ||
    lower.includes("dist/") ||
    lower.includes("build/") ||
    lower.includes(".git/") ||
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".lock") ||
    lower.endsWith(".map")
  );
}
