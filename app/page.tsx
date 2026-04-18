"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Database,
  FileText,
  Github,
  GitPullRequest,
  Layers3,
  Loader2,
  MessageSquare,
  Save,
  ShieldAlert,
  Sparkles,
  Split,
  Workflow,
  Zap
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { demoTasks } from "@/lib/demo-data";
import { saveResult } from "@/lib/supabase";
import { AnalysisResult } from "@/lib/types";
import { cn, formatHours } from "@/lib/utils";

type PageStep = "input" | "clarify" | "analyze" | "results" | "plan" | "optimize";

const productSteps: { id: PageStep; label: string }[] = [
  { id: "input", label: "Input" },
  { id: "clarify", label: "Clarify" },
  { id: "analyze", label: "Analyze" },
  { id: "results", label: "Results" },
  { id: "plan", label: "Plan" },
  { id: "optimize", label: "Optimize" }
];

const analyzeStages = [
  "Understanding task",
  "Detecting complexity and dependencies",
  "Calculating effort without AI",
  "Calculating effort with AI",
  "Building execution plan"
];

const optionalFields = [
  {
    key: "quality level",
    label: "Quality level",
    placeholder: "MVP, production-ready, security-sensitive..."
  },
  {
    key: "known blockers",
    label: "Known blockers",
    placeholder: "Waiting on API contract, unclear permissions..."
  },
  {
    key: "review requirements",
    label: "Review requirements",
    placeholder: "Security review, product approval, design QA..."
  },
  {
    key: "team context",
    label: "Team context",
    placeholder: "Junior owner, senior reviewer, backend available..."
  }
];

const fallbackTicket =
  "Build password reset flow with token expiry, email link, backend validation, and frontend reset form.";

function stepNumber(step: PageStep) {
  return productSteps.findIndex((item) => item.id === step);
}

function answerPayload(answers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(answers)
      .filter(([, value]) => value.trim())
      .map(([key, value]) => [key, `${key}: ${value}`])
  );
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState<PageStep>("input");
  const [ticket, setTicket] = useState(fallbackTicket);
  const [githubUrl, setGithubUrl] = useState("");
  const [importNote, setImportNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draftResult, setDraftResult] = useState<AnalysisResult | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);
  const [saved, setSaved] = useState(false);

  const metricChart = useMemo(() => {
    if (!result) return [];
    return [
      { name: "Without AI", value: result.estimation.without_ai_max_hours },
      { name: "With AI", value: result.estimation.with_ai_max_hours }
    ];
  }, [result]);

  async function requestAnalysis(target: "clarify" | "results") {
    setCurrentStep("analyze");
    setLoadingStage(0);
    setSaved(false);

    const timer = window.setInterval(() => {
      setLoadingStage((stage) => Math.min(stage + 1, analyzeStages.length - 1));
    }, 420);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, answers: answerPayload(answers) })
      });
      const payload = await response.json();
      const nextResult = payload.result as AnalysisResult;

      setDraftResult(nextResult);

      if (target === "clarify" && nextResult.clarifyingQuestions.length > 0) {
        setCurrentStep("clarify");
        return;
      }

      setResult(nextResult);
      setCurrentStep("results");
    } finally {
      window.clearInterval(timer);
      setLoadingStage(analyzeStages.length - 1);
    }
  }

  async function importGithubIssue() {
    if (!githubUrl.trim()) return;
    setImportNote("Importing GitHub issue...");

    try {
      const response = await fetch("/api/import/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: githubUrl })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);

      setTicket(payload.importedText);
      setImportNote(`Imported "${payload.title}" from GitHub.`);
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : "GitHub import failed.");
    }
  }

  function importPlaceholder(name: string) {
    setImportNote(`${name} import is connector-ready. Paste task text or use GitHub for live import.`);
  }

  async function saveCurrentResult() {
    if (!result) return;
    await saveResult(result);
    setSaved(true);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f7] px-4 py-6 text-[#0f1720] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-black tracking-normal sm:text-5xl">
            EstiMate AI - From Task to Actionable Plan in Seconds
          </h1>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
          <div className="grid gap-3 lg:grid-cols-[250px_1fr]">
            <aside className="rounded-lg bg-[#06131a] p-4 text-white">
              <div className="mb-5 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-300" />
                <span className="font-black text-emerald-300">EstiMate AI</span>
              </div>
              <StepRail currentStep={currentStep} />
              <div className="mt-6 rounded-lg border border-white/8 bg-white/5 p-3">
                <p className="text-xs font-bold text-white/70">Planning engine</p>
                <p className="mt-2 text-xs leading-5 text-white/50">
                  The app uses AI for structure and explanation, while hour ranges come from a
                  deterministic scoring engine.
                </p>
              </div>
            </aside>

            <section className="min-h-[620px] rounded-lg bg-[#06131a] p-4 text-white sm:p-6">
              <TopProgress currentStep={currentStep} />

              {currentStep === "input" && (
                <InputScreen
                  ticket={ticket}
                  setTicket={setTicket}
                  githubUrl={githubUrl}
                  setGithubUrl={setGithubUrl}
                  importNote={importNote}
                  importGithubIssue={importGithubIssue}
                  importPlaceholder={importPlaceholder}
                  onAnalyze={() => requestAnalysis("clarify")}
                />
              )}

              {currentStep === "clarify" && (
                <ClarifyScreen
                  questions={draftResult?.clarifyingQuestions ?? []}
                  answers={answers}
                  setAnswers={setAnswers}
                  onBack={() => setCurrentStep("input")}
                  onContinue={() => requestAnalysis("results")}
                />
              )}

              {currentStep === "analyze" && <AnalyzeScreen loadingStage={loadingStage} />}

              {currentStep === "results" && result && (
                <ResultsScreen
                  result={result}
                  chartData={metricChart}
                  onSave={saveCurrentResult}
                  saved={saved}
                  onPlan={() => setCurrentStep("plan")}
                  onBack={() => setCurrentStep("clarify")}
                />
              )}

              {currentStep === "plan" && result && (
                <PlanScreen
                  result={result}
                  onBack={() => setCurrentStep("results")}
                  onOptimize={() => setCurrentStep("optimize")}
                />
              )}

              {currentStep === "optimize" && result && (
                <OptimizeScreen result={result} onBack={() => setCurrentStep("plan")} />
              )}
            </section>
          </div>
        </section>

        <FlowBar />
      </div>
    </main>
  );
}

function StepRail({ currentStep }: { currentStep: PageStep }) {
  const activeIndex = stepNumber(currentStep);

  return (
    <div className="space-y-2">
      {productSteps.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;

        return (
          <div
            key={step.id}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold text-white/45",
              active && "bg-emerald-400/12 text-emerald-200",
              done && "text-white/76"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-xs",
                active && "border-emerald-300 bg-emerald-300 text-[#06131a]",
                done && "border-emerald-300/50 bg-emerald-300/18 text-emerald-200"
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            {step.label}
          </div>
        );
      })}
    </div>
  );
}

function TopProgress({ currentStep }: { currentStep: PageStep }) {
  const current = stepNumber(currentStep);

  return (
    <div className="mb-8 grid grid-cols-6 gap-2">
      {productSteps.map((step, index) => (
        <div key={step.id}>
          <div
            className={cn(
              "h-0.5 rounded-full bg-white/12",
              index <= current && "bg-emerald-300"
            )}
          />
          <div
            className={cn(
              "mt-2 hidden text-center text-[11px] font-bold text-white/36 sm:block",
              index === current && "text-emerald-200"
            )}
          >
            {step.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function InputScreen({
  ticket,
  setTicket,
  githubUrl,
  setGithubUrl,
  importNote,
  importGithubIssue,
  importPlaceholder,
  onAnalyze
}: {
  ticket: string;
  setTicket: (value: string) => void;
  githubUrl: string;
  setGithubUrl: (value: string) => void;
  importNote: string;
  importGithubIssue: () => void;
  importPlaceholder: (name: string) => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
      <Badge tone="teal" className="border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
        Workflow-first estimation
      </Badge>
      <h2 className="mt-5 max-w-2xl text-4xl font-black leading-tight tracking-normal sm:text-5xl">
        Estimate software work for the AI era
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-white/58">
        Paste a task, import context, answer the questions that matter, and turn vague work into a
        scoped estimate and execution plan.
      </p>

      <Textarea
        value={ticket}
        onChange={(event) => setTicket(event.target.value)}
        className="mt-6 min-h-[140px] max-w-2xl border-white/16 bg-[#0c1b24] text-left text-white placeholder:text-white/35"
        placeholder="Paste a Jira, Linear, GitHub, Slack, or manual task..."
      />

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {demoTasks.map((task) => (
          <button
            key={task.id}
            className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/70 transition hover:border-emerald-300/40 hover:text-emerald-200"
            onClick={() => setTicket(task.ticket)}
          >
            {task.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid w-full max-w-2xl gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          value={githubUrl}
          onChange={(event) => setGithubUrl(event.target.value)}
          className="border-white/16 bg-[#0c1b24] text-white placeholder:text-white/35"
          placeholder="Optional live GitHub issue URL"
        />
        <Button variant="secondary" onClick={importGithubIssue}>
          <Github className="h-4 w-4" />
          Import GitHub
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <ImportButton label="Jira" icon={Layers3} onClick={() => importPlaceholder("Jira")} />
        <ImportButton label="Linear" icon={Workflow} onClick={() => importPlaceholder("Linear")} />
        <ImportButton label="Slack" icon={MessageSquare} onClick={() => importPlaceholder("Slack")} />
        <ImportButton label="GitHub" icon={Github} onClick={importGithubIssue} />
      </div>

      {importNote && <p className="mt-3 text-xs text-white/50">{importNote}</p>}

      <Button size="lg" className="mt-6 min-w-52" onClick={onAnalyze}>
        Analyze task <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ImportButton({
  label,
  icon: Icon,
  onClick
}: {
  label: string;
  icon: typeof Github;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/5 px-3 py-2 text-xs font-bold text-white/65 transition hover:border-emerald-300/40 hover:text-emerald-200"
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
  onBack,
  onContinue
}: {
  questions: string[];
  answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onBack: () => void;
  onContinue: () => void;
}) {
  const visibleQuestions = questions.length
    ? questions.slice(0, 4)
    : [
        "What acceptance criteria would make this task unquestionably done?",
        "Which systems, people, or APIs can block implementation?"
      ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="text-center">
        <h2 className="text-3xl font-black tracking-normal">A few quick questions</h2>
        <p className="mt-2 text-sm text-white/55">
          Clarify the parts that influence complexity, dependencies, review load, and confidence.
        </p>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {visibleQuestions.map((question) => (
          <ClarifyCard
            key={question}
            question={question}
            value={answers[question] ?? ""}
            onChange={(value) => setAnswers((current) => ({ ...current, [question]: value }))}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {optionalFields.map((field) => (
          <label key={field.key} className="rounded-lg border border-white/8 bg-white/5 p-4">
            <span className="text-sm font-black text-white/78">{field.label}</span>
            <Input
              value={answers[field.key] ?? ""}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, [field.key]: event.target.value }))
              }
              className="mt-3 border-white/12 bg-[#0c1b24] text-white placeholder:text-white/35"
              placeholder={field.placeholder}
            />
          </label>
        ))}
      </div>

      <div className="mt-7 flex items-center justify-between">
        <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={onContinue}>
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ClarifyCard({
  question,
  value,
  onChange
}: {
  question: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = ["Yes", "Partial", "No"];

  return (
    <div className="rounded-lg border border-white/8 bg-white/5 p-4">
      <p className="text-sm font-black text-white/82">{question}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option}
            className={cn(
              "rounded-md border border-white/8 bg-[#0c1b24] py-2 text-sm font-bold text-white/62 transition",
              value === option && "border-emerald-300/45 bg-emerald-300/15 text-emerald-200"
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
        className="mt-3 border-white/12 bg-[#0c1b24] text-white placeholder:text-white/35"
        placeholder="Optional details"
      />
    </div>
  );
}

function AnalyzeScreen({ loadingStage }: { loadingStage: number }) {
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 py-10 lg:grid-cols-[1fr_320px]">
      <div>
        <h2 className="text-3xl font-black tracking-normal">Analyzing your task...</h2>
        <p className="mt-2 text-sm text-white/55">
          Each stage advances while the app calls the backend and calculates deterministic ranges.
        </p>

        <div className="mt-8 space-y-5">
          {analyzeStages.map((stage, index) => {
            const done = index <= loadingStage;
            const active = index === loadingStage;

            return (
              <div key={stage} className="flex items-center gap-4">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border border-white/18 text-white/40",
                    done && "border-emerald-300 bg-emerald-300/20 text-emerald-200"
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span className={cn("text-sm font-bold", done ? "text-white" : "text-white/42")}>
                  {stage}
                </span>
                {active && <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-cyan-300/10 bg-cyan-300/5">
        <Brain className="h-40 w-40 text-cyan-300 drop-shadow-[0_0_35px_rgba(34,211,238,0.35)]" />
      </div>
    </div>
  );
}

function ResultsScreen({
  result,
  chartData,
  onSave,
  saved,
  onPlan,
  onBack
}: {
  result: AnalysisResult;
  chartData: { name: string; value: number }[];
  onSave: () => void;
  saved: boolean;
  onPlan: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="teal">{result.profile.task_type}</Badge>
            <Badge tone="green">{result.estimation.confidence_score}% confidence</Badge>
            <Badge tone={result.estimation.delay_risk > 55 ? "rose" : "amber"}>
              {result.estimation.delay_risk}% delay risk
            </Badge>
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-normal">{result.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">{result.managerSummary}</p>
        </div>
        <Button variant="secondary" onClick={onSave}>
          <Save className="h-4 w-4" />
          {saved ? "Saved" : "Save"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Without AI" value={formatHours(result.estimation.without_ai_min_hours, result.estimation.without_ai_max_hours)} />
        <Metric label="With AI" value={formatHours(result.estimation.with_ai_min_hours, result.estimation.with_ai_max_hours)} />
        <Metric label="Time saved" value={`${result.estimation.time_saved_percent}%`} green />
        <Metric label="Confidence" value={`${result.estimation.confidence_score}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel title="Estimate comparison">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.62)", fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.name === "With AI" ? "#34d399" : "#64748b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="AI leverage">
          <div className="rounded-lg bg-white/5 p-4">
            <div className="flex justify-between text-xs font-bold text-white/60">
              <span>{result.profile.ai_leverage} leverage</span>
              <span>{result.estimation.time_saved_percent}% saved</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/12">
              <div
                className="h-2 rounded-full bg-emerald-300"
                style={{ width: `${result.profile.ai_leverage === "high" ? 82 : result.profile.ai_leverage === "medium" ? 58 : 34}%` }}
              />
            </div>
            <p className="mt-4 text-sm leading-6 text-white/58">{result.developerSummary}</p>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListPanel title="Why this estimate" items={result.explanation} icon={ClipboardList} />
        <ListPanel title="Top blockers" items={result.blockers} icon={ShieldAlert} danger />
        <ListPanel title="Top accelerators" items={result.accelerators} icon={Zap} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListPanel title="Optimization summary" items={result.afterOptimization} icon={Workflow} />
        <ListPanel title="Data sources used" items={result.sources.map((source) => `${source.name}: ${source.fields.join(", ")}`)} icon={Database} />
        <ListPanel title="What we considered" items={[
          `Complexity: ${result.profile.complexity}`,
          `Dependencies: ${result.profile.dependencies}`,
          `Review load: ${result.profile.review_load}`,
          `Blocker probability: ${result.profile.blocker_probability}`
        ]} icon={CheckCircle2} />
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={onPlan}>
          Review plan <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
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
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl font-black tracking-normal">Subtasks and execution plan</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">
          The plan is generated from the parsed task structure, clarification answers, risk profile,
          and deterministic estimate.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Panel title="Subtasks">
          <div className="space-y-2">
            {result.subtasks.map((subtask, index) => (
              <div key={subtask.title} className="grid gap-3 rounded-lg bg-white/5 p-3 text-sm md:grid-cols-[28px_1fr_70px_90px_120px] md:items-center">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-300/15 text-xs font-black text-emerald-200">
                  {index + 1}
                </span>
                <div>
                  <p className="font-bold text-white/88">{subtask.title}</p>
                  <p className="mt-1 text-xs text-white/44">{subtask.owner}</p>
                </div>
                <span className="text-white/60">{subtask.estimateHours}</span>
                <span className="text-emerald-200">{subtask.aiHelpfulness}% AI help</span>
                <span className={cn("text-xs font-bold", subtask.criticalPath ? "text-amber-300" : "text-white/48")}>
                  {subtask.criticalPath ? "Critical path" : "Support work"}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Execution order">
            <div className="space-y-3">
              {result.workflow.map((item, index) => (
                <div key={item} className="flex gap-3 text-sm leading-6">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-300/18 text-xs font-black text-emerald-200">
                    {index + 1}
                  </span>
                  <span className="text-white/64">{item}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Parallelizable work">
            <div className="flex flex-wrap gap-2">
              {result.subtasks
                .filter((subtask) => subtask.parallelizable)
                .map((subtask) => (
                  <span key={subtask.title} className="rounded-md bg-emerald-300/12 px-2.5 py-1.5 text-xs font-bold text-emerald-200">
                    {subtask.title}
                  </span>
                ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Timeline">
        <div className="grid gap-3 md:grid-cols-5">
          {["Scope", "Dependencies", "Build", "Review", "Release"].map((item, index) => (
            <div key={item} className="rounded-lg bg-white/5 p-4 text-center">
              <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-emerald-300/18 text-sm font-black text-emerald-200">
                {index + 1}
              </span>
              <p className="mt-3 text-sm font-bold">{item}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="flex justify-between">
        <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={onOptimize}>
          Optimize workflow <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function OptimizeScreen({ result, onBack }: { result: AnalysisResult; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl font-black tracking-normal">Workflow optimization</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">
          EstiMate AI compares the current delivery path with an optimized AI-assisted plan.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Current plan vs optimized plan">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <Metric label="Current plan" value={formatHours(result.estimation.without_ai_min_hours, result.estimation.without_ai_max_hours)} />
            <ArrowRight className="mx-auto h-5 w-5 text-emerald-200" />
            <Metric label="Optimized plan" value={formatHours(result.estimation.with_ai_min_hours, result.estimation.with_ai_max_hours)} green />
          </div>
        </Panel>
        <Panel title="Reduced time estimate">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Saved" value={`${result.estimation.time_saved_percent}%`} green />
            <Metric label="Delay risk" value={`${result.estimation.delay_risk}%`} />
            <Metric label="Confidence" value={`${result.estimation.confidence_score}%`} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListPanel title="Key improvements" items={result.afterOptimization} icon={CheckCircle2} />
        <ListPanel
          title="Suggestions"
          items={[
            "Parallelize dependency mapping, test planning, and documentation.",
            "Use AI for boilerplate, edge-case generation, docs, and manager summaries.",
            "Reserve senior review for critical-path, security, performance, and release risks.",
            "Delegate support tasks once acceptance criteria are locked."
          ]}
          icon={Split}
        />
        <ListPanel title="Blockers to resolve first" items={result.blockers} icon={ShieldAlert} danger />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListPanel title="Before optimization" items={result.beforeOptimization} icon={GitPullRequest} />
        <ListPanel title="After optimization" items={result.afterOptimization} icon={Workflow} />
      </div>

      <Panel title="Data sources used">
        <div className="grid gap-3 md:grid-cols-3">
          {result.sources.slice(0, 6).map((source) => (
            <div key={source.name} className="rounded-lg bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black">{source.name}</span>
                <span className="rounded-md bg-white/8 px-2 py-1 text-[11px] font-bold text-white/52">
                  {source.status}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/48">{source.note}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Button variant="ghost" className="text-white/70 hover:bg-white/10" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
    </div>
  );
}

function Panel({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/5 p-4">
      <h3 className="mb-4 text-sm font-black text-white/80">{title}</h3>
      {children}
    </div>
  );
}

function Metric({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/6 p-4">
      <div className="text-xs font-bold text-white/50">{label}</div>
      <div className={cn("mt-2 text-2xl font-black tracking-normal", green ? "text-emerald-300" : "text-white")}>
        {value}
      </div>
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
  icon: typeof ClipboardList;
  danger?: boolean;
}) {
  return (
    <Panel title={title}>
      <div className="space-y-3">
        {items.slice(0, 5).map((item) => (
          <div key={item} className="flex gap-3 text-sm leading-6 text-white/62">
            <Icon className={cn("mt-1 h-4 w-4 shrink-0", danger ? "text-rose-300" : "text-emerald-300")} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function FlowBar() {
  const items = [
    ["Input Task", FileText],
    ["Answer Questions", ClipboardList],
    ["AI Analysis", Brain],
    ["Get Estimate", BarChart3],
    ["Actionable Plan", Workflow]
  ];

  return (
    <div className="mx-auto mt-8 max-w-5xl rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <div className="grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
        <h2 className="text-2xl font-black tracking-normal">Product Flow</h2>
        <div className="grid gap-4 sm:grid-cols-5">
          {items.map(([label, Icon]) => {
            const TypedIcon = Icon as typeof FileText;
            return (
              <div key={label as string} className="flex items-center gap-3 sm:flex-col sm:text-center">
                <TypedIcon className="h-7 w-7" />
                <span className="text-sm font-bold">{label as string}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
