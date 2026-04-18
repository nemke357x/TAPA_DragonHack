import "server-only";

import OpenAI from "openai";

type KeyStatus = {
  present: boolean;
  validShape: boolean;
  masked: string;
  reason?: string;
};

let loggedKeyStatus = false;

function maskKey(key: string | undefined) {
  const trimmed = key?.trim() ?? "";
  if (!trimmed) return "(missing)";

  const prefix = trimmed.slice(0, Math.min(7, trimmed.length));
  const suffix = trimmed.length > 14 ? trimmed.slice(-4) : "";
  return suffix ? `${prefix}...${suffix}` : `${prefix}...`;
}

export function getOpenAIKeyStatus(): KeyStatus {
  const raw = process.env.OPENAI_API_KEY;
  const trimmed = raw?.trim() ?? "";
  const hasOuterQuotes =
    trimmed.startsWith("\"") ||
    trimmed.startsWith("'") ||
    trimmed.endsWith("\"") ||
    trimmed.endsWith("'");

  if (!trimmed) {
    return {
      present: false,
      validShape: false,
      masked: "(missing)",
      reason: "OPENAI_API_KEY is not set on the server."
    };
  }

  if (raw !== trimmed) {
    return {
      present: true,
      validShape: false,
      masked: maskKey(trimmed),
      reason: "OPENAI_API_KEY has leading or trailing whitespace."
    };
  }

  if (hasOuterQuotes) {
    return {
      present: true,
      validShape: false,
      masked: maskKey(trimmed),
      reason: "OPENAI_API_KEY should not include wrapping quotes."
    };
  }

  if (!trimmed.startsWith("sk-")) {
    return {
      present: true,
      validShape: false,
      masked: maskKey(trimmed),
      reason: "OPENAI_API_KEY does not look like an OpenAI secret key."
    };
  }

  return {
    present: true,
    validShape: true,
    masked: maskKey(trimmed)
  };
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export function getOpenAIClient() {
  const status = getOpenAIKeyStatus();

  if (process.env.NODE_ENV !== "production" && !loggedKeyStatus) {
    console.info(
      `[openai] server key present=${status.present} validShape=${status.validShape} masked=${status.masked}`
    );
    loggedKeyStatus = true;
  }

  if (!status.present || !status.validShape) {
    return { client: null, status };
  }

  return {
    client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY!.trim() }),
    status
  };
}

export function describeOpenAIError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      return "OpenAI rejected the API key. Check that OPENAI_API_KEY is valid and restart the server.";
    }

    if (error.status === 429) {
      return "OpenAI rate limit or quota was reached. The app used the fallback response.";
    }

    return `OpenAI API returned ${error.status ?? "an error"}. The app used the fallback response.`;
  }

  if (error instanceof SyntaxError) {
    return "OpenAI returned a malformed response. The app used the fallback response.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "OpenAI request failed. The app used the fallback response.";
}
