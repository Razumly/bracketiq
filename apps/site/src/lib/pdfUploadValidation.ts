import { EncryptedPDFError, PDFDocument } from "pdf-lib";

export type PdfValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export const validatePdfBuffer = async (buffer: Buffer): Promise<PdfValidationResult> => {
  if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return { valid: false, reason: "The file does not have a valid PDF header." };
  }

  try {
    await PDFDocument.load(buffer, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      return { valid: false, reason: "Encrypted or password-protected PDFs are not supported." };
    }
    return { valid: false, reason: "The PDF is incomplete or cannot be read." };
  }

  return { valid: true };
};
