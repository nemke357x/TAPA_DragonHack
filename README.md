# TAPA_DragonHack
# EstiMate AI

EstiMate AI is an AI-powered software time cost estimation. It analyzes task descriptions, optional GitHub repository context, clarification answers, and extra notes to generate realistic time ranges, confidence scores, blockers, AI savings, and optimization insights.

## What It Does

- Estimates software work with and without AI assistance
- Imports GitHub repository context
- Uses AI to classify complexity, ambiguity, dependencies, review load, blockers, and output size
- Asks clarifying questions when more context would improve the estimate
- Calculates final effort with deterministic scoring
- Shows confidence, delay risk, blockers, accelerators, and optimization insights
- Saves analysis history for comparison

## How It Works

1. Paste a software task or feature request.
2. Optionally import a GitHub repository.
3. Add extra context or answer clarification questions.
4. EstiMate AI analyzes the scope and repository signals.
5. The app returns a final calculated estimate, confidence score, and planning insights.

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- OpenAI API
- GitHub API
- Supabase-ready persistence
- Recharts

## Why It Matters

Software estimates are often vague, inconsistent, and disconnected from the actual codebase. EstiMate AI makes estimation faster, more explainable, and more grounded by combining task context, repository structure, AI analysis, and deterministic scoring.

## Getting Started

Install dependencies:

```bash
npm install