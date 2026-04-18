import { NextResponse } from "next/server";

type GitHubLabel = {
  name?: string;
};

function parseIssueUrl(url: string) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2], issue: match[3] };
}

export async function POST(request: Request) {
  const { url } = (await request.json()) as { url?: string };
  if (!url) {
    return NextResponse.json({ error: "GitHub issue URL is required." }, { status: 400 });
  }

  const parsed = parseIssueUrl(url);
  if (!parsed) {
    return NextResponse.json({ error: "Paste a public GitHub issue URL." }, { status: 400 });
  }

  const response = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.issue}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
      },
      next: { revalidate: 60 }
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: `GitHub returned ${response.status}. Try a public issue or configure GITHUB_TOKEN.` },
      { status: response.status }
    );
  }

  const issue = await response.json();
  return NextResponse.json({
    title: issue.title,
    body: issue.body ?? "",
    labels: Array.isArray(issue.labels)
      ? issue.labels.map((label: GitHubLabel) => label.name ?? "label").filter(Boolean)
      : [],
    state: issue.state,
    comments: issue.comments,
    url: issue.html_url,
    importedText: `${issue.title}\n\n${issue.body ?? ""}\n\nLabels: ${
      Array.isArray(issue.labels)
        ? issue.labels.map((label: GitHubLabel) => label.name ?? "label").join(", ")
        : "none"
    }\nState: ${issue.state}\nComments: ${issue.comments}`
  });
}
