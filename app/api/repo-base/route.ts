import { NextResponse } from "next/server";
import { estimateRepoBaseEffort } from "@/lib/repo-base-estimator";
import { RepositoryProfile } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    taskText?: string;
    ticket?: string;
    repositoryProfile?: RepositoryProfile;
  };

  const taskText = (body.taskText ?? body.ticket)?.trim();
  if (!taskText) {
    return NextResponse.json({ error: "Task text is required." }, { status: 400 });
  }

  if (!body.repositoryProfile) {
    return NextResponse.json({ repoBaseEstimate: null, mode: "skipped" });
  }

  const repoBaseEstimate = await estimateRepoBaseEffort({
    taskText,
    repositoryProfile: body.repositoryProfile
  });

  return NextResponse.json({
    repoBaseEstimate,
    mode: repoBaseEstimate?.mode ?? "skipped"
  });
}
