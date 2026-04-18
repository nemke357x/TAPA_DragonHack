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
  aiHelpfulness: number;
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
  summary: string;
  developerSummary: string;
  managerSummary: string;
  profile: TaskProfile;
  clarifyingQuestions: string[];
  answeredClarifications: Record<string, string>;
  estimation: Estimation;
  sources: Source[];
  blockers: string[];
  accelerators: string[];
  subtasks: Subtask[];
  workflow: string[];
  beforeOptimization: string[];
  afterOptimization: string[];
  explanation: string[];
};

export type DemoTask = {
  id: string;
  label: string;
  ticket: string;
};
