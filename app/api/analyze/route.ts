import { NextResponse } from "next/server";
import OpenAI from "openai";
import { buildAnalysisText } from "@/lib/analysis-input";
import { repoBaseToSuggestedEstimate } from "@/lib/final-estimator";
import { describeOpenAIError, getOpenAIClient, getOpenAIModel } from "@/lib/openai-server";
import { estimateRepoBaseEffort } from "@/lib/repo-base-estimator";
import { buildAnalysis, inferTaskProfile } from "@/lib/scoring";
import {
  AnalysisInput,
  ClarificationQuestion,
  Level,
  RepoBaseEffortEstimate,
  RepositoryProfile,
  TaskProfile,
  TaskProfileReasoning,
  TaskType
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
  const deterministicProfile = inferTaskProfile(buildAnalysisText(analysisInput));
  const aiProfileResult = client
    ? await buildAIProfile({
        client,
        analysisInput,
        clarificationQuestions,
        manualExtraContext: body.manualExtraContext ?? "",
        deterministicProfile
      }).catch(() => null)
    : null;
  const fallback = buildAnalysis(
    {
      ...analysisInput,
      suggestedBaseEstimate: suggestedBaseEstimate ?? undefined,
      profileReasoning: aiProfileResult?.reasoning
    },
    {},
    {
      id: body.taskId,
      created_at: body.createdAt,
      openAIConnected: Boolean(client),
      supabaseConnected: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ),
      baseEstimateOverride: suggestedBaseEstimate,
      profileOverride: aiProfileResult?.profile,
      profileReasoning: aiProfileResult?.reasoning
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
            "You help software teams estimate work. Return compact JSON only. Do not replace or recalculate hour estimates; the app uses deterministic final scoring with a separate repository base effort when available. Improve summaries, blockers, accelerators, and optimization guidance based on the deterministic profile, repository base estimate, repository profile, and clarification answers. You must include top-level beforeOptimization and afterOptimization arrays with up to 4 short task-specific items each. Do not copy the generic deterministic beforeOptimization or afterOptimization items."
        },
        {
          role: "user",
          content: JSON.stringify({
            analysisInput,
            clarificationQuestions,
            manualExtraContext: body.manualExtraContext ?? "",
            requiredResponseShape: {
              summary: "string",
              managerSummary: "string",
              developerSummary: "string",
              blockers: ["up to 4 task-specific blocker strings"],
              accelerators: ["up to 4 task-specific accelerator strings"],
              beforeOptimization: ["up to 4 task-specific current approach strings"],
              afterOptimization: ["up to 4 task-specific optimized approach strings"]
            },
            deterministicResult: fallback
          })
        }
      ]
    });

    const content = completion.choices[0]?.message.content;
    const ai = content ? JSON.parse(content) : {};
    const result = {
      ...fallback,
      summary: ai.summary ?? fallback.summary,
      managerSummary: ai.managerSummary ?? fallback.managerSummary,
      developerSummary: ai.developerSummary ?? fallback.developerSummary,
      blockers: Array.isArray(ai.blockers) ? ai.blockers.slice(0, 4) : fallback.blockers,
      accelerators: Array.isArray(ai.accelerators) ? ai.accelerators.slice(0, 4) : fallback.accelerators,
      beforeOptimization: normalizeStringList(
        ai.beforeOptimization ?? ai.before_optimization ?? ai.currentApproach,
        fallback.beforeOptimization
      ),
      afterOptimization: normalizeStringList(
        ai.afterOptimization ?? ai.after_optimization ?? ai.optimizedApproach,
        fallback.afterOptimization
      ),
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

const taskTypes: TaskType[] = [
  "frontend feature",
  "backend feature",
  "bug fix",
  "API integration",
  "auth flow",
  "technical documentation",
  "performance optimization",
  "test creation",
  "product spec",
  "research summary"
];

const levels: Level[] = ["low", "medium", "high"];
const seniority = ["junior", "mid", "senior"] as const;

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;

  const items = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 140))
    .slice(0, 4);

  return items.length ? items : fallback;
}

async function buildAIProfile(input: {
  client: OpenAI;
  analysisInput: AnalysisInput;
  clarificationQuestions: ClarificationQuestion[];
  manualExtraContext: string;
  deterministicProfile: TaskProfile;
}): Promise<{ profile: TaskProfile; reasoning: TaskProfileReasoning } | null> {
  const completion = await input.client.chat.completions.create({
    model: getOpenAIModel(),
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You classify software estimation inputs into a structured profile. Return JSON only. Do not estimate hours and do not provide final ranges. Choose only allowed enum values. The deterministic app scorer will calculate final hours from your profile."
      },
      {
        role: "user",
        content: JSON.stringify({
          allowedValues: {
            task_type: taskTypes,
            levels,
            required_seniority: seniority
          },
          requiredResponse: {
            profile: {
              task_type: "frontend feature",
              complexity: "low|medium|high",
              ambiguity: "low|medium|high",
              dependencies: "low|medium|high",
              review_load: "low|medium|high",
              research_load: "low|medium|high",
              ai_leverage: "low|medium|high",
              expected_output_size: "low|medium|high",
              required_seniority: "junior|mid|senior",
              iteration_risk: "low|medium|high",
              coordination_load: "low|medium|high",
              blocker_probability: "low|medium|high"
            },
            reasoning: {
              complexity: "brief reason",
              ambiguity: "brief reason",
              dependencies: "brief reason",
              review_load: "brief reason",
              blocker_probability: "brief reason",
              coordination_load: "brief reason",
              expected_output_size: "brief reason"
            }
          },
          guidance: [
            "Use task text, repository context, clarification answers, and manual additional info together.",
            "Mark ambiguity low only when acceptance criteria, implementation target, and expected behavior are concrete.",
            "Mark dependencies high when external APIs, backend contracts, approvals, permissions, data migrations, or cross-team handoffs may block progress.",
            "Mark review_load high for auth, payment, permissions, security, migrations, enterprise workflows, or risky production paths.",
            "Mark blocker_probability high when reproduction, root cause, third-party behavior, production data, or ownership is unclear.",
            "Mark expected_output_size high when the work spans multiple surfaces, migrations, exports, dashboards, tests, or large data flows.",
            "AI leverage should reflect how much generative AI can realistically reduce implementation time, not whether AI can understand the task."
          ],
          analysisInput: input.analysisInput,
          clarificationQuestions: input.clarificationQuestions,
          manualExtraContext: input.manualExtraContext,
          deterministicFallbackProfile: input.deterministicProfile
        })
      }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) return null;

  return normalizeAIProfile(JSON.parse(content), input.deterministicProfile);
}

function normalizeAIProfile(
  value: unknown,
  fallback: TaskProfile
): { profile: TaskProfile; reasoning: TaskProfileReasoning } | null {
  if (!value || typeof value !== "object") return null;

  const source = value as {
    profile?: Partial<TaskProfile>;
    reasoning?: TaskProfileReasoning;
  };
  const profile = source.profile;
  if (!profile || typeof profile !== "object") return null;

  return {
    profile: {
      task_type: taskTypes.includes(profile.task_type as TaskType)
        ? (profile.task_type as TaskType)
        : fallback.task_type,
      complexity: normalizeLevel(profile.complexity, fallback.complexity),
      ambiguity: normalizeLevel(profile.ambiguity, fallback.ambiguity),
      dependencies: normalizeLevel(profile.dependencies, fallback.dependencies),
      review_load: normalizeLevel(profile.review_load, fallback.review_load),
      research_load: normalizeLevel(profile.research_load, fallback.research_load),
      ai_leverage: normalizeLevel(profile.ai_leverage, fallback.ai_leverage),
      expected_output_size: normalizeLevel(profile.expected_output_size, fallback.expected_output_size),
      required_seniority: seniority.includes(profile.required_seniority as (typeof seniority)[number])
        ? (profile.required_seniority as TaskProfile["required_seniority"])
        : fallback.required_seniority,
      iteration_risk: normalizeLevel(profile.iteration_risk, fallback.iteration_risk),
      coordination_load: normalizeLevel(profile.coordination_load, fallback.coordination_load),
      blocker_probability: normalizeLevel(profile.blocker_probability, fallback.blocker_probability)
    },
    reasoning: normalizeReasoning(source.reasoning)
  };
}

function normalizeLevel(value: unknown, fallback: Level): Level {
  return levels.includes(value as Level) ? (value as Level) : fallback;
}

function normalizeReasoning(value: TaskProfileReasoning | undefined): TaskProfileReasoning {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, reason]) => typeof reason === "string" && reason.trim())
      .map(([key, reason]) => [key, reason.slice(0, 220)])
  ) as TaskProfileReasoning;
}
