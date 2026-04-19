import { NextResponse } from "next/server";
import { repoBaseToSuggestedEstimate } from "@/lib/final-estimator";
import { describeOpenAIError, getOpenAIClient, getOpenAIModel } from "@/lib/openai-server";
import { estimateRepoBaseEffort } from "@/lib/repo-base-estimator";
import { buildAnalysis } from "@/lib/scoring";
import {
  AnalysisInput,
  ClarificationQuestion,
  RepoBaseEffortEstimate,
  RepositoryProfile
} from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    ticket?: string;
    taskText?: string;
    answers?: Record<string, string>;
    clarificationQuestions?: ClarificationQuestion[];
    manualExtraContext?: string;
    taskId?: string;
    createdAt?: string;
    repositoryProfile?: RepositoryProfile;
    repoBaseEstimate?: RepoBaseEffortEstimate;
  };

  const ticket = (body.taskText ?? body.ticket)?.trim();
  if (!ticket) {
    return NextResponse.json({ error: "Ticket text is required." }, { status: 400 });
  }

  const clarificationQuestions = Array.isArray(body.clarificationQuestions)
    ? body.clarificationQuestions.slice(0, 5)
    : [];
  const answers = {
    ...(clarificationQuestions.length > 0
      ? {
          "Clarification questions considered": clarificationQuestions
            .map((question) => question.question)
            .join(" | ")
        }
      : {}),
    ...(body.answers ?? {}),
    ...(body.manualExtraContext?.trim()
      ? {
          "Manual extra context": body.manualExtraContext.trim()
        }
      : {})
  };

  const { client, status } = getOpenAIClient();
  const repoBaseEstimate =
    body.repoBaseEstimate ??
    (await estimateRepoBaseEffort({
      taskText: ticket,
      repositoryProfile: body.repositoryProfile
    }));
  const suggestedBaseEstimate = repoBaseToSuggestedEstimate(repoBaseEstimate);
  const analysisInput: AnalysisInput = {
    taskText: ticket,
    clarificationAnswers: answers,
    repositoryProfile: body.repositoryProfile,
    repoBaseEstimate: repoBaseEstimate ?? undefined,
    suggestedBaseEstimate: suggestedBaseEstimate ?? undefined,
    estimateSource: suggestedBaseEstimate?.baseEstimateSource ?? "deterministic-default"
  };
  const fallback = buildAnalysis(
    {
      ...analysisInput,
      suggestedBaseEstimate: suggestedBaseEstimate ?? undefined
    },
    {},
    {
      id: body.taskId,
      created_at: body.createdAt,
      openAIConnected: Boolean(client),
      supabaseConnected: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ),
      baseEstimateOverride: suggestedBaseEstimate
    }
  );
  fallback.clarifyingQuestions =
    clarificationQuestions.length > 0 ? clarificationQuestions : fallback.clarifyingQuestions;
  fallback.answeredClarifications = answers;
  fallback.clarification_answers = answers;

  if (!client) {
    return NextResponse.json({
      result: fallback,
      mode: "demo",
      warning: status.reason ?? "OPENAI_API_KEY is missing. Demo fallback used."
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model: getOpenAIModel(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You help software teams plan work. Return compact JSON only. Do not replace or recalculate hour estimates; the app uses deterministic final scoring with a separate repository base effort when available. Improve summaries, blockers, accelerators, workflow, and subtask guidance based on the deterministic profile, repository base estimate, repository profile, and clarification answers."
        },
        {
          role: "user",
          content: JSON.stringify({
            analysisInput,
            clarificationQuestions,
            manualExtraContext: body.manualExtraContext ?? "",
            deterministicResult: fallback
          })
        }
      ]
    });

    const content = completion.choices[0]?.message.content;
    const ai = content ? JSON.parse(content) : {};
    const nextWorkflow = Array.isArray(ai.workflow) ? ai.workflow.slice(0, 6) : fallback.workflow;
    const result = {
      ...fallback,
      summary: ai.summary ?? fallback.summary,
      managerSummary: ai.managerSummary ?? fallback.managerSummary,
      developerSummary: ai.developerSummary ?? fallback.developerSummary,
      blockers: Array.isArray(ai.blockers) ? ai.blockers.slice(0, 4) : fallback.blockers,
      accelerators: Array.isArray(ai.accelerators) ? ai.accelerators.slice(0, 4) : fallback.accelerators,
      workflow: nextWorkflow,
      plan: {
        ...fallback.plan,
        execution_order: nextWorkflow
      },
      sources: fallback.sources.map((source) =>
        source.name === "OpenAI"
          ? { ...source, status: "connected" as const, note: "Live OpenAI analysis enhanced this result." }
          : source
      )
    };

    return NextResponse.json({ result, mode: "live" });
  } catch (error) {
    return NextResponse.json({
      result: {
        ...fallback,
        sources: fallback.sources.map((source) =>
          source.name === "OpenAI"
            ? { ...source, status: "demo" as const, note: "OpenAI request failed, demo fallback used." }
            : source
        )
      },
      mode: "fallback",
      warning: describeOpenAIError(error)
    });
  }
}
