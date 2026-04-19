import { RepoBaseEffortEstimate, SuggestedBaseEstimate } from "@/lib/types";

export function repoBaseToSuggestedEstimate(
  repoBaseEstimate: RepoBaseEffortEstimate | null
): SuggestedBaseEstimate | null {
  if (!repoBaseEstimate) return null;

  const min = repoBaseEstimate.base_effort.min_hours;
  const max = repoBaseEstimate.base_effort.max_hours;
  const midpoint = Math.max(1, Math.round((min + max) / 2));

  return {
    baseHours: midpoint,
    baseSize: sizeFromHours(midpoint),
    baseEstimateConfidence: repoBaseEstimate.confidence_score,
    baseEstimateSource: repoBaseEstimate.mode === "live" ? "ai-suggested" : "repo-fallback",
    reasoning: [
      `Repository base effort: ${min}-${max} hours before clarify/final modifiers.`,
      ...repoBaseEstimate.repo_complexity_signals.slice(0, 3),
      ...repoBaseEstimate.existing_reuse_opportunities.slice(0, 2)
    ]
  };
}

function sizeFromHours(hours: number): SuggestedBaseEstimate["baseSize"] {
  if (hours <= 4) return "xs";
  if (hours <= 10) return "s";
  if (hours <= 24) return "m";
  if (hours <= 48) return "l";
  return "xl";
}
