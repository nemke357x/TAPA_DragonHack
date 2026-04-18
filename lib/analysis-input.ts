import { AnalysisInput, RepositoryProfile, SuggestedBaseEstimate } from "@/lib/types";

export function buildAnalysisText(input: AnalysisInput) {
  return [
    input.taskText,
    input.repositoryProfile ? repositoryProfileToAnalysisText(input.repositoryProfile) : "",
    input.clarificationAnswers ? Object.values(input.clarificationAnswers).join("\n") : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function repositoryProfileToAnalysisText(profile: RepositoryProfile) {
  return [
    `Repository: ${profile.owner}/${profile.repositoryName}`,
    `Repository summary: ${profile.repoSummary}`,
    `Default branch: ${profile.defaultBranch}`,
    `Languages: ${profile.detectedLanguages.join(", ") || "unknown"}`,
    `Frameworks: ${profile.detectedFrameworks.join(", ") || "unknown"}`,
    `Package manager: ${profile.packageManager ?? "unknown"}`,
    `Frontend stack: ${profile.frontendStack.join(", ") || "none detected"}`,
    `Backend stack: ${profile.backendStack.join(", ") || "none detected"}`,
    `Database or infra: ${profile.databaseOrInfraHints.join(", ") || "none detected"}`,
    `Testing setup: ${profile.testingSetup.join(", ") || "none detected"}`,
    `Architecture notes: ${profile.architectureNotes.join("; ") || "none detected"}`,
    `Complexity signals: ${profile.complexitySignals.join("; ") || "none detected"}`,
    `Implementation overhead hints: ${profile.implementationOverheadHints.join("; ") || "none detected"}`
  ].join("\n");
}

export function createDefaultBaseEstimate(): SuggestedBaseEstimate {
  return {
    baseEstimateSource: "deterministic-default",
    reasoning: [
      "Base effort currently comes from deterministic task-type configuration.",
      "This is the extension point for a future AI-suggested base effort."
    ]
  };
}

export async function deriveBaseEstimateFromAI(
  _input: AnalysisInput
): Promise<SuggestedBaseEstimate | null> {
  // Future extension point:
  // return { baseHours, baseSize, baseEstimateConfidence, baseEstimateSource: "ai-suggested" }
  // and pass it to buildAnalysis(input, { baseEstimateOverride }).
  return null;
}
