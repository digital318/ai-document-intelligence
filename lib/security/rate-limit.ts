import "server-only";

import { NextResponse } from "next/server";
import { logServerEvent, readErrorCode } from "@/lib/observability/log";
import { RATE_LIMIT_HTTP_MESSAGE } from "@/lib/security/rate-limit-messages";
import { createClient } from "@/lib/supabase/server";

export const AI_RATE_LIMIT_ACTIONS = [
  "document_analysis",
  "document_index",
  "semantic_search",
  "document_qa",
] as const;

export type AiRateLimitAction = (typeof AI_RATE_LIMIT_ACTIONS)[number];

export type AiRateLimitResult =
  | {
      ok: true;
      allowed: true;
      remaining: number;
      resetAt: Date;
    }
  | {
      ok: true;
      allowed: false;
      remaining: number;
      resetAt: Date;
    }
  | { ok: false };

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

interface ConsumeRateLimitRow {
  allowed: unknown;
  remaining: unknown;
  reset_at: unknown;
}

function isRateLimitAction(value: string): value is AiRateLimitAction {
  return (AI_RATE_LIMIT_ACTIONS as readonly string[]).includes(value);
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function readInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

function readTimestamp(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function normalizeRow(value: unknown): ConsumeRateLimitRow | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? normalizeRow(value[0]) : null;
  }
  if (!value || typeof value !== "object") return null;
  return value as ConsumeRateLimitRow;
}

function retryAfterSeconds(resetAt: Date): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
}

/**
 * HTTP 429 with a generic message. Optionally includes Retry-After.
 * Does not include remaining counts, SQL, or another user's usage.
 */
export function rateLimitedResponse(resetAt?: Date): NextResponse {
  const headers = new Headers();
  if (resetAt) {
    headers.set("Retry-After", String(retryAfterSeconds(resetAt)));
  }
  return NextResponse.json(
    { error: RATE_LIMIT_HTTP_MESSAGE },
    { status: 429, headers },
  );
}

/**
 * Atomically consumes one request from the current user's hourly window.
 *
 * Identity comes from the authenticated Supabase session (auth.uid() in
 * Postgres). The browser must not send user id, numeric limits, or
 * action-specific quotas.
 */
export async function consumeAiRateLimit(
  supabase: ServerSupabase,
  action: AiRateLimitAction,
): Promise<AiRateLimitResult> {
  if (!isRateLimitAction(action)) {
    logServerEvent("rate-limit", "error", "Unknown action rejected", {
      category: "invalid_action",
    });
    return { ok: false };
  }

  const { data, error } = await supabase.rpc("consume_ai_rate_limit", {
    p_action: action,
  });

  if (error) {
    logServerEvent("rate-limit", "error", "Rate limit RPC failed", {
      action,
      category: "rpc",
      code: readErrorCode(error),
    });
    return { ok: false };
  }

  const row = normalizeRow(data);
  if (!row) {
    logServerEvent("rate-limit", "error", "Rate limit RPC returned no row", {
      action,
      category: "rpc",
    });
    return { ok: false };
  }

  const allowed = readBoolean(row.allowed);
  const remaining = readInt(row.remaining);
  const resetAt = readTimestamp(row.reset_at);

  if (allowed == null || remaining == null || !resetAt) {
    logServerEvent("rate-limit", "error", "Rate limit RPC returned invalid row", {
      action,
      category: "rpc",
    });
    return { ok: false };
  }

  if (!allowed) {
    return {
      ok: true,
      allowed: false,
      remaining: Math.max(0, remaining),
      resetAt,
    };
  }

  return {
    ok: true,
    allowed: true,
    remaining: Math.max(0, remaining),
    resetAt,
  };
}
