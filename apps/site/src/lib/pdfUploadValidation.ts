import { EncryptedPDFError, PDFDocument } from "pdf-lib";

export type PdfValidationResult =
  | { isValid: true }
  | { isValid: false; reason: string };

export const validatePdfBuffer = async (buffer: Buffer): Promise<PdfValidationResult> => {
  if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return { isValid: false, reason: "The file does not have a valid PDF header." };
  }

  try {
    await PDFDocument.load(buffer, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      return { isValid: false, reason: "Encrypted or password-protected PDFs are not supported." };
    }
    return { isValid: false, reason: "The PDF is incomplete or cannot be read." };
  }

  return { isValid: true };
};
