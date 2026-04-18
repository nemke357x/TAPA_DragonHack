import { NextResponse } from "next/server";
import OpenAI from "openai";
import { buildAnalysis } from "@/lib/scoring";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    ticket?: string;
    answers?: Record<string, string>;
    taskId?: string;
    createdAt?: string;
  };

  const ticket = body.ticket?.trim();
  if (!ticket) {
    return NextResponse.json({ error: "Ticket text is required." }, { status: 400 });
  }

  const fallback = buildAnalysis(ticket, body.answers ?? {}, {
    id: body.taskId,
    created_at: body.createdAt
  });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ result: fallback, mode: "demo" });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You help software teams plan work. Return compact JSON only. Do not estimate hours; the app uses deterministic scoring. Improve summaries, blockers, accelerators, workflow, and subtask guidance based on the given deterministic profile."
        },
        {
          role: "user",
          content: JSON.stringify({
            ticket,
            answers: body.answers ?? {},
            deterministicResult: fallback
          })
        }
      ]
    });

    const content = completion.choices[0]?.message.content;
    const ai = content ? JSON.parse(content) : {};
    const nextWorkflow = Array.isArray(ai.workflow) ? ai.workflow.slice(0, 6) : fallback.workflow;
    const result = {
      ...fallback,
      summary: ai.summary ?? fallback.summary,
      managerSummary: ai.managerSummary ?? fallback.managerSummary,
      developerSummary: ai.developerSummary ?? fallback.developerSummary,
      blockers: Array.isArray(ai.blockers) ? ai.blockers.slice(0, 4) : fallback.blockers,
      accelerators: Array.isArray(ai.accelerators) ? ai.accelerators.slice(0, 4) : fallback.accelerators,
      workflow: nextWorkflow,
      plan: {
        ...fallback.plan,
        execution_order: nextWorkflow
      },
      sources: fallback.sources.map((source) =>
        source.name === "OpenAI"
          ? { ...source, status: "connected" as const, note: "Live OpenAI analysis enhanced this result." }
          : source
      )
    };

    return NextResponse.json({ result, mode: "live" });
  } catch (error) {
    return NextResponse.json({
      result: {
        ...fallback,
        sources: fallback.sources.map((source) =>
          source.name === "OpenAI"
            ? { ...source, status: "demo" as const, note: "OpenAI request failed, demo fallback used." }
            : source
        )
      },
      mode: "fallback",
      warning: error instanceof Error ? error.message : "OpenAI request failed."
    });
  }
}
