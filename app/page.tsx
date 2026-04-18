"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  FileText,
  Github,
  History,
  Layers3,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Split,
  Workflow,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MouseEventHandler, ReactElement, ReactNode, SetStateAction } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { demoTasks } from "@/lib/demo-data";
import { inferTaskProfile, scoreTask } from "@/lib/scoring";
import {
  clearDraft,
  loadDraft,
  loadHistoryRecords,
  loadRemoteHistoryRecords,
  saveDraft,
  saveHistoryRecord
} from "@/lib/storage";
import { AnalysisResult, ClarificationDecision, ClarificationQuestion } from "@/lib/types";
import { cn, formatHours } from "@/lib/utils";

type PageStep = "input" | "clarify" | "analyze" | "results" | "plan" | "optimize";

const productSteps: { id: PageStep; label: string; short: string }[] = [
  { id: "input", label: "Input", short: "Understand" },
  { id: "clarify", label: "Clarify", short: "Clarify" },
  { id: "analyze", label: "Analyze", short: "Analyze" },
  { id: "results", label: "Results", short: "Estimate" },
  { id: "plan", label: "Plan", short: "Plan" },
  { id: "optimize", label: "Optimize", short: "Optimize" }
];

const analyzeStages = [
  "Understanding the task",
  "Detecting complexity & dependencies",
  "Calculating effort (without AI)",
  "Calculating effort (with AI)",
  "Building execution plan"
];

const defaultTask = "";

const chartColors = ["#35d399", "#22d3ee", "#facc15", "#fb7185", "#a7f3d0", "#93c5fd"];

function isStep(value: string | null): value is PageStep {
  return productSteps.some((step) => step.id === value);
}

function stepIndex(step: PageStep) {
  return productSteps.findIndex((item) => item.id === step);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function makeAnswersPayload(
  questions: ClarificationQuestion[],
  answers: Record<string, string>
) {
  const payload: Record<string, string> = {};

  questions.forEach((question) => {
    const answer = answers[question.id]?.trim();
    if (!answer) return;
    payload[question.question] = `${question.question}: ${answer}`;
  });

  return payload;
}

function normalizeClarificationQuestions(value: unknown): ClarificationQuestion[] {
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
        id: source.id ?? `clarify-${index + 1}`,
        question: source.question,
        type: source.type === "short_text" ? "short_text" : "yes_no"
      };
    })
    .filter(Boolean) as ClarificationQuestion[];
}

function averageRange(min: number, max: number) {
  return Math.round((min + max) / 2);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function buildHistorySeries(history: AnalysisResult[]) {
  const grouped = new Map<
    string,
    { tasks: number; without: number; withAi: number; saved: number }
  >();

  history.forEach((record) => {
    const day = new Date(record.created_at).toISOString().slice(0, 10);
    const current = grouped.get(day) ?? { tasks: 0, without: 0, withAi: 0, saved: 0 };
    grouped.set(day, {
      tasks: current.tasks + 1,
      without:
        current.without +
        averageRange(
          record.estimation.without_ai_min_hours,
          record.estimation.without_ai_max_hours
        ),
      withAi:
        current.withAi +
        averageRange(record.estimation.with_ai_min_hours, record.estimation.with_ai_max_hours),
      saved: current.saved + record.estimation.time_saved_percent
    });
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, values]) => ({
      day: dayLabel(day),
      tasks: values.tasks,
      avgWithout: Math.round(values.without / values.tasks),
      avgWith: Math.round(values.withAi / values.tasks),
      avgSaved: Math.round(values.saved / values.tasks)
    }));
}

function buildDistribution(
  history: AnalysisResult[],
  getKey: (record: AnalysisResult) => string
) {
  const counts = new Map<string, number>();
  history.forEach((record) => {
    const key = getKey(record);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
}

function confidenceBucket(score: number) {
  if (score >= 85) return "85-100";
  if (score >= 75) return "75-84";
  if (score >= 60) return "60-74";
  return "< 60";
}

export default function Home() {
  return (
    <Suspense fallback={<ShellLoading />}>
      <EstimateApp />
    </Suspense>
  );
}

function ShellLoading() {
  return (
    <main className="min-h-screen bg-[#041014] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4">
        <div className="flex items-center gap-3 text-sm font-bold text-white/60">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
          Loading EstiMate AI
        </div>
      </div>
    </main>
  );
}

function EstimateApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const activeStep: PageStep = isStep(stepParam) ? stepParam : "input";
  const analysisFrom = searchParams.get("from") === "clarify" ? "clarify" : "input";
  const showHistory = searchParams.get("view") === "history";
  const taskFromUrl = searchParams.get("task");

  const [hydrated, setHydrated] = useState(false);
  const [taskText, setTaskText] = useState(defaultTask);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [manualExtraContext, setManualExtraContext] = useState("");
  const [clarificationReason, setClarificationReason] = useState("");
  const [clarificationLoading, setClarificationLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [loadingStage, setLoadingStage] = useState(0);
  const [stageDetail, setStageDetail] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [importNote, setImportNote] = useState("");
  const [error, setError] = useState("");
  const analysisKeyRef = useRef<string | null>(null);
  const clarificationKeyRef = useRef<string | null>(null);

  function routeFor(step: PageStep, taskId = activeTaskId, from?: "input" | "clarify") {
    const params = new URLSearchParams();
    params.set("step", step);
    if (taskId) params.set("task", taskId);
    if (step === "analyze" && from) params.set("from", from);
    return `/?${params.toString()}`;
  }

  function navigate(
    step: PageStep,
    options: { replace?: boolean; taskId?: string | null; from?: "input" | "clarify" } = {}
  ) {
    const target = routeFor(
      step,
      options.taskId === undefined ? activeTaskId : options.taskId,
      options.from
    );
    if (options.replace) {
      router.replace(target);
    } else {
      router.push(target);
    }
  }

  function openHistoryView() {
    router.push("/?view=history");
  }

  function restoreRecord(record: AnalysisResult) {
    const restoredQuestions = normalizeClarificationQuestions(record.clarifyingQuestions);
    const restoredAnswers = record.clarification_answers ?? record.answeredClarifications ?? {};
    const answersById = Object.fromEntries(
      restoredQuestions
        .map((question) => [question.id, restoredAnswers[question.question]])
        .filter(([, answer]) => typeof answer === "string")
    ) as Record<string, string>;

    setActiveTaskId(record.id);
    setCreatedAt(record.created_at);
    setTaskText(record.raw_input);
    setAnswers({ ...restoredAnswers, ...answersById });
    setManualExtraContext(
      record.clarification_answers?.["Manual extra context"] ??
        record.answeredClarifications?.["Manual extra context"] ??
        record.clarification_answers?.["Anything else we should consider?"] ??
        record.answeredClarifications?.["Anything else we should consider?"] ??
        ""
    );
    setQuestions(restoredQuestions);
    setClarificationReason("");
    setResult(record);
    setSaved(true);
    setError("");
  }

  function newTask() {
    clearDraft();
    setTaskText("");
    setActiveTaskId(null);
    setCreatedAt(null);
    setAnswers({});
    setQuestions([]);
    setManualExtraContext("");
    setClarificationReason("");
    setClarificationLoading(false);
    setResult(null);
    setSaved(false);
    setGithubUrl("");
    setImportNote("");
    setError("");
    analysisKeyRef.current = null;
    clarificationKeyRef.current = null;
    router.push("/?step=input");
  }

  useEffect(() => {
    const localHistory = loadHistoryRecords();
    const draft = loadDraft();
    setHistory(localHistory);

    const urlRecord = taskFromUrl
      ? localHistory.find((record) => record.id === taskFromUrl) ?? null
      : null;

    if (urlRecord) {
      restoreRecord(urlRecord);
    } else if (draft) {
      setActiveTaskId(draft.id);
      setCreatedAt(draft.created_at);
      setTaskText(draft.raw_input);
      setAnswers(draft.clarification_answers ?? {});
      setQuestions(normalizeClarificationQuestions(draft.clarifyingQuestions));
      setManualExtraContext(draft.manual_extra_context ?? "");
      setResult(draft.result);
      setGithubUrl(draft.githubUrl ?? "");
      setImportNote(draft.importNote ?? "");
      setSaved(Boolean(draft.result));
    }

    setHydrated(true);

    loadRemoteHistoryRecords().then((remoteHistory) => {
      if (remoteHistory.length === 0) return;
      setHistory(remoteHistory);
      if (taskFromUrl) {
        const remoteRecord = remoteHistory.find((record) => record.id === taskFromUrl);
        if (remoteRecord) restoreRecord(remoteRecord);
      }
    });
  }, []);

  useEffect(() => {
    if (!hydrated || !taskFromUrl) return;
    const record = history.find((item) => item.id === taskFromUrl);
    if (record && record.id !== result?.id) {
      restoreRecord(record);
    }
  }, [history, hydrated, result?.id, taskFromUrl]);

  useEffect(() => {
    if (!hydrated) return;

    saveDraft({
      id: activeTaskId,
      raw_input: taskText,
      created_at: createdAt,
      clarification_answers: answers,
      clarifyingQuestions: questions,
      manual_extra_context: manualExtraContext,
      result,
      githubUrl,
      importNote,
      updated_at: new Date().toISOString()
    });
  }, [
    activeTaskId,
    answers,
    createdAt,
    githubUrl,
    hydrated,
    importNote,
    manualExtraContext,
    questions,
    result,
    taskText
  ]);

  useEffect(() => {
    if (!hydrated || showHistory) return;

    if (activeStep !== "input" && !taskText.trim() && !result) {
      router.replace("/?step=input");
      return;
    }

    if ((activeStep === "results" || activeStep === "plan" || activeStep === "optimize") && !result) {
      router.replace("/?step=input");
    }
  }, [activeStep, hydrated, result, router, showHistory, taskText]);

  useEffect(() => {
    if (!hydrated || showHistory || activeStep !== "analyze") return;
    if (!taskText.trim() || isAnalyzing) return;
    if (result && result.id === activeTaskId) return;

    runAnalysis();
  }, [activeStep, activeTaskId, hydrated, isAnalyzing, result, showHistory, taskText]);

  useEffect(() => {
    if (!hydrated || showHistory || activeStep !== "clarify") return;
    const trimmed = taskText.trim();
    if (!trimmed || clarificationLoading) return;
    if (clarificationKeyRef.current === trimmed) return;

    loadClarificationQuestions(trimmed);
  }, [activeStep, clarificationLoading, hydrated, showHistory, taskText]);

  const historySeries = useMemo(() => buildHistorySeries(history), [history]);
  const taskTypeDistribution = useMemo(
    () => buildDistribution(history, (record) => record.profile.task_type),
    [history]
  );
  const confidenceDistribution = useMemo(
    () => buildDistribution(history, (record) => confidenceBucket(record.estimation.confidence_score)),
    [history]
  );

  const canVisit = (step: PageStep) => {
    if (step === "input") return true;
    if (step === "clarify" || step === "analyze") return Boolean(taskText.trim());
    return Boolean(result);
  };

  function handleTaskTextChange(value: string) {
    setTaskText(value);
    setError("");
    if (result && value !== result.raw_input) {
      setResult(null);
      setActiveTaskId(null);
      setCreatedAt(null);
      setAnswers({});
      setQuestions([]);
      setManualExtraContext("");
      setClarificationReason("");
      setSaved(false);
      analysisKeyRef.current = null;
      clarificationKeyRef.current = null;
    }
  }

  function selectExample(ticket: string) {
    handleTaskTextChange(ticket);
    setImportNote("");
  }

  function ensureTaskRecord() {
    const trimmed = taskText.trim();
    if (!trimmed) {
      setError("Paste a task description first.");
      return null;
    }

    const id = activeTaskId ?? crypto.randomUUID();
    const created = createdAt ?? new Date().toISOString();
    setActiveTaskId(id);
    setCreatedAt(created);
    setError("");

    return { id, created, trimmed };
  }

  function beginQuickAnalysis() {
    const task = ensureTaskRecord();
    if (!task) return;

    setResult(null);
    setSaved(false);
    analysisKeyRef.current = null;
    navigate("analyze", { taskId: task.id, from: "input" });
  }

  async function loadClarificationQuestions(trimmed: string) {
    clarificationKeyRef.current = trimmed;
    setClarificationLoading(true);
    setClarificationReason("AI is checking whether more context would improve the estimate.");

    try {
      const response = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: trimmed })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not generate clarification questions.");
      }

      const decision = payload.decision as ClarificationDecision;
      setQuestions(decision.questions ?? []);
      setClarificationReason(
        decision.reason ??
          (decision.clarificationNeeded
            ? "AI found a few useful questions for this task."
            : "AI thinks this task is clear enough for a first estimate.")
      );
    } catch (clarificationError) {
      setQuestions([]);
      setClarificationReason(
        clarificationError instanceof Error
          ? clarificationError.message
          : "Clarification generation failed. You can still add manual context."
      );
    } finally {
      setClarificationLoading(false);
    }
  }

  function beginClarify() {
    const task = ensureTaskRecord();
    if (!task) return;

    setResult(null);
    setSaved(false);
    analysisKeyRef.current = null;
    navigate("clarify", { taskId: task.id });
    loadClarificationQuestions(task.trimmed);
  }

  function continueToAnalyze() {
    setResult(null);
    setSaved(false);
    analysisKeyRef.current = null;
    navigate("analyze", { from: "clarify" });
  }

  async function runAnalysis() {
    const trimmed = taskText.trim();
    if (!trimmed) return;

    const taskId = activeTaskId ?? crypto.randomUUID();
    const taskCreatedAt = createdAt ?? new Date().toISOString();
    const payloadAnswers = makeAnswersPayload(questions, answers);
    const runKey = `${taskId}:${trimmed}:${JSON.stringify(payloadAnswers)}`;

    if (analysisKeyRef.current === runKey) return;
    analysisKeyRef.current = runKey;
    setActiveTaskId(taskId);
    setCreatedAt(taskCreatedAt);
    setIsAnalyzing(true);
    setLoadingStage(0);
    setStageDetail("Parsing raw task text into a structured profile.");
    setError("");

    try {
      const localProfile = inferTaskProfile(
        `${trimmed}\n${Object.values(payloadAnswers).join("\n")}\n${manualExtraContext}`
      );
      await sleep(420);
      setLoadingStage(1);
      setStageDetail(
        `Detected ${localProfile.complexity} complexity, ${localProfile.dependencies} dependencies, and ${localProfile.ambiguity} ambiguity.`
      );

      const localEstimate = scoreTask(localProfile);
      await sleep(420);
      setLoadingStage(2);
      setStageDetail(
        `Without AI range: ${formatHours(
          localEstimate.without_ai_min_hours,
          localEstimate.without_ai_max_hours
        )}.`
      );

      await sleep(420);
      setLoadingStage(3);
      setStageDetail("Applying AI leverage rules and optional model-enhanced explanation.");

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: trimmed,
          answers: payloadAnswers,
          clarificationQuestions: questions,
          manualExtraContext: manualExtraContext.trim(),
          taskId,
          createdAt: taskCreatedAt
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Analysis failed.");
      }

      const nextResult = payload.result as AnalysisResult;
      await sleep(360);
      setLoadingStage(4);
      setStageDetail("Building the saved execution plan, blockers, accelerators, and optimization.");

      const nextHistory = await saveHistoryRecord(nextResult);
      setHistory(nextHistory);
      setResult(nextResult);
      setQuestions(
        nextResult.clarifyingQuestions.length
          ? normalizeClarificationQuestions(nextResult.clarifyingQuestions)
          : questions
      );
      setSaved(true);

      await sleep(520);
      navigate("results", { replace: true, taskId: nextResult.id });
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Analysis failed.");
      analysisKeyRef.current = null;
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function importGithubIssue() {
    if (!githubUrl.trim()) {
      setImportNote("Paste a GitHub issue URL first.");
      return;
    }

    setImportNote("Importing GitHub issue...");

    try {
      const response = await fetch("/api/import/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: githubUrl })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);

      handleTaskTextChange(payload.importedText);
      setImportNote(`Imported "${payload.title}" from GitHub.`);
    } catch (importError) {
      setImportNote(importError instanceof Error ? importError.message : "GitHub import failed.");
    }
  }

  function importPlaceholder(name: string) {
    setImportNote(`${name} import is connector-ready. Paste task text or use GitHub for live import.`);
  }

  async function saveCurrentResult() {
    if (!result) return;
    const nextHistory = await saveHistoryRecord(result);
    setHistory(nextHistory);
    setSaved(true);
  }

  function openRecord(record: AnalysisResult, step: PageStep = "results") {
    restoreRecord(record);
    navigate(step, { taskId: record.id });
  }

  return (
    <main className="min-h-screen bg-[#041014] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6">
        <AppHeader
          onHistory={openHistoryView}
          onNewTask={newTask}
          historyCount={history.length}
        />

        {showHistory ? (
          <HistoryScreen
            history={history}
            historySeries={historySeries}
            taskTypeDistribution={taskTypeDistribution}
            confidenceDistribution={confidenceDistribution}
            onOpenRecord={openRecord}
            onBack={() => navigate(result ? "results" : "input")}
          />
        ) : (
          <>
            <TopProgress
              currentStep={activeStep}
              canVisit={canVisit}
              onStepClick={(step) => {
                if (canVisit(step)) navigate(step);
              }}
            />

            <section className="flex-1">
              {activeStep === "input" && (
                <InputScreen
                  taskText={taskText}
                  setTaskText={handleTaskTextChange}
                  onAnalyze={beginQuickAnalysis}
                  onAddContext={beginClarify}
                  githubUrl={githubUrl}
                  setGithubUrl={setGithubUrl}
                  importGithubIssue={importGithubIssue}
                  importPlaceholder={importPlaceholder}
                  importNote={importNote}
                  error={error}
                  selectExample={selectExample}
                />
              )}

              {activeStep === "clarify" && (
                <ClarifyScreen
                  questions={questions}
                  answers={answers}
                  setAnswers={setAnswers}
                  manualExtraContext={manualExtraContext}
                  setManualExtraContext={setManualExtraContext}
                  loading={clarificationLoading}
                  reason={clarificationReason}
                  onBack={() => navigate("input")}
                  onContinue={continueToAnalyze}
                />
              )}

              {activeStep === "analyze" && (
                <AnalyzeScreen
                  loadingStage={loadingStage}
                  stageDetail={stageDetail}
                  error={error}
                  isAnalyzing={isAnalyzing}
                  result={result}
                  onBack={() => navigate(analysisFrom === "clarify" ? "clarify" : "input")}
                  onContinue={() => navigate("results")}
                  onRetry={() => {
                    analysisKeyRef.current = null;
                    runAnalysis();
                  }}
                />
              )}

              {activeStep === "results" && result && (
                <ResultsScreen
                  result={result}
                  onBack={() => navigate("analyze")}
                  onPlan={() => navigate("plan")}
                  onOptimize={() => navigate("optimize")}
                  onSave={saveCurrentResult}
                  saved={saved}
                />
              )}

              {activeStep === "plan" && result && (
                <PlanScreen
                  result={result}
                  onBack={() => navigate("results")}
                  onOptimize={() => navigate("optimize")}
                />
              )}

              {activeStep === "optimize" && result && (
                <OptimizeScreen
                  result={result}
                  onBack={() => navigate("plan")}
                  onResults={() => navigate("results")}
                />
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function AppHeader({
  onHistory,
  onNewTask,
  historyCount
}: {
  onHistory: () => void;
  onNewTask: () => void;
  historyCount: number;
}) {
  return (
    <header className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-4">
      <button className="flex items-center gap-2 text-left" onClick={onNewTask}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300/25 bg-emerald-300/10">
          <Sparkles className="h-4 w-4 text-emerald-300" />
        </span>
        <span className="font-black text-emerald-300">EstiMate AI</span>
      </button>

      <nav className="hidden items-center gap-6 text-xs font-bold text-white/60 md:flex">
        <span>How it works</span>
        <span>Integrations</span>
        <span>Pricing</span>
      </nav>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white"
          onClick={onHistory}
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">History</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{historyCount}</span>
        </Button>
        <Button
          size="sm"
          className="h-9 bg-emerald-400 text-[#041014] hover:bg-emerald-300"
          onClick={onNewTask}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </Button>
      </div>
    </header>
  );
}

function TopProgress({
  currentStep,
  canVisit,
  onStepClick
}: {
  currentStep: PageStep;
  canVisit: (step: PageStep) => boolean;
  onStepClick: (step: PageStep) => void;
}) {
  const activeIndex = stepIndex(currentStep);

  return (
    <div className="mx-auto mb-6 w-full max-w-5xl">
      <div className="grid grid-cols-6 gap-2">
        {productSteps.map((step, index) => {
          const active = index === activeIndex;
          const done = index < activeIndex;
          const available = canVisit(step.id);

          return (
            <button
              key={step.id}
              className={cn(
                "group min-w-0 text-center",
                !available && "cursor-not-allowed opacity-45"
              )}
              disabled={!available}
              onClick={() => onStepClick(step.id)}
            >
              <div className="flex items-center">
                <span
                  className={cn(
                    "mx-auto flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-[#07181c] text-[10px] font-black text-white/40",
                    active && "border-emerald-300 bg-emerald-300 text-[#041014]",
                    done && "border-emerald-300/70 bg-emerald-300/20 text-emerald-200"
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : index + 1}
                </span>
              </div>
              <div
                className={cn(
                  "mt-2 h-0.5 rounded-full bg-white/10",
                  (active || done) && "bg-emerald-300"
                )}
              />
              <p
                className={cn(
                  "mt-2 truncate text-[11px] font-bold text-white/35",
                  active && "text-emerald-200",
                  done && "text-white/60"
                )}
              >
                {step.short}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InputScreen({
  taskText,
  setTaskText,
  onAnalyze,
  onAddContext,
  githubUrl,
  setGithubUrl,
  importGithubIssue,
  importPlaceholder,
  importNote,
  error,
  selectExample
}: {
  taskText: string;
  setTaskText: (value: string) => void;
  onAnalyze: () => void;
  onAddContext: () => void;
  githubUrl: string;
  setGithubUrl: (value: string) => void;
  importGithubIssue: () => void;
  importPlaceholder: (name: string) => void;
  importNote: string;
  error: string;
  selectExample: (ticket: string) => void;
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center py-4 text-center sm:py-8">
      <h1 className="max-w-2xl text-4xl font-black leading-tight tracking-normal sm:text-5xl">
        Estimate software work for the AI era
      </h1>
      <p className="mt-4 max-w-lg text-sm leading-6 text-white/60">
        Paste a task, compare with and without AI, and get subtasks, blockers, and workflow
        guidance.
      </p>

      <div className="mt-6 w-full max-w-2xl">
        <Textarea
          value={taskText}
          onChange={(event) => setTaskText(event.target.value)}
          className="min-h-[156px] border-white/20 bg-[#07181c] text-left text-base text-white shadow-[0_0_40px_rgba(45,212,191,0.08)] placeholder:text-white/40"
          placeholder="Build password reset flow with token expiry, email link, backend validation, and frontend reset form..."
        />

        <div className="-mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button
            size="lg"
            className="h-12 min-w-44 bg-emerald-400 text-[#041014] hover:bg-emerald-300"
            onClick={onAnalyze}
          >
            Analyze Task <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-12 min-w-44 border-white/15 bg-[#0a1c21] text-white hover:border-emerald-300/45 hover:bg-white/10"
            onClick={onAddContext}
          >
            Add More Context <MessageSquare className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm font-bold text-rose-300">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="font-bold text-white/45">Try example:</span>
        {demoTasks.slice(0, 4).map((task) => (
          <button
            key={task.id}
            className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 font-bold text-white/65 transition hover:border-emerald-300/50 hover:text-emerald-200"
            onClick={() => selectExample(task.ticket)}
          >
            {task.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid w-full max-w-2xl gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          value={githubUrl}
          onChange={(event) => setGithubUrl(event.target.value)}
          className="border-white/15 bg-[#07181c] text-white placeholder:text-white/35"
          placeholder="Optional public GitHub issue URL"
        />
        <Button
          variant="secondary"
          className="border-white/10 bg-white/[0.06] text-white hover:bg-white/10"
          onClick={importGithubIssue}
        >
          <Github className="h-4 w-4" />
          Import
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <ImportButton label="Jira" icon={Layers3} onClick={() => importPlaceholder("Jira")} />
        <ImportButton label="Linear" icon={Workflow} onClick={() => importPlaceholder("Linear")} />
        <ImportButton label="Slack" icon={MessageSquare} onClick={() => importPlaceholder("Slack")} />
      </div>

      {importNote && <p className="mt-3 text-xs text-white/50">{importNote}</p>}

      <div className="mt-8 flex flex-wrap justify-center gap-4 text-[11px] font-bold text-white/40">
        <span>AI-powered estimation</span>
        <span>•</span>
        <span>Smarter planning</span>
        <span>•</span>
        <span>Better delivery</span>
      </div>
    </div>
  );
}

function ImportButton({
  label,
  icon: Icon,
  onClick
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/60 transition hover:border-emerald-300/45 hover:text-emerald-200"
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function ClarifyScreen({
  questions,
  answers,
  setAnswers,
  manualExtraContext,
  setManualExtraContext,
  loading,
  reason,
  onBack,
  onContinue
}: {
  questions: ClarificationQuestion[];
  answers: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  manualExtraContext: string;
  setManualExtraContext: (value: string) => void;
  loading: boolean;
  reason: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <DarkFrame>
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-2xl font-black tracking-normal">AI context check</h2>
          <p className="mt-2 text-xs font-bold text-white/50">
            Answer only what you know. These details are optional, but they can sharpen the
            estimate and plan.
          </p>
          {reason && <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-emerald-200/80">{reason}</p>}
        </div>

        {loading ? (
          <div className="mt-7 rounded-lg border border-white/10 bg-white/[0.045] p-6 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-300" />
            <p className="mt-3 text-sm font-black text-white/75">
              Generating task-specific questions...
            </p>
          </div>
        ) : questions.length > 0 ? (
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {questions.map((question) => (
              <ClarifyCard
                key={question.id}
                question={question}
                value={answers[question.id] ?? ""}
                onChange={(value) =>
                  setAnswers((current) => ({ ...current, [question.id]: value }))
                }
              />
            ))}
          </div>
        ) : (
          <div className="mt-7 rounded-lg border border-emerald-300/15 bg-emerald-300/10 p-5 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-300" />
            <p className="mt-3 text-sm font-black text-emerald-100">
              AI thinks this task is clear enough for a first estimate.
            </p>
            <p className="mt-2 text-xs leading-5 text-white/50">
              You can still add anything important below before analyzing.
            </p>
          </div>
        )}

        <label className="mt-5 block rounded-lg border border-white/10 bg-white/[0.045] p-4">
          <span className="text-sm font-black text-white/85">Anything else we should consider?</span>
          <Textarea
            value={manualExtraContext}
            onChange={(event) => setManualExtraContext(event.target.value)}
            className="mt-3 min-h-[116px] border-white/10 bg-[#07181c] text-white placeholder:text-white/35"
            placeholder="Add constraints, team context, deadlines, known blockers, review needs, or any nuance the AI did not ask about."
          />
        </label>

        <div className="mt-7 flex items-center justify-between">
          <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            className="bg-emerald-400 text-[#041014] hover:bg-emerald-300"
            disabled={loading}
            onClick={onContinue}
          >
            Analyze Task <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </DarkFrame>
  );
}

function ClarifyCard({
  question,
  value,
  onChange
}: {
  question: ClarificationQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = ["Yes", "No", "Not sure"];

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.055] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-black text-white/90">{question.question}</p>
        <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black uppercase text-white/50">
          {question.type === "yes_no" ? "Quick" : "Short"}
        </span>
      </div>

      {question.type === "yes_no" ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {options.map((option) => (
              <button
                key={option}
                className={cn(
                  "rounded-md border border-white/10 bg-[#0a1c21] px-2 py-2 text-xs font-black text-white/60 transition hover:border-emerald-300/40",
                  value === option && "border-emerald-300/55 bg-emerald-300/15 text-emerald-200"
                )}
                onClick={() => onChange(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <Input
            value={value && !options.includes(value) ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            className="mt-3 border-white/10 bg-[#07181c] text-white placeholder:text-white/35"
            placeholder="Optional detail instead of a quick answer"
          />
        </>
      ) : (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-4 min-h-[96px] border-white/10 bg-[#07181c] text-white placeholder:text-white/35"
          placeholder="Short answer"
        />
      )}
    </div>
  );
}

function AnalyzeScreen({
  loadingStage,
  stageDetail,
  error,
  isAnalyzing,
  result,
  onBack,
  onContinue,
  onRetry
}: {
  loadingStage: number;
  stageDetail: string;
  error: string;
  isAnalyzing: boolean;
  result: AnalysisResult | null;
  onBack: () => void;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const completed = Boolean(result) && !isAnalyzing;

  return (
    <DarkFrame>
      <div className="mx-auto grid max-w-5xl items-center gap-10 py-4 lg:grid-cols-[1fr_330px]">
        <div>
          <h2 className="text-2xl font-black tracking-normal">
            {completed ? "Analysis complete" : "Analyzing your task..."}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/55">
            The stages use the parsed profile, deterministic scoring rules, and the optional
            AI-enhanced explanation path.
          </p>

          <div className="mt-8 space-y-5">
            {analyzeStages.map((stage, index) => {
              const done = completed || index < loadingStage;
              const active = !completed && index === loadingStage;

              return (
                <div key={stage} className="flex items-center gap-4">
                  <span
                    className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-xs font-black text-white/35",
                      done && "border-emerald-300 bg-emerald-300/20 text-emerald-200",
                      active && "border-emerald-300 text-emerald-200"
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : index + 1}
                  </span>
                  <span className={cn("text-sm font-black", done || active ? "text-white/90" : "text-white/40")}>
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>

          {stageDetail && <p className="mt-6 text-sm font-bold text-emerald-200/80">{stageDetail}</p>}
          {error && <p className="mt-5 text-sm font-bold text-rose-300">{error}</p>}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {error ? (
              <Button className="bg-emerald-400 text-[#041014] hover:bg-emerald-300" onClick={onRetry}>
                <RefreshCcw className="h-4 w-4" />
                Retry
              </Button>
            ) : completed ? (
              <Button className="bg-emerald-400 text-[#041014] hover:bg-emerald-300" onClick={onContinue}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-lg border border-cyan-300/10 bg-[#061a20]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px)] bg-[size:44px_44px]" />
          <Brain className="relative h-40 w-40 text-cyan-300 drop-shadow-[0_0_32px_rgba(34,211,238,0.38)]" />
        </div>
      </div>
    </DarkFrame>
  );
}

function ResultsScreen({
  result,
  onBack,
  onPlan,
  onOptimize,
  onSave,
  saved
}: {
  result: AnalysisResult;
  onBack: () => void;
  onPlan: () => void;
  onOptimize: () => void;
  onSave: () => void;
  saved: boolean;
}) {
  return (
    <DarkFrame>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-white/10 bg-white/[0.06] text-white/70">Manual input</Badge>
              <Badge className="border-emerald-300/25 bg-emerald-300/10 text-emerald-200">
                {result.estimation.confidence_score}% confidence
              </Badge>
              <Badge className="border-white/10 bg-white/[0.06] text-white/70">
                {result.profile.task_type}
              </Badge>
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-normal">{result.title}</h2>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="border-white/10 bg-white/[0.06] text-white hover:bg-white/10"
              onClick={onSave}
            >
              <Save className="h-4 w-4" />
              {saved ? "Saved" : "Save"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric
            label="Without AI"
            value={formatHours(
              result.estimation.without_ai_min_hours,
              result.estimation.without_ai_max_hours
            )}
          />
          <Metric
            label="With AI"
            value={formatHours(
              result.estimation.with_ai_min_hours,
              result.estimation.with_ai_max_hours
            )}
          />
          <Metric label="Time saved" value={`${result.estimation.time_saved_percent}%`} green />
          <Metric label="Confidence" value={`${result.estimation.confidence_score}%`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ListPanel title="Why this estimate" items={result.explanation} icon={FileText} />
          <ListPanel title="Top blockers" items={result.blockers} icon={ShieldAlert} danger />
          <ListPanel title="Top accelerators" items={result.accelerators} icon={Zap} />
          <Panel title="AI leverage">
            <div className="flex items-center justify-between text-xs font-black text-white/60">
              <span>{result.profile.ai_leverage} leverage</span>
              <span>{result.estimation.time_saved_percent}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-emerald-300"
                style={{
                  width:
                    result.profile.ai_leverage === "high"
                      ? "78%"
                      : result.profile.ai_leverage === "medium"
                        ? "58%"
                        : "35%"
                }}
              />
            </div>
            <p className="mt-4 text-sm leading-6 text-white/60">{result.developerSummary}</p>
          </Panel>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="border-white/10 bg-white/[0.06] text-white hover:bg-white/10"
              onClick={onOptimize}
            >
              Optimize
            </Button>
            <Button className="bg-emerald-400 text-[#041014] hover:bg-emerald-300" onClick={onPlan}>
              Plan <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </DarkFrame>
  );
}

function PlanScreen({
  result,
  onBack,
  onOptimize
}: {
  result: AnalysisResult;
  onBack: () => void;
  onOptimize: () => void;
}) {
  return (
    <DarkFrame>
      <div className="space-y-5">
        <h2 className="text-2xl font-black tracking-normal">Subtasks & execution plan</h2>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Panel title="Subtasks">
            <div className="space-y-4">
              {result.plan.subtasks.map((subtask, index) => (
                <div
                  key={subtask.title}
                  className="grid gap-3 text-sm sm:grid-cols-[28px_1fr_56px_72px_84px] sm:items-center"
                >
                  <span className="font-black text-white/70">{index + 1}.</span>
                  <div>
                    <p className="font-black text-white/90">{subtask.title}</p>
                    <p className="mt-1 text-xs text-white/40">{subtask.owner}</p>
                  </div>
                  <span className="font-bold text-white/60">{subtask.sharePercent}%</span>
                  <Tag tone={subtask.aiHelpfulnessTag}>{subtask.aiHelpfulnessTag}</Tag>
                  <Tag tone={subtask.priority}>{subtask.priority}</Tag>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Execution order">
            <div className="space-y-4">
              {result.plan.execution_order.map((item, index) => (
                <div key={item} className="flex gap-3 text-sm leading-6">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-300/20 text-xs font-black text-emerald-200">
                    {index + 1}
                  </span>
                  <span className="text-white/60">{item}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="Parallelizable">
          <div className="flex flex-wrap gap-2">
            {result.plan.parallelizable_groups.flat().map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="rounded-md border border-emerald-300/15 bg-emerald-300/10 px-3 py-2 text-xs font-black text-emerald-200"
              >
                {index + 1} {item}
              </span>
            ))}
          </div>
        </Panel>

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button className="bg-emerald-400 text-[#041014] hover:bg-emerald-300" onClick={onOptimize}>
            Optimize <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </DarkFrame>
  );
}

function OptimizeScreen({
  result,
  onBack,
  onResults
}: {
  result: AnalysisResult;
  onBack: () => void;
  onResults: () => void;
}) {
  return (
    <DarkFrame>
      <div className="space-y-5">
        <h2 className="text-2xl font-black tracking-normal">Workflow optimization</h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Optimization insights">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <Metric
                label="Current plan"
                value={formatHours(
                  result.optimization.current_plan_estimate.min_hours,
                  result.optimization.current_plan_estimate.max_hours
                )}
              />
              <ArrowRight className="mx-auto h-5 w-5 text-emerald-200" />
              <Metric
                label="Optimized plan"
                value={formatHours(
                  result.optimization.optimized_plan_estimate.min_hours,
                  result.optimization.optimized_plan_estimate.max_hours
                )}
                green
              />
            </div>
          </Panel>

          <ListPanel
            title="Key improvements"
            items={result.optimization.key_improvements}
            icon={CheckCircle2}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Data sources used">
            <div className="grid gap-4 sm:grid-cols-2">
              {result.optimization.data_sources_used.slice(0, 4).map((source) => (
                <div key={source.name} className="flex gap-3">
                  <Database className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
                  <div>
                    <p className="text-sm font-black text-white/80">{source.name}</p>
                    <p className="mt-1 text-xs leading-5 text-white/50">{source.fields.join(", ")}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <ListPanel
            title="What we considered"
            items={result.optimization.considered}
            icon={Check}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ListPanel title="Current plan" items={result.beforeOptimization} icon={Split} />
          <ListPanel title="Optimized plan" items={result.afterOptimization} icon={Workflow} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            variant="secondary"
            className="border-white/10 bg-white/[0.06] text-white hover:bg-white/10"
            onClick={onResults}
          >
            Results
          </Button>
        </div>
      </div>
    </DarkFrame>
  );
}

function HistoryScreen({
  history,
  historySeries,
  taskTypeDistribution,
  confidenceDistribution,
  onOpenRecord,
  onBack
}: {
  history: AnalysisResult[];
  historySeries: ReturnType<typeof buildHistorySeries>;
  taskTypeDistribution: { name: string; value: number }[];
  confidenceDistribution: { name: string; value: number }[];
  onOpenRecord: (record: AnalysisResult, step?: PageStep) => void;
  onBack: () => void;
}) {
  const averages = useMemo(() => {
    if (history.length === 0) {
      return { without: 0, withAi: 0, saved: 0, confidence: 0 };
    }

    return history.reduce(
      (acc, record, index) => {
        const next = {
          without:
            acc.without +
            averageRange(
              record.estimation.without_ai_min_hours,
              record.estimation.without_ai_max_hours
            ),
          withAi:
            acc.withAi +
            averageRange(record.estimation.with_ai_min_hours, record.estimation.with_ai_max_hours),
          saved: acc.saved + record.estimation.time_saved_percent,
          confidence: acc.confidence + record.estimation.confidence_score
        };

        if (index === history.length - 1) {
          return {
            without: Math.round(next.without / history.length),
            withAi: Math.round(next.withAi / history.length),
            saved: Math.round(next.saved / history.length),
            confidence: Math.round(next.confidence / history.length)
          };
        }

        return next;
      },
      { without: 0, withAi: 0, saved: 0, confidence: 0 }
    );
  }, [history]);

  return (
    <DarkFrame>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <Badge className="border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
              History Analytics
            </Badge>
            <h1 className="mt-3 text-3xl font-black tracking-normal">Analyzed tasks</h1>
            <p className="mt-2 text-sm text-white/50">
              Saved analyses persist across refreshes and power the dashboard.
            </p>
          </div>
          <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Tasks analyzed" value={`${history.length}`} />
          <Metric label="Avg without AI" value={`${averages.without}h`} />
          <Metric label="Avg with AI" value={`${averages.withAi}h`} green />
          <Metric label="Avg saved" value={`${averages.saved}%`} green />
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
          <Panel title="History">
            {history.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
                {history.map((record) => (
                  <button
                    key={record.id}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.045] p-3 text-left transition hover:border-emerald-300/35 hover:bg-white/[0.07]"
                    onClick={() => onOpenRecord(record, "results")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="line-clamp-2 text-sm font-black text-white/85">{record.title}</p>
                        <p className="mt-1 text-xs text-white/40">{shortDate(record.created_at)}</p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/35" />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <HistoryMiniMetric
                        label="No AI"
                        value={formatHours(
                          record.estimation.without_ai_min_hours,
                          record.estimation.without_ai_max_hours
                        )}
                      />
                      <HistoryMiniMetric
                        label="AI"
                        value={formatHours(
                          record.estimation.with_ai_min_hours,
                          record.estimation.with_ai_max_hours
                        )}
                      />
                      <HistoryMiniMetric
                        label="Conf"
                        value={`${record.estimation.confidence_score}%`}
                      />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <SmallLinkButton onClick={(event) => {
                        event.stopPropagation();
                        onOpenRecord(record, "plan");
                      }}>
                        Plan
                      </SmallLinkButton>
                      <SmallLinkButton onClick={(event) => {
                        event.stopPropagation();
                        onOpenRecord(record, "optimize");
                      }}>
                        Optimize
                      </SmallLinkButton>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <div className="space-y-4">
            <Panel title="Tasks analyzed over time">
              <ChartWrap>
                <LineChart data={historySeries}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="day" tick={chartTick} tickLine={false} axisLine={false} />
                  <YAxis tick={chartTick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="tasks" stroke="#35d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartWrap>
            </Panel>

            <Panel title="Average estimate over time">
              <ChartWrap>
                <LineChart data={historySeries}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="day" tick={chartTick} tickLine={false} axisLine={false} />
                  <YAxis tick={chartTick} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="avgWithout" name="Without AI" stroke="#94a3b8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="avgWith" name="With AI" stroke="#35d399" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="avgSaved" name="Saved %" stroke="#22d3ee" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartWrap>
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Task type distribution">
                <ChartWrap small>
                  <PieChart>
                    <Pie data={taskTypeDistribution} dataKey="value" nameKey="name" innerRadius={42} outerRadius={76} paddingAngle={4}>
                      {taskTypeDistribution.map((entry, index) => (
                        <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ChartWrap>
              </Panel>

              <Panel title="Confidence distribution">
                <ChartWrap small>
                  <BarChart data={confidenceDistribution}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="name" tick={chartTick} tickLine={false} axisLine={false} />
                    <YAxis tick={chartTick} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#35d399" />
                  </BarChart>
                </ChartWrap>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </DarkFrame>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-white/15 p-8 text-center">
      <Clock3 className="mx-auto h-8 w-8 text-white/35" />
      <p className="mt-3 text-sm font-black text-white/70">No analyzed tasks yet</p>
      <p className="mt-2 text-xs leading-5 text-white/45">
        Run an analysis and it will appear here with estimates, confidence, and charts.
      </p>
    </div>
  );
}

function DarkFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#07161b] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.26)] sm:p-6">
      {children}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
      <h3 className="mb-4 text-sm font-black text-white/80">{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a1c21] p-4">
      <p className="text-xs font-black text-white/50">{label}</p>
      <p className={cn("mt-2 text-2xl font-black tracking-normal", green ? "text-emerald-300" : "text-white")}>
        {value}
      </p>
    </div>
  );
}

function ListPanel({
  title,
  items,
  icon: Icon,
  danger
}: {
  title: string;
  items: string[];
  icon: LucideIcon;
  danger?: boolean;
}) {
  return (
    <Panel title={title}>
      <div className="space-y-3">
        {items.slice(0, 5).map((item) => (
          <div key={item} className="flex gap-3 text-sm leading-6 text-white/65">
            <Icon className={cn("mt-1 h-4 w-4 shrink-0", danger ? "text-rose-300" : "text-emerald-300")} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Tag({ tone, children }: { tone: "Low" | "Medium" | "High"; children: ReactNode }) {
  const classes = {
    Low: "border-white/10 bg-white/[0.05] text-white/50",
    Medium: "border-amber-300/20 bg-amber-300/10 text-amber-200",
    High: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
  };

  return (
    <span className={cn("w-fit rounded-md border px-2 py-1 text-[11px] font-black", classes[tone])}>
      {children}
    </span>
  );
}

function HistoryMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#0a1c21] px-2 py-2">
      <p className="font-black text-white/35">{label}</p>
      <p className="mt-1 font-black text-white/80">{value}</p>
    </div>
  );
}

function SmallLinkButton({
  children,
  onClick
}: {
  children: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-black text-white/60 transition hover:border-emerald-300/40 hover:text-emerald-200"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ChartWrap({ children, small }: { children: ReactElement; small?: boolean }) {
  return (
    <div className={cn("w-full", small ? "h-[220px]" : "h-[250px]")}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const chartTick = {
  fill: "rgba(255,255,255,0.55)",
  fontSize: 11,
  fontWeight: 700
};

const tooltipStyle = {
  background: "#07161b",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#fff"
};
