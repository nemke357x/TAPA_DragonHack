import {
  AnalysisResult,
  Estimation,
  ExecutionPlan,
  Level,
  OptimizationResult,
  Priority,
  Source,
  Subtask,
  TaskProfile,
  TaskType
} from "@/lib/types";
import {
  AiTool,
  AI_BASE_LEVERAGE,
  AI_MAX_REDUCTION,
  AI_SIGNAL_MODIFIER,
  AI_TOOL_CAPTURE,
  AMBIGUITY_MULT,
  AMBIGUITY_RANGE_PCT,
  BASE_HOURS,
  COMPLEXITY_MULT,
  CONFIDENCE_BASE,
  CONFIDENCE_BONUSES,
  CONFIDENCE_PENALTIES,
  COORDINATION_MULT,
  DEPENDENCY_MULT,
  OUTPUT_MULT,
  RESEARCH_MULT,
  REVIEW_MULT,
  SUBTASK_AI_MULT
} from "@/lib/tables";
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

const words = (text: string) => text.toLowerCase();

type SubtaskSeed = Omit<Subtask, "sharePercent" | "priority" | "aiHelpfulnessTag" | "without_ai_hours" | "with_ai_hours"> & {
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

function withSubtaskMetadata(subtasks: SubtaskSeed[], rawHours: number): Subtask[] {
  const total = subtasks.reduce((sum, subtask) => sum + (subtask.effortWeight ?? 1), 0);
  let used = 0;

  return subtasks.map((subtask, index) => {
    const isLast = index === subtasks.length - 1;
    const computed = Math.round(((subtask.effortWeight ?? 1) / total) * 100);
    const sharePercent = isLast ? Math.max(5, 100 - used) : Math.max(5, computed);
    used += sharePercent;

    const tag = helpfulnessTag(subtask.aiHelpfulness).toLowerCase() as "high" | "medium" | "low";
    const without_ai_base = (sharePercent / 100) * rawHours;
    const with_ai_base = without_ai_base * SUBTASK_AI_MULT[tag];

    const { effortWeight, ...rest } = subtask;

    return {
      ...rest,
      sharePercent,
      priority: priorityForSubtask(subtask),
      aiHelpfulnessTag: helpfulnessTag(subtask.aiHelpfulness),
      without_ai_hours: Math.round(without_ai_base * 10) / 10,
      with_ai_hours: Math.round(with_ai_base * 10) / 10
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

export function scoreTask(profile: TaskProfile, aiTool: AiTool = "none"): Estimation {
  // Step 1: without-AI point estimate from multiplier chain
  const raw = BASE_HOURS[profile.task_type]
    * COMPLEXITY_MULT[profile.complexity]
    * AMBIGUITY_MULT[profile.ambiguity]
    * DEPENDENCY_MULT[profile.dependencies]
    * REVIEW_MULT[profile.review_load]
    * RESEARCH_MULT[profile.research_load]
    * OUTPUT_MULT[profile.expected_output_size]
    * COORDINATION_MULT[profile.coordination_load];

  // Step 2: AI reduction — three factors, hard cap at AI_MAX_REDUCTION
  const ai_reduction = clamp(
    AI_BASE_LEVERAGE[profile.task_type]
    * AI_SIGNAL_MODIFIER[profile.ai_leverage]
    * AI_TOOL_CAPTURE[aiTool],
    0,
    AI_MAX_REDUCTION
  );

  // Step 3: with-AI point estimate
  const with_ai_point = raw * (1 - ai_reduction);

  // Step 4: ranges from ambiguity table
  const pct = AMBIGUITY_RANGE_PCT[profile.ambiguity];
  const without_ai_min_hours = Math.max(2, Math.round(raw * (1 - pct)));
  const without_ai_max_hours = Math.max(without_ai_min_hours + 1, Math.round(raw * (1 + pct)));
  const with_ai_min_hours = Math.max(1, Math.round(with_ai_point * (1 - pct)));
  const with_ai_max_hours = Math.max(with_ai_min_hours + 1, Math.round(with_ai_point * (1 + pct)));

  // Step 5: confidence from tables
  let confidence = CONFIDENCE_BASE;
  if (profile.ambiguity === "high") confidence += CONFIDENCE_PENALTIES.high_ambiguity;
  else if (profile.ambiguity === "medium") confidence += CONFIDENCE_PENALTIES.medium_ambiguity;
  if (profile.dependencies === "high") confidence += CONFIDENCE_PENALTIES.high_dependencies;
  if (profile.iteration_risk === "high") confidence += CONFIDENCE_PENALTIES.high_iteration_risk;
  if (profile.blocker_probability === "high") confidence += CONFIDENCE_PENALTIES.high_blocker_probability;
  else if (profile.blocker_probability === "medium") confidence += CONFIDENCE_PENALTIES.medium_blocker_probability;
  if (profile.complexity === "low") confidence += CONFIDENCE_BONUSES.low_complexity;
  confidence += CONFIDENCE_BONUSES.recognized_task_type; // always fires (task type was inferred)
  confidence = clamp(confidence, 10, 95);

  // Step 6: formula breakdown for the "How?" tooltip
  const formulaSteps = [
    `${BASE_HOURS[profile.task_type]}h base (${profile.task_type})`,
    `× ${COMPLEXITY_MULT[profile.complexity]} complexity (${profile.complexity})`,
    `× ${AMBIGUITY_MULT[profile.ambiguity]} ambiguity (${profile.ambiguity})`,
    `× ${DEPENDENCY_MULT[profile.dependencies]} dependencies (${profile.dependencies})`,
    `× ${REVIEW_MULT[profile.review_load]} review load (${profile.review_load})`,
    `× ${RESEARCH_MULT[profile.research_load]} research load (${profile.research_load})`,
    `= ${Math.round(raw * 10) / 10}h without AI`,
    `AI reduction: ${Math.round(ai_reduction * 100)}% (${profile.task_type} base ${Math.round(AI_BASE_LEVERAGE[profile.task_type] * 100)}% × signal ${AI_SIGNAL_MODIFIER[profile.ai_leverage]} × tool ${AI_TOOL_CAPTURE[aiTool]})`,
    `= ${Math.round(with_ai_point * 10) / 10}h with AI`
  ];

  return {
    without_ai_min_hours,
    without_ai_max_hours,
    with_ai_min_hours,
    with_ai_max_hours,
    time_saved_percent: Math.round(ai_reduction * 100),
    confidence_score: confidence,
    delay_risk: clamp(100 - confidence + (profile.coordination_load === "high" ? 12 : 4), 12, 84),
    juniorMultiplier: profile.required_seniority === "senior" ? 1.75 : 1.35,
    seniorMultiplier: profile.required_seniority === "senior" ? 0.95 : 0.82,
    formulaSteps,
    ai_reduction_pct: Math.round(ai_reduction * 100)
  };
}

export function clarificationQuestions(profile: TaskProfile): string[] {
  const questions: string[] = [];

  if (profile.ambiguity !== "low") {
    questions.push("What acceptance criteria would make this task unquestionably done?");
  }
  if (profile.dependencies !== "low") {
    questions.push("Which systems, people, or APIs can block implementation?");
  }
  if (profile.blocker_probability !== "low") {
    questions.push("Is there production evidence, logs, or linked context the team should inspect first?");
  }
  if (profile.review_load === "high" || profile.coordination_load === "high") {
    questions.push("Who needs to review or approve the work before release?");
  }

  return questions.slice(0, 4);
}

export function generateSubtasks(profile: TaskProfile, rawHours: number): Subtask[] {
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

  return withSubtaskMetadata([...common, ...byType[profile.task_type]], rawHours);
}

function buildSources(): Source[] {
  return [
    {
      name: "Manual",
      status: "connected",
      fields: ["title", "description", "acceptance hints"],
      note: "Primary task text entered by the user."
    },
    {
      name: "OpenAI",
      status: process.env.OPENAI_API_KEY ? "connected" : "demo",
      fields: ["scope summary", "clarifying questions", "workflow explanation"],
      note: process.env.OPENAI_API_KEY
        ? "Live model path is available on the server."
        : "Demo fallback mirrors the production AI contract."
    },
    {
      name: "GitHub",
      status: "ready",
      fields: ["issues", "labels", "linked pull requests"],
      note: "Paste a public GitHub issue URL to import real issue metadata."
    },
    {
      name: "Supabase",
      status: process.env.NEXT_PUBLIC_SUPABASE_URL ? "connected" : "demo",
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

export function buildExecutionPlan(profile: TaskProfile, rawHours: number): ExecutionPlan {
  const subtasks = generateSubtasks(profile, rawHours);
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
  ai_tool?: AiTool;
};

export function buildAnalysis(
  ticket: string,
  answers: Record<string, string> = {},
  options: BuildAnalysisOptions = {}
): AnalysisResult {
  const profile = inferTaskProfile(`${ticket}\n${Object.values(answers).join("\n")}`);
  const estimation = scoreTask(profile, options.ai_tool ?? "none");
  const rawHours = Math.round(estimation.without_ai_max_hours / (1 + AMBIGUITY_RANGE_PCT[profile.ambiguity]));
  const questions = clarificationQuestions(profile);
  const title = ticket.split(/[.\n]/)[0]?.replace(/^#+\s*/, "").slice(0, 86) || "Untitled task";
  const highRisk = profile.blocker_probability === "high" || profile.ambiguity === "high";
  const sources = buildSources();
  const plan = buildExecutionPlan(profile, rawHours);
  const optimization = buildOptimization(profile, estimation, plan, sources);
  const now = new Date().toISOString();

  return {
    id: options.id ?? crypto.randomUUID(),
    title,
    raw_input: ticket,
    created_at: options.created_at ?? now,
    updated_at: now,
    summary: `${profile.task_type} with ${profile.complexity} complexity, ${profile.ambiguity} ambiguity, and ${profile.ai_leverage} AI leverage.`,
    developerSummary: `Start by locking acceptance criteria and the critical path. AI is most useful for scaffolding, test matrix generation, and turning imported context into implementation checklists.`,
    managerSummary: `Plan this as a ${estimation.with_ai_min_hours}-${estimation.with_ai_max_hours} hour AI-assisted effort with ${estimation.confidence_score}% confidence. The biggest productivity gain comes from reducing ambiguity before coding starts.`,
    profile,
    clarifyingQuestions: questions,
    answeredClarifications: answers,
    clarification_answers: answers,
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
      `Base estimate comes from task type: ${profile.task_type}.`,
      `Multipliers adjust for complexity, ambiguity, dependencies, review load, expected output size, and coordination.`,
      `AI changes the range only through the ai_leverage factor; the final hours are deterministic.`,
      `Confidence decreases when ambiguity, blocker probability, or dependency load are high.`
    ]
  };
}
