"use client";

import { supabase } from "@/lib/supabase";
import { AnalysisResult, ClarificationQuestion, TaskDraft } from "@/lib/types";

const HISTORY_KEY = "estimate-ai-history-v2";
const LEGACY_HISTORY_KEY = "estimate-ai-history";
const DRAFT_KEY = "estimate-ai-draft-v2";
const MAX_HISTORY = 100;

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function parseRecords(value: string | null): AnalysisResult[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeQuestions(value: unknown): ClarificationQuestion[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          id: `legacy-${index + 1}`,
          question: item,
          type: "yes_no" as const
        };
      }

      if (!item || typeof item !== "object") return null;

      const source = item as Partial<ClarificationQuestion>;
      if (!source.question) return null;

      return {
        id: source.id ?? `legacy-${index + 1}`,
        question: source.question,
        type: source.type === "short_text" ? "short_text" : "yes_no"
      };
    })
    .filter(Boolean) as ClarificationQuestion[];
}

function normalizeRecord(record: AnalysisResult): AnalysisResult {
  const createdAt = record.created_at ?? new Date().toISOString();

  return {
    ...record,
    raw_input: record.raw_input ?? record.title,
    created_at: createdAt,
    updated_at: record.updated_at ?? createdAt,
    clarifyingQuestions: normalizeQuestions(record.clarifyingQuestions),
    clarification_answers: record.clarification_answers ?? record.answeredClarifications ?? {},
    answeredClarifications: record.answeredClarifications ?? record.clarification_answers ?? {},
    plan: record.plan ?? {
      subtasks: record.subtasks ?? [],
      execution_order: record.workflow ?? [],
      parallelizable_groups: [
        (record.subtasks ?? [])
          .filter((subtask) => subtask.parallelizable)
          .map((subtask) => subtask.title)
      ].filter((group) => group.length > 0)
    },
    optimization: record.optimization ?? {
      current_plan_estimate: {
        min_hours: record.estimation.without_ai_min_hours,
        max_hours: record.estimation.without_ai_max_hours
      },
      optimized_plan_estimate: {
        min_hours: record.estimation.with_ai_min_hours,
        max_hours: record.estimation.with_ai_max_hours
      },
      key_improvements: record.afterOptimization ?? [],
      data_sources_used: record.sources ?? [],
      considered: []
    }
  };
}

function writeHistory(records: AnalysisResult[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)));
}

export function loadHistoryRecords(): AnalysisResult[] {
  if (!canUseStorage()) return [];

  const current = parseRecords(window.localStorage.getItem(HISTORY_KEY));
  const legacy = parseRecords(window.localStorage.getItem(LEGACY_HISTORY_KEY));
  const merged = mergeHistory([...current, ...legacy]);

  if (legacy.length > 0 && current.length === 0) {
    writeHistory(merged);
  }

  return merged;
}

export function mergeHistory(records: AnalysisResult[]) {
  const byId = new Map<string, AnalysisResult>();

  records.forEach((record) => {
    if (!record?.id) return;
    const normalized = normalizeRecord(record);
    const existing = byId.get(record.id);

    if (!existing || normalized.updated_at > existing.updated_at) {
      byId.set(record.id, normalized);
    }
  });

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function saveHistoryRecord(record: AnalysisResult) {
  const normalized = normalizeRecord(record);
  const next = mergeHistory([normalized, ...loadHistoryRecords()]);

  writeHistory(next);

  if (supabase) {
    await supabase.from("saved_results").upsert({
      id: normalized.id,
      title: normalized.title,
      task_type: normalized.profile.task_type,
      confidence_score: normalized.estimation.confidence_score,
      time_saved_percent: normalized.estimation.time_saved_percent,
      payload: normalized
    });
  }

  return next;
}

export async function loadRemoteHistoryRecords() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("saved_results")
    .select("payload")
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);

  if (error || !data) return [];

  const records = data
    .map((row) => row.payload as AnalysisResult)
    .filter(Boolean);

  const merged = mergeHistory([...records, ...loadHistoryRecords()]);
  writeHistory(merged);

  return merged;
}

export function findHistoryRecord(id: string) {
  return loadHistoryRecords().find((record) => record.id === id) ?? null;
}

export function saveDraft(draft: TaskDraft) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft(): TaskDraft | null {
  if (!canUseStorage()) return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(DRAFT_KEY);
}
