export type TaskType =
  | "frontend feature"
  | "backend feature"
  | "bug fix"
  | "API integration"
  | "auth flow"
  | "technical documentation"
  | "performance optimization"
  | "test creation"
  | "product spec"
  | "research summary";

export type Level = "low" | "medium" | "high";
export type Priority = "Low" | "Medium" | "High";
export type ClarificationQuestionType = "yes_no" | "short_text";

export type ClarificationQuestion = {
  id: string;
  question: string;
  type: ClarificationQuestionType;
};

export type ClarificationDecision = {
  clarificationNeeded: boolean;
  questions: ClarificationQuestion[];
  reason?: string;
};

export type TaskProfile = {
  task_type: TaskType;
  complexity: Level;
  ambiguity: Level;
  dependencies: Level;
  review_load: Level;
  research_load: Level;
  ai_leverage: Level;
  expected_output_size: Level;
  required_seniority: "junior" | "mid" | "senior";
  iteration_risk: Level;
  coordination_load: Level;
  blocker_probability: Level;
};

export type Source = {
  name: "Manual" | "OpenAI" | "GitHub" | "Jira" | "Linear" | "Supabase" | "Slack" | "Calendar";
  status: "connected" | "demo" | "ready" | "missing";
  fields: string[];
  note: string;
};

export type Subtask = {
  title: string;
  owner: string;
  estimateHours: string;
  sharePercent: number;
  priority: Priority;
  aiHelpfulness: number;
  aiHelpfulnessTag: Priority;
  parallelizable: boolean;
  criticalPath: boolean;
  guidance: string;
};

export type Estimation = {
  without_ai_min_hours: number;
  without_ai_max_hours: number;
  with_ai_min_hours: number;
  with_ai_max_hours: number;
  time_saved_percent: number;
  confidence_score: number;
  delay_risk: number;
  juniorMultiplier: number;
  seniorMultiplier: number;
};

export type AnalysisResult = {
  id: string;
  title: string;
  raw_input: string;
  created_at: string;
  updated_at: string;
  summary: string;
  developerSummary: string;
  managerSummary: string;
  profile: TaskProfile;
  clarifyingQuestions: ClarificationQuestion[];
  answeredClarifications: Record<string, string>;
  clarification_answers: Record<string, string>;
  estimation: Estimation;
  sources: Source[];
  blockers: string[];
  accelerators: string[];
  subtasks: Subtask[];
  workflow: string[];
  plan: ExecutionPlan;
  optimization: OptimizationResult;
  beforeOptimization: string[];
  afterOptimization: string[];
  explanation: string[];
};

export type ExecutionPlan = {
  subtasks: Subtask[];
  execution_order: string[];
  parallelizable_groups: string[][];
};

export type OptimizationResult = {
  current_plan_estimate: {
    min_hours: number;
    max_hours: number;
  };
  optimized_plan_estimate: {
    min_hours: number;
    max_hours: number;
  };
  key_improvements: string[];
  data_sources_used: Source[];
  considered: string[];
};

export type TaskDraft = {
  id: string | null;
  raw_input: string;
  created_at: string | null;
  clarification_answers: Record<string, string>;
  clarifyingQuestions: ClarificationQuestion[];
  manual_extra_context?: string;
  result: AnalysisResult | null;
  githubUrl?: string;
  importNote?: string;
  updated_at: string;
};

export type DemoTask = {
  id: string;
  label: string;
  ticket: string;
};
