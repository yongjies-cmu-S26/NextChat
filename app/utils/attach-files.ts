import { RequestMessage } from "../client/api";

export type AttachFile = { filename: string; file_data: string };

// OpenAI accepts PDFs up to 50 MB per request; keep a safer per-file limit
export const MAX_ATTACH_FILE_BYTES = 20 * 1024 * 1024;

export function getMessageFiles(message: RequestMessage): AttachFile[] {
  if (typeof message.content === "string") return [];
  return message.content
    .filter((p) => p.type === "file" && p.file?.file_data)
    .map((p) => ({
      filename: p.file?.filename ?? "file.pdf",
      file_data: p.file?.file_data ?? "",
    }));
}

export function hasFileParts(content: RequestMessage["content"]) {
  return typeof content !== "string" && content.some((p) => p.type === "file");
}

export function readPdfAsDataUrl(file: File): Promise<AttachFile> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_ATTACH_FILE_BYTES) {
      reject(new Error(`${file.name} 超过 20MB`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let data = String(reader.result ?? "");
      // some browsers report an empty or generic mime type
      data = data.replace(
        /^data:[^;]*;base64,/,
        "data:application/pdf;base64,",
      );
      resolve({ filename: file.name, file_data: data });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
