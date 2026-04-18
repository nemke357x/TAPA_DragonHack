import type { TaskType, Level } from "@/lib/types";

export type AiTool = "none" | "basic_llm" | "coding_assistant";

export const BASE_HOURS: Record<TaskType, number> = {
  "frontend feature": 16,
  "backend feature": 18,
  "bug fix": 10,
  "API integration": 20,
  "auth flow": 24,
  "technical documentation": 8,
  "performance optimization": 22,
  "test creation": 10,
  "product spec": 7,
  "research summary": 8,
};

export const COMPLEXITY_MULT: Record<Level, number> = { low: 0.85, medium: 1, high: 1.35 };
export const AMBIGUITY_MULT: Record<Level, number> = { low: 0.85, medium: 1, high: 1.35 };
export const DEPENDENCY_MULT: Record<Level, number> = { low: 1, medium: 1.2, high: 1.5 };
export const REVIEW_MULT: Record<Level, number> = { low: 0.9, medium: 1, high: 1.15 };
export const RESEARCH_MULT: Record<Level, number> = { low: 1, medium: 1.2, high: 1.5 };
export const OUTPUT_MULT: Record<Level, number> = { low: 0.9, medium: 1, high: 1.18 };
export const COORDINATION_MULT: Record<Level, number> = { low: 0.93, medium: 1, high: 1.18 };

// AI reduction: three factors multiplied, hard-capped at 0.85
// Source: METR 2024 AI developer study, DX Research, GitHub Copilot impact papers
export const AI_BASE_LEVERAGE: Record<TaskType, number> = {
  "technical documentation": 0.75,
  "test creation": 0.60,
  "product spec": 0.60,
  "research summary": 0.55,
  "frontend feature": 0.40,
  "API integration": 0.35,
  "backend feature": 0.30,
  "performance optimization": 0.30,
  "bug fix": 0.25,
  "auth flow": 0.15,
};

export const AI_SIGNAL_MODIFIER: Record<Level, number> = { high: 1.0, medium: 0.7, low: 0.35 };
export const AI_TOOL_CAPTURE: Record<AiTool, number> = {
  none: 0,
  basic_llm: 0.5,
  coding_assistant: 1.0,
};
export const AI_MAX_REDUCTION = 0.85; // never claim AI saves more than 85%

// Range width driven by ambiguity level
export const AMBIGUITY_RANGE_PCT: Record<Level, number> = { low: 0.15, medium: 0.25, high: 0.40 };

// Confidence: starts at 80, apply penalties and bonuses, clamp [10,95]
export const CONFIDENCE_BASE = 80;
export const CONFIDENCE_PENALTIES = {
  high_ambiguity: -25,
  medium_ambiguity: -8,
  high_dependencies: -15,
  high_iteration_risk: -10,
  high_blocker_probability: -14,
  medium_blocker_probability: -7,
  novel_domain: -10,
};
export const CONFIDENCE_BONUSES = {
  low_complexity: 5,
  clear_scope: 10,
  recognized_task_type: 5,
};

// Per-subtask AI multipliers (applied to base subtask hours to get with_ai hours)
export const SUBTASK_AI_MULT: Record<"high" | "medium" | "low", number> = {
  high: 0.35,
  medium: 0.65,
  low: 0.90,
};
