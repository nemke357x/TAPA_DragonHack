import "server-only";

import { describeOpenAIError, getOpenAIClient, getOpenAIModel } from "@/lib/openai-server";
import { buildRepositoryContextBundle } from "@/lib/repo-retriever";
import {
  RepoBaseEffortEstimate,
  RepoBaseEffortRange,
  RepoImpactArea,
  RepositoryContextBundle,
  RepositoryProfile
} from "@/lib/types";
import { clamp } from "@/lib/utils";

const impactAreas: RepoImpactArea[] = [
  "frontend",
  "backend",
  "database",
  "auth",
  "notifications",
  "analytics",
  "tests",
  "jobs",
  "config"
];

export async function estimateRepoBaseEffort(input: {
  taskText: string;
  repositoryProfile?: RepositoryProfile | null;
}): Promise<RepoBaseEffortEstimate | null> {
  if (!input.repositoryProfile) return null;

  const contextBundle = buildRepositoryContextBundle(input.taskText, input.repositoryProfile);
  const fallback = buildFallbackRepoBaseEstimate(contextBundle);
  const { client } = getOpenAIClient();

  if (!client) {
    return fallback;
  }

  try {
    const completion = await client.chat.completions.create({
      model: getOpenAIModel(),
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You estimate BASE implementation effort for a software task using repository context only. Return JSON matching the requested schema. Do not include team size, seniority, budget, urgency, client pressure, vacation/capacity, pricing, clarification answers, or final business adjustments. Estimate the codebase reality before later clarify/final-estimator modifiers."
        },
        {
          role: "user",
          content: JSON.stringify({
            requiredSchema: {
              task_title: "string",
              repo_summary: "string",
              likely_impacted_areas: [
                {
                  area: "frontend | backend | database | auth | notifications | analytics | tests | jobs | config",
                  reason: "string",
                  estimated_share_percent: 0
                }
              ],
              base_effort: { min_hours: 0, max_hours: 0 },
              base_effort_breakdown: {
                frontend_hours: { min: 0, max: 0 },
                backend_hours: { min: 0, max: 0 },
                database_hours: { min: 0, max: 0 },
                testing_hours: { min: 0, max: 0 },
                integration_hours: { min: 0, max: 0 }
              },
              repo_complexity_signals: ["string"],
              existing_reuse_opportunities: ["string"],
              repo_risks: ["string"],
              confidence_score: 0,
              assumptions: ["string"],
              recommended_clarify_questions: ["string"]
            },
            repositoryContext: contextBundle
          })
        }
      ]
    });

    const content = completion.choices[0]?.message.content;
    const parsed = content ? JSON.parse(content) : {};
    return normalizeRepoBaseEstimate(parsed, contextBundle, "live");
  } catch (error) {
    return {
      ...fallback,
      mode: "fallback",
      repo_risks: [
        ...fallback.repo_risks,
        describeOpenAIError(error)
      ].slice(0, 8)
    };
  }
}

function buildFallbackRepoBaseEstimate(
  context: RepositoryContextBundle
): RepoBaseEffortEstimate {
  const lowerTask = context.taskText.toLowerCase();
  const areas = inferAreas(context);
  const fileCount = context.rankedFiles.length;
  const layerCount = areas.length;
  const riskCount = context.riskSignals.length;
  const reuseCredit = context.reuseSignals.length >= 2 ? 0.85 : 1;
  const frameworkOverhead = context.frameworks.length >= 3 ? 1.12 : 1;
  const base =
    5 +
    fileCount * 0.75 +
    layerCount * 2.25 +
    riskCount * 1.15 +
    (lowerTask.includes("auth") || lowerTask.includes("permission") ? 4 : 0) +
    (lowerTask.includes("database") || lowerTask.includes("migration") || lowerTask.includes("schema") ? 4 : 0);
  const midpoint = clamp(Math.round(base * reuseCredit * frameworkOverhead), 3, 90);
  const uncertainty = layerCount >= 4 || riskCount >= 4 ? 0.42 : layerCount >= 2 ? 0.32 : 0.24;
  const min = Math.max(2, Math.round(midpoint * (1 - uncertainty)));
  const max = Math.max(min + 1, Math.round(midpoint * (1 + uncertainty)));

  return {
    task_title: titleFromTask(context.taskText),
    repo_summary: context.repoSummary,
    likely_impacted_areas: normalizeAreaShares(
      areas.map((area) => ({
        area,
        reason: areaReason(area, context),
        estimated_share_percent: 0
      }))
    ),
    base_effort: {
      min_hours: min,
      max_hours: max
    },
    base_effort_breakdown: buildBreakdown(min, max, areas),
    repo_complexity_signals: context.complexitySignals.slice(0, 8),
    existing_reuse_opportunities: context.reuseSignals.slice(0, 8),
    repo_risks: context.riskSignals.slice(0, 8),
    confidence_score: clamp(78 - riskCount * 4 + Math.min(context.rankedFiles.length, 8), 45, 88),
    assumptions: [
      "Base effort uses repository structure, stack, ranked file paths, and imported snippets only.",
      "Clarification answers, team/seniority, urgency, pricing, and capacity modifiers are intentionally excluded.",
      context.rankedFiles.length
        ? `Most relevant paths include ${context.rankedFiles.slice(0, 4).map((file) => file.path).join(", ")}.`
        : "No task-specific file match was available from the imported repository profile."
    ],
    recommended_clarify_questions: buildRecommendedClarifyQuestions(context, areas),
    relevant_files: context.rankedFiles.slice(0, 10),
    retrieval_notes: context.retrievalNotes,
    mode: "demo"
  };
}

function normalizeRepoBaseEstimate(
  value: Partial<RepoBaseEffortEstimate>,
  context: RepositoryContextBundle,
  mode: RepoBaseEffortEstimate["mode"]
): RepoBaseEffortEstimate {
  const fallback = buildFallbackRepoBaseEstimate(context);
  const min = toPositiveNumber(value.base_effort?.min_hours, fallback.base_effort.min_hours);
  const max = Math.max(min + 1, toPositiveNumber(value.base_effort?.max_hours, fallback.base_effort.max_hours));

  return {
    task_title: stringOr(value.task_title, fallback.task_title).slice(0, 120),
    repo_summary: stringOr(value.repo_summary, fallback.repo_summary).slice(0, 500),
    likely_impacted_areas: normalizeAreaShares(
      Array.isArray(value.likely_impacted_areas) && value.likely_impacted_areas.length
        ? value.likely_impacted_areas
            .filter((area) => area && impactAreas.includes(area.area))
            .map((area) => ({
              area: area.area,
              reason: stringOr(area.reason, "Repository/task context points to this area.").slice(0, 180),
              estimated_share_percent: toPositiveNumber(area.estimated_share_percent, 0)
            }))
        : fallback.likely_impacted_areas
    ),
    base_effort: {
      min_hours: min,
      max_hours: max
    },
    base_effort_breakdown: normalizeBreakdown(value.base_effort_breakdown, fallback.base_effort_breakdown),
    repo_complexity_signals: stringArray(value.repo_complexity_signals, fallback.repo_complexity_signals),
    existing_reuse_opportunities: stringArray(
      value.existing_reuse_opportunities,
      fallback.existing_reuse_opportunities
    ),
    repo_risks: stringArray(value.repo_risks, fallback.repo_risks),
    confidence_score: clamp(toPositiveNumber(value.confidence_score, fallback.confidence_score), 35, 95),
    assumptions: stringArray(value.assumptions, fallback.assumptions),
    recommended_clarify_questions: stringArray(
      value.recommended_clarify_questions,
      fallback.recommended_clarify_questions
    ),
    relevant_files: fallback.relevant_files,
    retrieval_notes: fallback.retrieval_notes,
    mode
  };
}

function inferAreas(context: RepositoryContextBundle): RepoImpactArea[] {
  const task = context.taskText.toLowerCase();
  const paths = context.rankedFiles.map((file) => file.path.toLowerCase()).join("\n");
  const areas: RepoImpactArea[] = [];

  if (/ui|form|page|screen|component|css|frontend|client/.test(`${task}\n${paths}`)) areas.push("frontend");
  if (/api|endpoint|server|backend|service|handler|webhook/.test(`${task}\n${paths}`)) areas.push("backend");
  if (/database|schema|model|migration|prisma|supabase|sql/.test(`${task}\n${paths}`)) areas.push("database");
  if (/auth|login|password|token|permission|role|session/.test(`${task}\n${paths}`)) areas.push("auth");
  if (/email|notification|sms|push|webhook/.test(`${task}\n${paths}`)) areas.push("notifications");
  if (/analytics|tracking|metric|report/.test(`${task}\n${paths}`)) areas.push("analytics");
  if (/test|spec|qa|regression|bug/.test(`${task}\n${paths}`)) areas.push("tests");
  if (/job|queue|worker|cron|schedule/.test(`${task}\n${paths}`)) areas.push("jobs");
  if (/config|env|deploy|ci|workflow|docker/.test(`${task}\n${paths}`)) areas.push("config");

  if (!areas.length) {
    if (context.frameworks.some((framework) => ["Next", "React", "Vue", "Svelte"].includes(framework))) {
      areas.push("frontend");
    }
    if (context.frameworks.some((framework) => ["Express", "NestJS"].includes(framework))) {
      areas.push("backend");
    }
  }

  return areas.length ? Array.from(new Set(areas)).slice(0, 6) : ["frontend", "tests"];
}

function buildBreakdown(min: number, max: number, areas: RepoImpactArea[]) {
  const has = (area: RepoImpactArea) => areas.includes(area);
  const frontend = has("frontend") ? 0.35 : 0.08;
  const backend = has("backend") || has("auth") || has("notifications") || has("jobs") ? 0.32 : 0.08;
  const database = has("database") ? 0.18 : 0.04;
  const testing = has("tests") ? 0.18 : 0.12;
  const integration = Math.max(0.1, 1 - frontend - backend - database - testing);

  return {
    frontend_hours: rangeShare(min, max, frontend),
    backend_hours: rangeShare(min, max, backend),
    database_hours: rangeShare(min, max, database),
    testing_hours: rangeShare(min, max, testing),
    integration_hours: rangeShare(min, max, integration)
  };
}

function normalizeBreakdown(
  value: Partial<RepoBaseEffortEstimate["base_effort_breakdown"]> | undefined,
  fallback: RepoBaseEffortEstimate["base_effort_breakdown"]
) {
  return {
    frontend_hours: normalizeRange(value?.frontend_hours, fallback.frontend_hours),
    backend_hours: normalizeRange(value?.backend_hours, fallback.backend_hours),
    database_hours: normalizeRange(value?.database_hours, fallback.database_hours),
    testing_hours: normalizeRange(value?.testing_hours, fallback.testing_hours),
    integration_hours: normalizeRange(value?.integration_hours, fallback.integration_hours)
  };
}

function normalizeRange(value: Partial<RepoBaseEffortRange> | undefined, fallback: RepoBaseEffortRange) {
  const min = toPositiveNumber(value?.min, fallback.min);
  return {
    min,
    max: Math.max(min, toPositiveNumber(value?.max, fallback.max))
  };
}

function rangeShare(min: number, max: number, share: number): RepoBaseEffortRange {
  return {
    min: Math.max(0, Math.round(min * share)),
    max: Math.max(1, Math.round(max * share))
  };
}

function normalizeAreaShares(
  areas: Array<{ area: RepoImpactArea; reason: string; estimated_share_percent: number }>
) {
  const safe = areas.length ? areas : [{ area: "frontend" as const, reason: "Default impacted area.", estimated_share_percent: 100 }];
  const equal = Math.round(100 / safe.length);
  let used = 0;

  return safe.slice(0, 6).map((area, index, list) => {
    const isLast = index === list.length - 1;
    const share = area.estimated_share_percent > 0 ? area.estimated_share_percent : equal;
    const normalized = isLast ? Math.max(1, 100 - used) : clamp(Math.round(share), 1, 90);
    used += normalized;

    return {
      ...area,
      estimated_share_percent: normalized
    };
  });
}

function areaReason(area: RepoImpactArea, context: RepositoryContextBundle) {
  const matching = context.rankedFiles.find((file) => file.path.toLowerCase().includes(area));
  return matching
    ? `${matching.path} matched the task and ${area} area.`
    : `Task and repository signals suggest ${area} work may be involved.`;
}

function buildRecommendedClarifyQuestions(
  context: RepositoryContextBundle,
  areas: RepoImpactArea[]
) {
  const questions: string[] = [];

  if (areas.includes("auth")) questions.push("Are permission and token behavior already defined?");
  if (areas.includes("database")) questions.push("Will this require a schema migration or data backfill?");
  if (areas.includes("backend")) questions.push("Is the API contract already agreed?");
  if (areas.includes("frontend")) questions.push("Does the desired UI state already exist in designs?");
  if (!context.rankedFiles.length) questions.push("Which existing module is closest to this task?");

  return questions.slice(0, 5);
}

function stringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length ? strings.slice(0, 8) : fallback;
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toPositiveNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function titleFromTask(taskText: string) {
  return taskText.split(/[.\n]/)[0]?.trim().slice(0, 100) || "Repository task";
}
