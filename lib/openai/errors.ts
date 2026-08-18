import "server-only";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "openai";

export const FAILURE_CODES = [
  "openai_auth",
  "openai_permission",
  "openai_rate_limit",
  "openai_timeout",
  "openai_connection",
  "openai_bad_request",
  "openai_server",
  "storage_download",
  "openai_file_upload",
  "openai_response",
  "structured_output",
  "result_persistence",
  "unknown",
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

const USER_MESSAGE_TEMPORARY =
  "Analysis is temporarily unavailable. Please try again.";
const USER_MESSAGE_UNAVAILABLE = "Analysis service is unavailable.";
const USER_MESSAGE_INCOMPLETE =
  "Unable to complete analysis. Please try again.";

/**
 * Server-side processing failure with a machine-readable category.
 * `message` is a concise diagnostic for document_processing_jobs.error_message.
 */
export class ProcessingFailure extends Error {
  readonly failureCode: FailureCode;

  constructor(failureCode: FailureCode, diagnostic: string) {
    super(diagnostic);
    this.name = "ProcessingFailure";
    this.failureCode = failureCode;
  }
}

export function isFailureCode(value: unknown): value is FailureCode {
  return (
    typeof value === "string" &&
    (FAILURE_CODES as readonly string[]).includes(value)
  );
}

export function userMessageForFailureCode(code: FailureCode): string {
  switch (code) {
    case "openai_rate_limit":
    case "openai_timeout":
    case "openai_connection":
    case "openai_server":
      return USER_MESSAGE_TEMPORARY;
    case "openai_auth":
    case "openai_permission":
      return USER_MESSAGE_UNAVAILABLE;
    case "openai_bad_request":
    case "openai_file_upload":
    case "openai_response":
    case "storage_download":
    case "structured_output":
    case "result_persistence":
    case "unknown":
      return USER_MESSAGE_INCOMPLETE;
  }
}

/**
 * Maps an unknown thrown value to a safe failure category and diagnostic.
 * Does not persist provider bodies, stack traces, or document content.
 */
export function classifyProcessingError(error: unknown): {
  failureCode: FailureCode;
  diagnostic: string;
} {
  if (error instanceof ProcessingFailure) {
    return {
      failureCode: error.failureCode,
      diagnostic: error.message,
    };
  }

  if (error instanceof APIConnectionTimeoutError) {
    return {
      failureCode: "openai_timeout",
      diagnostic: "OpenAI request timed out",
    };
  }

  if (error instanceof APIConnectionError) {
    return {
      failureCode: "openai_connection",
      diagnostic: "OpenAI connection failed",
    };
  }

  if (error instanceof AuthenticationError) {
    return {
      failureCode: "openai_auth",
      diagnostic: "OpenAI authentication failed",
    };
  }

  if (error instanceof PermissionDeniedError) {
    return {
      failureCode: "openai_permission",
      diagnostic: "OpenAI permission denied",
    };
  }

  if (error instanceof RateLimitError) {
    return {
      failureCode: "openai_rate_limit",
      diagnostic: "OpenAI rate limit",
    };
  }

  if (
    error instanceof BadRequestError ||
    error instanceof UnprocessableEntityError
  ) {
    return {
      failureCode: "openai_bad_request",
      diagnostic: "OpenAI rejected the request",
    };
  }

  if (error instanceof InternalServerError) {
    return {
      failureCode: "openai_server",
      diagnostic: "OpenAI server error",
    };
  }

  if (error instanceof APIError) {
    const status = error.status;
    if (status === 401) {
      return {
        failureCode: "openai_auth",
        diagnostic: "OpenAI authentication failed",
      };
    }
    if (status === 403) {
      return {
        failureCode: "openai_permission",
        diagnostic: "OpenAI permission denied",
      };
    }
    if (status === 429) {
      return {
        failureCode: "openai_rate_limit",
        diagnostic: "OpenAI rate limit",
      };
    }
    if (status === 400 || status === 422) {
      return {
        failureCode: "openai_bad_request",
        diagnostic: "OpenAI rejected the request",
      };
    }
    if (typeof status === "number" && status >= 500) {
      return {
        failureCode: "openai_server",
        diagnostic: "OpenAI server error",
      };
    }
    return {
      failureCode: "openai_response",
      diagnostic: "OpenAI response failed",
    };
  }

  return {
    failureCode: "unknown",
    diagnostic: "Unexpected processing failure",
  };
}

export function requestIdFromError(error: unknown): string | null {
  if (error && typeof error === "object" && "requestID" in error) {
    const value = (error as { requestID?: unknown }).requestID;
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}
