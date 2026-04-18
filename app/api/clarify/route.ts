import { NextResponse } from "next/server";
import OpenAI from "openai";
import { buildClarificationDecision } from "@/lib/scoring";
import { ClarificationDecision, ClarificationQuestion } from "@/lib/types";

function normalizeQuestions(value: unknown): ClarificationQuestion[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<ClarificationQuestion>;
      const question = typeof source.question === "string" ? source.question.trim() : "";
      const type = source.type === "short_text" ? "short_text" : "yes_no";

      if (!question) return null;

      return {
        id:
          typeof source.id === "string" && source.id.trim()
            ? source.id.trim().slice(0, 64)
            : `clarify-${index + 1}`,
        question: question.slice(0, 180),
        type
      };
    })
    .filter(Boolean)
    .slice(0, 5) as ClarificationQuestion[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    ticket?: string;
  };

  const ticket = body.ticket?.trim();
  if (!ticket) {
    return NextResponse.json({ error: "Task text is required." }, { status: 400 });
  }

  const fallback = buildClarificationDecision(ticket);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ decision: fallback, mode: "demo" });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You decide whether a software task needs clarification before estimation. Return JSON only: {\"clarificationNeeded\": boolean, \"questions\": [{\"id\":\"string\",\"question\":\"string\",\"type\":\"yes_no\"|\"short_text\"}], \"reason\":\"string\"}. Ask only questions that materially improve estimate, plan, or optimization quality. Prefer yes_no for quick binary unknowns. Use short_text when details are needed. Return 0 questions if clear enough. Never estimate hours."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: ticket,
            fallbackProfileDecision: fallback
          })
        }
      ]
    });

    const content = completion.choices[0]?.message.content;
    const parsed = content ? JSON.parse(content) : {};
    const questions = normalizeQuestions(parsed.questions);
    const decision: ClarificationDecision = {
      clarificationNeeded: Boolean(parsed.clarificationNeeded) && questions.length > 0,
      questions,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 240) : fallback.reason
    };

    return NextResponse.json({ decision, mode: "live" });
  } catch (error) {
    return NextResponse.json({
      decision: fallback,
      mode: "fallback",
      warning: error instanceof Error ? error.message : "Clarification generation failed."
    });
  }
}
