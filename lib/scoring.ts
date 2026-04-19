import {
  AnalysisInput,
  AnalysisResult,
  ClarificationDecision,
  ClarificationQuestion,
  Estimation,
  ExecutionPlan,
  Level,
  OptimizationResult,
  Priority,
  RepositoryProfile,
  Source,
  Subtask,
  SuggestedBaseEstimate,
  TaskProfile,
  TaskType
} from "@/lib/types";
import { buildAnalysisText, createDefaultBaseEstimate } from "@/lib/analysis-input";
import { clamp } from "@/lib/utils";

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

const baseHours: Record<TaskType, number> = {
  "frontend feature": 16,
  "backend feature": 18,
  "bug fix": 10,
  "API integration": 20,
  "auth flow": 24,
  "technical documentation": 8,
  "performance optimization": 22,
  "test creation": 10,
  "product spec": 7,
  "research summary": 8
};

const levelMultiplier: Record<Level, number> = {
  low: 0.85,
  medium: 1,
  high: 1.35
};

const aiSavings: Record<Level, number> = {
  low: 0.16,
  medium: 0.34,
  high: 0.55
};

const words = (text: string) => text.toLowerCase();

function questionId(seed: string) {
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

type SubtaskSeed = Omit<Subtask, "sharePercent" | "priority" | "aiHelpfulnessTag"> & {
  effortWeight?: number;
};

function helpfulnessTag(value: number): Priority {
  if (value >= 70) return "High";
  if (value >= 45) return "Medium";
  return "Low";
}

function priorityForSubtask(subtask: SubtaskSeed): Priority {
  if (subtask.criticalPath) return "High";
  if (subtask.parallelizable) return "Medium";
  return "Low";
}

function withSubtaskMetadata(subtasks: SubtaskSeed[]): Subtask[] {
  const total = subtasks.reduce((sum, subtask) => sum + (subtask.effortWeight ?? 1), 0);
  let used = 0;

  return subtasks.map((subtask, index) => {
    const isLast = index === subtasks.length - 1;
    const computed = Math.round(((subtask.effortWeight ?? 1) / total) * 100);
    const sharePercent = isLast ? Math.max(5, 100 - used) : Math.max(5, computed);
    used += sharePercent;

    const { effortWeight, ...rest } = subtask;

    return {
      ...rest,
      sharePercent,
      priority: priorityForSubtask(subtask),
      aiHelpfulnessTag: helpfulnessTag(subtask.aiHelpfulness)
    };
  });
}

function levelFromSignals(text: string, low: string[], high: string[]): Level {
  const source = words(text);
  const highHits = high.filter((signal) => source.includes(signal)).length;
  const lowHits = low.filter((signal) => source.includes(signal)).length;

  if (highHits >= 2 || (highHits === 1 && source.length > 320)) {
    return "high";
  }

  if (lowHits >= 2 && highHits === 0) {
    return "low";
  }

  return "medium";
}

export function inferTaskProfile(ticket: string): TaskProfile {
  const text = words(ticket);
  let task_type: TaskType = "frontend feature";

  if (text.includes("documentation") || text.includes("docs")) task_type = "technical documentation";
  else if (text.includes("performance") || text.includes("profiling") || text.includes("freezes")) task_type = "performance optimization";
  else if (text.includes("bug") || text.includes("fix") || text.includes("intermittent")) task_type = "bug fix";
  else if (text.includes("auth") || text.includes("login") || text.includes("password")) task_type = "auth flow";
  else if (text.includes("api") || text.includes("integration") || text.includes("webhook")) task_type = "API integration";
  else if (text.includes("test") || text.includes("regression")) task_type = "test creation";
  else if (text.includes("spec") || text.includes("prd")) task_type = "product spec";
  else if (text.includes("research") || text.includes("investigate")) task_type = "research summary";
  else if (taskTypes.some((type) => text.includes(type))) {
    task_type = taskTypes.find((type) => text.includes(type)) ?? "frontend feature";
  }

  const complexity = levelFromSignals(
    ticket,
    ["copy", "documentation", "single", "small", "basic"],
    ["enterprise", "large", "permission", "auth", "payment", "performance", "intermittent", "backend", "migration"]
  );

  const ambiguity = levelFromSignals(
    ticket,
    ["schema", "endpoint", "existing", "include", "validation"],
    ["sometimes", "intermittent", "investigate", "likely", "unclear", "root cause", "large datasets"]
  );

  const dependencies = levelFromSignals(
    ticket,
    ["manual", "standalone", "documentation"],
    ["backend", "api", "database", "payment", "mobile", "permissions", "calendar", "slack", "github"]
  );

  const review_load = levelFromSignals(
    ticket,
    ["draft", "internal", "prototype"],
    ["auth", "payment", "enterprise", "permission", "migration", "checkout"]
  );

  const research_load = levelFromSignals(
    ticket,
    ["known", "existing endpoint", "design system"],
    ["investigate", "profiling", "root cause", "intermittent", "performance", "research"]
  );

  const ai_leverage: Level =
    task_type === "technical documentation" || task_type === "product spec" || task_type === "research summary"
      ? "high"
      : task_type === "bug fix" || task_type === "performance optimization"
        ? "low"
        : "medium";

  const expected_output_size = levelFromSignals(
    ticket,
    ["small", "basic", "single"],
    ["dashboard", "export", "large", "pagination", "migration", "enterprise", "tests"]
  );

  const required_seniority =
    complexity === "high" || text.includes("payment") || text.includes("enterprise") ? "senior" : ambiguity === "high" ? "mid" : "mid";

  const iteration_risk = levelFromSignals(
    ticket,
    ["docs", "examples", "known"],
    ["intermittent", "performance", "design system", "large datasets", "production", "checkout"]
  );

  const coordination_load = levelFromSignals(
    ticket,
    ["standalone", "docs"],
    ["mobile", "backend", "design system", "enterprise", "permission", "payment", "client"]
  );

  const blocker_probability = levelFromSignals(
    ticket,
    ["documentation", "known", "existing"],
    ["intermittent", "production", "staging", "performance", "auth", "payment", "large datasets"]
  );

  return {
    task_type,
    complexity,
    ambiguity,
    dependencies,
    review_load,
    research_load,
    ai_leverage,
    expected_output_size,
    required_seniority,
    iteration_risk,
    coordination_load,
    blocker_probability
  };
}

export function scoreTask(
  profile: TaskProfile,
  options: { baseEstimateOverride?: SuggestedBaseEstimate | null } = {}
): Estimation {
  const base = options.baseEstimateOverride?.baseHours ?? baseHours[profile.task_type];
  const raw =
    base *
    levelMultiplier[profile.complexity] *
    levelMultiplier[profile.ambiguity] *
    levelMultiplier[profile.dependencies] *
    levelMultiplier[profile.review_load] *
    (profile.expected_output_size === "high" ? 1.18 : profile.expected_output_size === "low" ? 0.9 : 1) *
    (profile.coordination_load === "high" ? 1.18 : profile.coordination_load === "low" ? 0.93 : 1);

  const uncertainty =
    0.18 +
    (profile.ambiguity === "high" ? 0.2 : profile.ambiguity === "medium" ? 0.1 : 0.04) +
    (profile.blocker_probability === "high" ? 0.12 : profile.blocker_probability === "medium" ? 0.06 : 0.02);

  const savings = aiSavings[profile.ai_leverage] * (profile.review_load === "high" ? 0.88 : 1);
  const withoutMin = Math.max(2, Math.round(raw * (1 - uncertainty)));
  const withoutMax = Math.max(withoutMin + 1, Math.round(raw * (1 + uncertainty)));
  const withMin = Math.max(1, Math.round(withoutMin * (1 - savings)));
  const withMax = Math.max(withMin + 1, Math.round(withoutMax * (1 - savings * 0.82)));
  const confidence = clamp(
    86 -
      (profile.ambiguity === "high" ? 18 : profile.ambiguity === "medium" ? 8 : 0) -
      (profile.blocker_probability === "high" ? 14 : profile.blocker_probability === "medium" ? 7 : 0) -
      (profile.dependencies === "high" ? 8 : 0),
    42,
    94
  );

  return {
    without_ai_min_hours: withoutMin,
    without_ai_max_hours: withoutMax,
    with_ai_min_hours: withMin,
    with_ai_max_hours: withMax,
    time_saved_percent: Math.round(((withoutMax - withMax) / withoutMax) * 100),
    confidence_score: confidence,
    delay_risk: clamp(100 - confidence + (profile.coordination_load === "high" ? 12 : 4), 12, 84),
    juniorMultiplier: profile.required_seniority === "senior" ? 1.75 : 1.35,
    seniorMultiplier: profile.required_seniority === "senior" ? 0.95 : 0.82
  };
}

export function clarificationQuestions(profile: TaskProfile, ticket = ""): ClarificationQuestion[] {
  const title = ticket.split(/[.\n]/)[0]?.trim().slice(0, 72) || profile.task_type;
  const questions: ClarificationQuestion[] = [];

  if (profile.ambiguity !== "low") {
    questions.push({
      id: questionId(`acceptance-${profile.task_type}-${title}`),
      question: `What would make "${title}" unquestionably done?`,
      type: "short_text"
    });
  }
  if (profile.dependencies !== "low") {
    questions.push({
      id: questionId(`dependency-${profile.task_type}-${profile.dependencies}`),
      question: `Are any ${profile.task_type} dependencies, owners, APIs, or approvals likely to block this?`,
      type: "yes_no"
    });
  }
  if (profile.blocker_probability !== "low") {
    questions.push({
      id: questionId(`evidence-${profile.task_type}-${profile.blocker_probability}`),
      question: `Do you already have logs, examples, linked tickets, or evidence for this ${profile.task_type}?`,
      type: "yes_no"
    });
  }
  if (profile.review_load === "high" || profile.coordination_load === "high") {
    questions.push({
      id: questionId(`review-${profile.task_type}-${profile.review_load}`),
      question: `Who needs to review or approve the ${profile.task_type} before release?`,
      type: "short_text"
    });
  }

  return questions.slice(0, 4);
}

export function buildClarificationDecision(ticket: string): ClarificationDecision {
  const profile = inferTaskProfile(ticket);
  const questions = clarificationQuestions(profile, ticket);
  const clarificationNeeded =
    profile.ambiguity !== "low" ||
    profile.dependencies === "high" ||
    profile.blocker_probability === "high" ||
    profile.review_load === "high";

  return {
    clarificationNeeded,
    questions: clarificationNeeded ? questions.slice(0, 5) : [],
    reason: clarificationNeeded
      ? `More context can improve the ${profile.task_type} estimate because ambiguity is ${profile.ambiguity}, dependencies are ${profile.dependencies}, and review load is ${profile.review_load}.`
      : `The task looks clear enough for a first estimate as a ${profile.task_type}.`
  };
}

export function generateSubtasks(profile: TaskProfile): Subtask[] {
  const common: SubtaskSeed[] = [
    {
      title: "Confirm scope and acceptance criteria",
      owner: "Product + tech lead",
      estimateHours: "1-2h",
      effortWeight: profile.ambiguity === "high" ? 1.1 : 0.8,
      aiHelpfulness: profile.ambiguity === "high" ? 78 : 55,
      parallelizable: false,
      criticalPath: true,
      guidance: "Use AI to turn ticket text and imported comments into crisp acceptance criteria."
    },
    {
      title: "Map dependencies and test fixtures",
      owner: "Developer",
      estimateHours: "2-4h",
      effortWeight: profile.dependencies === "high" ? 1.25 : 0.95,
      aiHelpfulness: profile.dependencies === "high" ? 48 : 64,
      parallelizable: true,
      criticalPath: profile.dependencies === "high",
      guidance: "List services, owners, and data states before writing production code."
    }
  ];

  const byType: Record<TaskProfile["task_type"], SubtaskSeed[]> = {
    "frontend feature": [
      {
        title: "Build UI states and validation",
        owner: "Frontend",
        estimateHours: "4-8h",
        aiHelpfulness: 72,
        parallelizable: false,
        criticalPath: true,
        guidance: "Generate state matrix, edge copy, and test cases before implementation."
      },
      {
        title: "Wire API calls and error handling",
        owner: "Frontend + backend",
        estimateHours: "3-6h",
        aiHelpfulness: 58,
        parallelizable: true,
        criticalPath: true,
        guidance: "Use contract examples to avoid backend handoff churn."
      }
    ],
    "backend feature": [
      {
        title: "Design schema and service boundaries",
        owner: "Backend",
        estimateHours: "4-7h",
        aiHelpfulness: 46,
        parallelizable: false,
        criticalPath: true,
        guidance: "AI can draft alternatives, but humans should validate data ownership."
      },
      {
        title: "Implement handlers, tests, and observability",
        owner: "Backend",
        estimateHours: "6-12h",
        aiHelpfulness: 63,
        parallelizable: true,
        criticalPath: true,
        guidance: "Let AI draft repetitive tests and logging checklists."
      }
    ],
    "bug fix": [
      {
        title: "Reproduce and isolate the failure mode",
        owner: "Senior developer",
        estimateHours: "3-8h",
        aiHelpfulness: 28,
        parallelizable: false,
        criticalPath: true,
        guidance: "Human debugging dominates until the reproduction path is known."
      },
      {
        title: "Patch, regression test, and release guard",
        owner: "Developer + QA",
        estimateHours: "3-6h",
        aiHelpfulness: 52,
        parallelizable: true,
        criticalPath: true,
        guidance: "AI helps create edge-case tests after root cause is clear."
      }
    ],
    "API integration": [
      {
        title: "Review contracts, auth, and rate limits",
        owner: "Backend",
        estimateHours: "3-5h",
        aiHelpfulness: 67,
        parallelizable: false,
        criticalPath: true,
        guidance: "Summarize docs and create a failure-state checklist."
      },
      {
        title: "Implement sync path and retry behavior",
        owner: "Backend",
        estimateHours: "7-12h",
        aiHelpfulness: 57,
        parallelizable: true,
        criticalPath: true,
        guidance: "Generate adapter scaffolding, then review auth and retries carefully."
      }
    ],
    "auth flow": [
      {
        title: "Model security states and edge cases",
        owner: "Senior engineer",
        estimateHours: "3-5h",
        aiHelpfulness: 42,
        parallelizable: false,
        criticalPath: true,
        guidance: "AI can enumerate states, but security review stays human-led."
      },
      {
        title: "Build UI, backend contract, and tests",
        owner: "Full-stack",
        estimateHours: "6-12h",
        aiHelpfulness: 66,
        parallelizable: true,
        criticalPath: true,
        guidance: "Use AI for form states, copy, unit tests, and API examples."
      }
    ],
    "technical documentation": [
      {
        title: "Extract source facts from API and code",
        owner: "Developer advocate",
        estimateHours: "1-3h",
        aiHelpfulness: 74,
        parallelizable: true,
        criticalPath: true,
        guidance: "AI can transform endpoint details into a structured doc outline."
      },
      {
        title: "Draft examples and review for correctness",
        owner: "Writer + engineer",
        estimateHours: "2-5h",
        aiHelpfulness: 86,
        parallelizable: true,
        criticalPath: false,
        guidance: "High leverage, but final examples need a technical accuracy pass."
      }
    ],
    "performance optimization": [
      {
        title: "Profile and identify dominant bottleneck",
        owner: "Senior engineer",
        estimateHours: "4-10h",
        aiHelpfulness: 32,
        parallelizable: false,
        criticalPath: true,
        guidance: "AI can suggest probes, while measurement determines the plan."
      },
      {
        title: "Implement targeted remediation",
        owner: "Frontend + backend",
        estimateHours: "5-12h",
        aiHelpfulness: 45,
        parallelizable: true,
        criticalPath: true,
        guidance: "Split rendering and query work once profiling points to the cause."
      }
    ],
    "test creation": [
      {
        title: "Build test matrix and fixtures",
        owner: "QA + developer",
        estimateHours: "2-4h",
        aiHelpfulness: 82,
        parallelizable: true,
        criticalPath: true,
        guidance: "AI is strong at exhaustive scenario generation."
      },
      {
        title: "Implement stable tests in CI",
        owner: "Developer",
        estimateHours: "3-6h",
        aiHelpfulness: 68,
        parallelizable: true,
        criticalPath: false,
        guidance: "Keep humans on flake prevention and fixture design."
      }
    ],
    "product spec": [
      {
        title: "Turn intent into user stories",
        owner: "PM",
        estimateHours: "1-3h",
        aiHelpfulness: 88,
        parallelizable: true,
        criticalPath: true,
        guidance: "AI drafts scenarios fast; stakeholders decide priorities."
      },
      {
        title: "Align risks, dependencies, and rollout",
        owner: "PM + tech lead",
        estimateHours: "2-4h",
        aiHelpfulness: 64,
        parallelizable: false,
        criticalPath: true,
        guidance: "Use imported context to reduce planning meetings."
      }
    ],
    "research summary": [
      {
        title: "Collect source material and constraints",
        owner: "Researcher",
        estimateHours: "2-4h",
        aiHelpfulness: 78,
        parallelizable: true,
        criticalPath: true,
        guidance: "AI summarizes quickly when source quality is strong."
      },
      {
        title: "Synthesize recommendation and next actions",
        owner: "Lead",
        estimateHours: "2-5h",
        aiHelpfulness: 82,
        parallelizable: false,
        criticalPath: true,
        guidance: "Human review should validate conclusions and tradeoffs."
      }
    ]
  };

  return withSubtaskMetadata([...common, ...byType[profile.task_type]]);
}

function buildSources(
  options: {
    openAIConnected?: boolean;
    supabaseConnected?: boolean;
    repositoryProfile?: RepositoryProfile;
  } = {}
): Source[] {
  return [
    {
      name: "Manual",
      status: "connected",
      fields: ["title", "description", "acceptance hints"],
      note: "Primary task text entered by the user."
    },
    {
      name: "OpenAI",
      status: options.openAIConnected ? "connected" : "demo",
      fields: ["scope summary", "clarifying questions", "estimate explanation"],
      note: options.openAIConnected
        ? "Live model path is available on the server."
        : "Demo fallback mirrors the production AI contract."
    },
    {
      name: "GitHub",
      status: options.repositoryProfile ? "connected" : "ready",
      fields: options.repositoryProfile
        ? ["repository profile", "framework signals", "tooling", "architecture hints"]
        : ["repository metadata", "framework signals", "tooling"],
      note: options.repositoryProfile
        ? `Using repository context from ${options.repositoryProfile.owner}/${options.repositoryProfile.repositoryName}.`
        : "Paste a GitHub repository URL to import repository-level context."
    },
    {
      name: "Supabase",
      status: options.supabaseConnected ? "connected" : "demo",
      fields: ["history", "saved estimations", "team calibration"],
      note: "Persists history when Supabase environment variables are configured."
    },
    {
      name: "Jira",
      status: "demo",
      fields: ["status", "comments", "labels", "original estimate"],
      note: "Connector-ready panel for the hackathon demo."
    },
    {
      name: "Linear",
      status: "demo",
      fields: ["team", "cycle", "priority", "issue relations"],
      note: "Connector-ready panel for team context."
    }
  ];
}

export function buildExecutionPlan(profile: TaskProfile): ExecutionPlan {
  const subtasks = generateSubtasks(profile);
  const parallel = subtasks.filter((subtask) => subtask.parallelizable);

  return {
    subtasks,
    execution_order: [
      "Import linked context and normalize the task profile.",
      "Resolve the highest-impact clarification before coding.",
      "Split critical path work from parallel research, tests, and docs.",
      "Use AI for scaffolding, examples, edge cases, and manager-ready summaries.",
      "Hold human review for security, correctness, and release readiness."
    ],
    parallelizable_groups:
      parallel.length > 1
        ? [
            parallel.slice(0, 2).map((subtask) => subtask.title),
            parallel.slice(2).map((subtask) => subtask.title).filter(Boolean)
          ].filter((group) => group.length > 0)
        : parallel.map((subtask) => [subtask.title])
  };
}

export function buildOptimization(
  profile: TaskProfile,
  estimation: Estimation,
  plan: ExecutionPlan,
  sources: Source[]
): OptimizationResult {
  return {
    current_plan_estimate: {
      min_hours: estimation.without_ai_min_hours,
      max_hours: estimation.without_ai_max_hours
    },
    optimized_plan_estimate: {
      min_hours: estimation.with_ai_min_hours,
      max_hours: estimation.with_ai_max_hours
    },
    key_improvements: [
      plan.parallelizable_groups.length > 0
        ? "Parallelize dependency mapping, fixture setup, and documentation."
        : "Keep the critical path explicit before implementation starts.",
      profile.ai_leverage === "high"
        ? "Use AI heavily for drafting, synthesis, examples, and acceptance criteria."
        : "Use AI after humans identify the correct implementation or debugging path.",
      "Focus senior review on security, correctness, release risk, and edge cases.",
      "Convert ambiguous work into testable checkpoints before coding."
    ],
    data_sources_used: sources,
    considered: [
      `Complexity: ${profile.complexity}`,
      `Dependencies: ${profile.dependencies}`,
      `Review load: ${profile.review_load}`,
      `Research load: ${profile.research_load}`,
      `Required seniority: ${profile.required_seniority}`,
      `Iteration risk: ${profile.iteration_risk}`
    ]
  };
}

type BuildAnalysisOptions = {
  id?: string;
  created_at?: string;
  baseEstimateOverride?: SuggestedBaseEstimate | null;
  openAIConnected?: boolean;
  supabaseConnected?: boolean;
};

export function buildAnalysis(
  ticketOrInput: string | AnalysisInput,
  answers: Record<string, string> = {},
  options: BuildAnalysisOptions = {}
): AnalysisResult {
  const analysisInput: AnalysisInput =
    typeof ticketOrInput === "string"
      ? { taskText: ticketOrInput, clarificationAnswers: answers }
      : ticketOrInput;
  const analysisText = buildAnalysisText(analysisInput);
  const baseEstimate =
    options.baseEstimateOverride ??
    analysisInput.suggestedBaseEstimate ??
    createDefaultBaseEstimate();
  const profile = inferTaskProfile(analysisText);
  const estimation = scoreTask(profile, {
    baseEstimateOverride: baseEstimate.baseHours ? baseEstimate : null
  });
  const questions = clarificationQuestions(profile, analysisInput.taskText);
  const title = analysisInput.taskText.split(/[.\n]/)[0]?.replace(/^#+\s*/, "").slice(0, 86) || "Untitled task";
  const highRisk = profile.blocker_probability === "high" || profile.ambiguity === "high";
  const sources = buildSources({
    openAIConnected: options.openAIConnected,
    supabaseConnected: options.supabaseConnected,
    repositoryProfile: analysisInput.repositoryProfile
  });
  const plan = buildExecutionPlan(profile);
  const optimization = buildOptimization(profile, estimation, plan, sources);
  const now = new Date().toISOString();

  return {
    id: options.id ?? crypto.randomUUID(),
    title,
    raw_input: analysisInput.taskText,
    created_at: options.created_at ?? now,
    updated_at: now,
    summary: `${profile.task_type} with ${profile.complexity} complexity, ${profile.ambiguity} ambiguity, and ${profile.ai_leverage} AI leverage.`,
    developerSummary: `Start by locking acceptance criteria and the critical path. AI is most useful for scaffolding, test matrix generation, and turning imported context into implementation checklists.`,
    managerSummary: `Estimate this as a ${estimation.with_ai_min_hours}-${estimation.with_ai_max_hours} hour AI-assisted effort with ${estimation.confidence_score}% confidence. The biggest productivity gain comes from reducing ambiguity before coding starts.`,
    profile,
    clarifyingQuestions: questions,
    answeredClarifications: analysisInput.clarificationAnswers ?? {},
    clarification_answers: analysisInput.clarificationAnswers ?? {},
    estimation,
    sources,
    blockers: [
      highRisk ? "Acceptance criteria or reproduction path may remain unclear." : "Dependency owner availability may slow handoff.",
      profile.dependencies === "high" ? "External API or backend contract can block delivery." : "Test data and fixture setup need confirmation.",
      profile.review_load === "high" ? "Security, payment, or enterprise review can extend the tail." : "Review load is manageable with an early checklist."
    ],
    accelerators: [
      "AI can compress planning notes into acceptance criteria and test cases.",
      profile.ai_leverage === "high"
        ? "Drafting and summarization work has high automation leverage."
        : "AI helps most after humans identify the correct implementation path.",
      "Parallel dependency mapping can happen while the main implementation starts."
    ],
    subtasks: plan.subtasks,
    workflow: plan.execution_order,
    plan,
    optimization,
    beforeOptimization: [
      "Estimate from title and intuition",
      "Discover blockers during implementation",
      "Tests and docs arrive late",
      "Manager sees status but not confidence"
    ],
    afterOptimization: [
      "Estimate from parsed scope and deterministic multipliers",
      "Blockers are surfaced before work starts",
      "Parallelizable work is assigned early",
      "Manager sees confidence, delay risk, and AI leverage"
    ],
    explanation: [
      analysisInput.repoBaseEstimate
        ? `Base effort from codebase analysis is ${analysisInput.repoBaseEstimate.base_effort.min_hours}-${analysisInput.repoBaseEstimate.base_effort.max_hours} hours before clarification modifiers.`
        : `Base estimate comes from task type: ${profile.task_type}.`,
      analysisInput.repositoryProfile
        ? "Repository context contributed stack, tooling, architecture, and overhead signals."
        : "No repository context was imported, so the estimate uses task text and clarifications only.",
      `Multipliers adjust for complexity, ambiguity, dependencies, review load, expected output size, and coordination.`,
    `AI changes the range only through the ai_leverage factor; the final hours are deterministic.`,
    `Confidence decreases when ambiguity, blocker probability, or dependency load are high.`
    ],
    repositoryProfile: analysisInput.repositoryProfile,
    baseEstimate,
    repoBaseEstimate: analysisInput.repoBaseEstimate
  };
}
