import { z } from "zod";

/**
 * One extracted business field. Values must come from the document itself;
 * missing information is omitted rather than invented.
 */
export const extractedFieldSchema = z.object({
  field_name: z
    .string()
    .describe("Concise name of the extracted business field."),
  value: z
    .string()
    .describe(
      "Field value exactly as present in the document, represented as a string.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence that this field value is correct, from 0 to 1."),
});

/**
 * Structured document-analysis result used with OpenAI Structured Outputs.
 *
 * detected_document_type is a free-form string so the model can return a
 * known business type, "other", or a concise descriptive type when uncertain.
 */
export const documentAnalysisSchema = z.object({
  detected_document_type: z
    .string()
    .describe(
      'Document type such as invoice, receipt, insurance document, contract, purchase order, shipping document, bill of lading, packing list, statement, report, identification document, other, or a concise descriptive type when the document does not clearly match a common type.',
    ),
  summary: z
    .string()
    .describe("Concise but useful summary of the document contents."),
  confidence_score: z
    .number()
    .min(0)
    .max(1)
    .describe("Overall confidence in the analysis, from 0 to 1."),
  extracted_fields: z
    .array(extractedFieldSchema)
    .describe(
      "The most important structured business fields that are actually present in the document.",
    ),
});

export type ExtractedField = z.infer<typeof extractedFieldSchema>;
export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;
