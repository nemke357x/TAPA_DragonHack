import { createClient } from "@supabase/supabase-js";
import { AnalysisResult } from "@/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export async function saveResult(result: AnalysisResult) {
  if (supabase) {
    const { error } = await supabase.from("saved_results").insert({
      id: result.id,
      title: result.title,
      task_type: result.profile.task_type,
      confidence_score: result.estimation.confidence_score,
      time_saved_percent: result.estimation.time_saved_percent,
      payload: result
    });

    if (error) {
      throw error;
    }
  }

  if (typeof window !== "undefined") {
    const previous = JSON.parse(window.localStorage.getItem("estimate-ai-history") ?? "[]");
    window.localStorage.setItem(
      "estimate-ai-history",
      JSON.stringify([result, ...previous].slice(0, 8))
    );
  }
}

export function loadLocalHistory(): AnalysisResult[] {
  if (typeof window === "undefined") {
    return [];
  }

  return JSON.parse(window.localStorage.getItem("estimate-ai-history") ?? "[]");
}
