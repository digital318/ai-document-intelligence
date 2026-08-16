import { ConfidenceBadge } from "./confidence-badge";
import { formatFieldLabel, getConfidenceLevel } from "@/lib/format";

interface ParsedField {
  fieldName: string;
  label: string;
  value: string;
  missing: boolean;
  confidence: number | null;
  originalIndex: number;
}

function toConfidenceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function displayStoredValue(value: unknown): { text: string; missing: boolean } {
  if (value == null) return { text: "Not detected", missing: true };
  if (typeof value === "string") {
    if (value.trim() === "") return { text: "Not detected", missing: true };
    return { text: value, missing: false };
  }
  return { text: "Not detected", missing: true };
}

function parseExtractedFields(value: unknown): ParsedField[] {
  if (!Array.isArray(value)) return [];

  const fields: ParsedField[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.field_name !== "string") continue;
    const fieldName = record.field_name.trim();
    if (!fieldName) continue;

    const displayed = displayStoredValue(record.value);
    fields.push({
      fieldName,
      label: formatFieldLabel(fieldName),
      value: displayed.text,
      missing: displayed.missing,
      confidence: toConfidenceNumber(record.confidence),
      originalIndex: index,
    });
  }

  return fields.sort((a, b) => {
    if (a.missing !== b.missing) return a.missing ? 1 : -1;
    const labelCompare = a.label.localeCompare(b.label, "en", {
      sensitivity: "base",
    });
    if (labelCompare !== 0) return labelCompare;
    return a.originalIndex - b.originalIndex;
  });
}

export function ExtractedFields({ fields }: { fields: unknown }) {
  const items = parseExtractedFields(fields);

  return (
    <section
      aria-labelledby="extracted-fields-heading"
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3
          id="extracted-fields-heading"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Extracted fields
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Values are shown exactly as extracted. Missing fields are marked
          rather than invented.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-8 text-sm text-zinc-500 dark:text-zinc-400">
          No structured fields were extracted from this document.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {items.map((field) => {
            const level = getConfidenceLevel(field.confidence);
            const isLow = level === "low";

            return (
              <li
                key={`${field.fieldName}-${field.originalIndex}`}
                className={`px-5 py-4 ${
                  isLow
                    ? "border-l-2 border-l-red-400 bg-red-50/60 dark:border-l-red-500 dark:bg-red-500/5"
                    : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {field.label}
                  </p>
                  <ConfidenceBadge score={field.confidence} />
                </div>
                <p
                  className={`mt-1.5 text-sm break-words whitespace-pre-wrap ${
                    field.missing
                      ? "text-zinc-400 italic dark:text-zinc-500"
                      : "text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {field.value}
                </p>
                {isLow ? (
                  <p className="mt-1.5 text-xs text-red-700 dark:text-red-400">
                    Low confidence — review this value before relying on it.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
