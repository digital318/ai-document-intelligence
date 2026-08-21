"use client";

import Link from "next/link";
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFileSize } from "@/lib/format";
import {
  FILE_INPUT_ACCEPT,
  sanitizeFileName,
  validateFile,
} from "@/features/upload/validation";

type UploadStatus = "idle" | "uploading" | "success";

interface UploadedFileInfo {
  name: string;
  sizeBytes: number;
}

export function DocumentUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectFile = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setSelectedFile(null);
      setErrorMessage(validationError);
      return;
    }
    setErrorMessage(null);
    setSelectedFile(file);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFile(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) selectFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    if (status === "uploading") return;
    const file = event.dataTransfer.files?.[0];
    if (file) selectFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (status !== "uploading") setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
  };

  const handleUpload = async () => {
    if (!selectedFile || status === "uploading") return;

    // Re-validate right before upload in case the File object is stale.
    const validationError = validateFile(selectedFile);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setStatus("uploading");
    setErrorMessage(null);

    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setStatus("idle");
      setErrorMessage("Your session has expired. Please sign in again.");
      return;
    }

    const documentId = crypto.randomUUID();
    const safeFileName = sanitizeFileName(selectedFile.name);
    const storagePath = `${user.id}/${documentId}/${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, selectedFile, {
        contentType: selectedFile.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Document upload to storage failed");
      setStatus("idle");
      setErrorMessage("The upload failed. Please try again.");
      return;
    }

    const { error: insertError } = await supabase.from("documents").insert({
      id: documentId,
      user_id: user.id,
      file_name: selectedFile.name,
      storage_path: storagePath,
      mime_type: selectedFile.type,
      file_size_bytes: selectedFile.size,
      status: "uploaded",
    });

    if (insertError) {
      console.error("Document record insert failed");

      // Best-effort cleanup so the storage object is not orphaned. A cleanup
      // failure is logged but must not mask the original insert failure.
      const { error: removeError } = await supabase.storage
        .from("documents")
        .remove([storagePath]);
      if (removeError) {
        console.error("Cleanup of uploaded storage object failed");
      }

      setStatus("idle");
      setErrorMessage(
        "We couldn't save your document. Please try uploading it again.",
      );
      return;
    }

    setUploadedFile({ name: selectedFile.name, sizeBytes: selectedFile.size });
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setStatus("success");
  };

  const resetForAnotherUpload = () => {
    setUploadedFile(null);
    setErrorMessage(null);
    setStatus("idle");
  };

  if (status === "success" && uploadedFile) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Upload complete
          </h3>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">
              {uploadedFile.name}
            </p>
            <p>{formatFileSize(uploadedFile.sizeBytes)}</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={resetForAnotherUpload}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Upload Another
            </button>
            <Link
              href="/documents"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              View Documents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
          isDragActive
            ? "border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-500/10"
            : "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
        }`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
          <CloudUpload className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Drag and drop a file here
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            or
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={status === "uploading"}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Browse files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_INPUT_ACCEPT}
          onChange={handleInputChange}
          className="hidden"
          aria-label="Choose a file to upload"
        />
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          PDF, JPG, PNG, WebP, DOCX, or TXT &middot; up to 25 MB
        </p>
      </div>

      {/* Validation / upload error */}
      {errorMessage && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-500/10">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
        </div>
      )}

      {/* Selected file */}
      {selectedFile && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {selectedFile.name}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {formatFileSize(selectedFile.size)} &middot; {selectedFile.type}
            </p>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            disabled={status === "uploading"}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Clear selected file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleUpload}
          disabled={!selectedFile || status === "uploading"}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-busy={status === "uploading"}
        >
          {status === "uploading" && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {status === "uploading" ? "Uploading..." : "Upload"}
        </button>
        {selectedFile && status !== "uploading" && (
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
