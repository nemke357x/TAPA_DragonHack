import { NextResponse } from "next/server";
import { extractRepositoryProfile } from "@/lib/repository-profile";

type GitHubTreeItem = {
  path: string;
  type: "blob" | "tree";
};

const priorityFiles = [
  "README.md",
  "readme.md",
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.ts",
  "vite.config.js",
  "tailwind.config.ts",
  "tailwind.config.js",
  "tsconfig.json",
  "Dockerfile",
  "docker-compose.yml",
  "vercel.json",
  "prisma/schema.prisma",
  ".github/workflows/ci.yml",
  ".github/workflows/test.yml"
];

function parseRepositoryUrl(url: string) {
  const match = url.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, "")
  };
}

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: githubHeaders(),
    next: { revalidate: 300 }
  });

  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: githubHeaders(),
    next: { revalidate: 300 }
  });

  if (!response.ok) return undefined;
  const text = await response.text();
  return text.slice(0, 12000);
}

export async function POST(request: Request) {
  const { url } = (await request.json()) as { url?: string };
  if (!url) {
    return NextResponse.json({ error: "GitHub repository URL is required." }, { status: 400 });
  }

  const parsed = parseRepositoryUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "Paste a GitHub repository URL like https://github.com/owner/repo." },
      { status: 400 }
    );
  }

  const repoApiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const repo = await fetchJson<{
    name: string;
    owner: { login: string };
    default_branch: string;
    description?: string;
    stargazers_count?: number;
    forks_count?: number;
    open_issues_count?: number;
    html_url: string;
  }>(repoApiUrl);

  if (!repo) {
    return NextResponse.json(
      { error: "Could not import repository. Check the URL, repository visibility, or GITHUB_TOKEN access." },
      { status: 404 }
    );
  }

  const [languages, rootContents, tree] = await Promise.all([
    fetchJson<Record<string, number>>(`${repoApiUrl}/languages`),
    fetchJson<Array<{ name: string; type: string }>>(`${repoApiUrl}/contents?ref=${repo.default_branch}`),
    fetchJson<{ tree: GitHubTreeItem[] }>(
      `${repoApiUrl}/git/trees/${repo.default_branch}?recursive=1`
    )
  ]);

  const treePaths = tree?.tree?.map((item) => item.path) ?? [];
  const filesToFetch = priorityFiles.filter((file) => treePaths.includes(file)).slice(0, 12);
  const files = await Promise.all(
    filesToFetch.map(async (path) => ({
      path,
      content: await fetchText(
        `https://raw.githubusercontent.com/${repo.owner.login}/${repo.name}/${repo.default_branch}/${path}`
      )
    }))
  );

  const profile = extractRepositoryProfile({
    owner: repo.owner.login,
    repositoryName: repo.name,
    defaultBranch: repo.default_branch,
    description: repo.description,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    sourceUrl: repo.html_url,
    languages: languages ?? {},
    topLevelStructure: (rootContents ?? []).map((item) => `${item.type}:${item.name}`),
    files,
    fileTree: treePaths.slice(0, 3000)
  });

  return NextResponse.json({ profile });
}
