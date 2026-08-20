import "server-only";

import { toFile, type OpenAI } from "openai";
import {
  DOCX_MIME_TYPE,
  JPEG_MIME_TYPE,
  PDF_MIME_TYPE,
  PNG_MIME_TYPE,
  TEXT_MIME_TYPE,
  WEBP_MIME_TYPE,
  isSupportedAnalysisMimeType,
  type AnalysisMimeType,
} from "@/lib/documents";
import { getOpenAIClient } from "@/lib/openai/client";
import { logServerEvent, readErrorCode } from "@/lib/observability/log";

const FILE_INPUT_MIME_TYPES = new Set<AnalysisMimeType>([
  PDF_MIME_TYPE,
  DOCX_MIME_TYPE,
  TEXT_MIME_TYPE,
]);

const IMAGE_INPUT_MIME_TYPES = new Set<AnalysisMimeType>([
  JPEG_MIME_TYPE,
  PNG_MIME_TYPE,
  WEBP_MIME_TYPE,
]);

export class DocumentInputError extends Error {
  constructor(diagnostic: string) {
    super(diagnostic);
    this.name = "DocumentInputError";
  }
}

/** File-family content sent to Responses as input_file. */
export type OpenAIFileInputContent = {
  type: "input_file";
  file_id: string;
};

/** Vision-family content sent to Responses as input_image. */
export type OpenAIImageInputContent = {
  type: "input_image";
  file_id: string;
  detail: "original";
};

export type PreparedOpenAIDocumentInput = {
  contentPart: OpenAIFileInputContent | OpenAIImageInputContent;
  openaiFileId: string;
};

export interface PrepareOpenAIDocumentInputParams {
  openai: OpenAI;
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
}

function logInputError(stage: string, error: unknown) {
  const code = readErrorCode(error);
  logServerEvent("documents/process", "error", stage, {
    code,
    category: "openai_file",
  });
}

async function uploadTemporaryOpenAIFile(
  openai: OpenAI,
  bytes: ArrayBuffer,
  fileName: string,
  mimeType: AnalysisMimeType,
  purpose: "user_data" | "vision",
): Promise<string> {
  const uploadable = await toFile(bytes, fileName, { type: mimeType });
  const uploadedFile = await openai.files.create({
    file: uploadable,
    purpose,
  });
  return uploadedFile.id;
}

async function prepareFileInput(
  openai: OpenAI,
  bytes: ArrayBuffer,
  fileName: string,
  mimeType: AnalysisMimeType,
): Promise<PreparedOpenAIDocumentInput> {
  try {
    const openaiFileId = await uploadTemporaryOpenAIFile(
      openai,
      bytes,
      fileName,
      mimeType,
      "user_data",
    );
    return {
      openaiFileId,
      contentPart: {
        type: "input_file",
        file_id: openaiFileId,
      },
    };
  } catch (error) {
    logInputError("OpenAI temporary file upload failed", error);
    throw new DocumentInputError("OpenAI temporary file upload failed");
  }
}

async function prepareImageInput(
  openai: OpenAI,
  bytes: ArrayBuffer,
  fileName: string,
  mimeType: AnalysisMimeType,
): Promise<PreparedOpenAIDocumentInput> {
  try {
    const openaiFileId = await uploadTemporaryOpenAIFile(
      openai,
      bytes,
      fileName,
      mimeType,
      "vision",
    );
    return {
      openaiFileId,
      contentPart: {
        type: "input_image",
        file_id: openaiFileId,
        detail: "original",
      },
    };
  } catch (error) {
    logInputError("OpenAI image input preparation failed", error);
    throw new DocumentInputError("OpenAI image input preparation failed");
  }
}

/**
 * Transforms private Storage bytes into the Responses API content part for
 * the trusted documents.mime_type. Creates a temporary OpenAI file that the
 * caller must clean up.
 */
export async function prepareOpenAIDocumentInput({
  openai,
  bytes,
  fileName,
  mimeType,
}: PrepareOpenAIDocumentInputParams): Promise<PreparedOpenAIDocumentInput> {
  if (!isSupportedAnalysisMimeType(mimeType)) {
    throw new DocumentInputError("Unsupported document type");
  }

  if (IMAGE_INPUT_MIME_TYPES.has(mimeType)) {
    return prepareImageInput(openai, bytes, fileName, mimeType);
  }

  if (FILE_INPUT_MIME_TYPES.has(mimeType)) {
    return prepareFileInput(openai, bytes, fileName, mimeType);
  }

  throw new DocumentInputError("Unsupported document type");
}

/**
 * Best-effort deletion of a temporary OpenAI file. Failures are logged and
 * never thrown, so a successful analysis result is not overwritten.
 */
export async function cleanupTemporaryOpenAIFile(
  fileId: string | null,
): Promise<void> {
  if (!fileId) return;

  try {
    const openai = getOpenAIClient();
    await openai.files.delete(fileId);
  } catch (error) {
    logInputError("OpenAI file cleanup failed", error);
  }
}
