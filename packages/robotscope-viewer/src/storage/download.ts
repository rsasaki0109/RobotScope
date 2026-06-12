export function downloadBytes(data: Uint8Array, filename: string): void {
  const copy = Uint8Array.from(data);
  const blob = new Blob([copy], { type: "application/octet-stream" });
  triggerDownload(blob, filename);
}

export function downloadText(
  content: string,
  filename: string,
  mimeType = "application/json",
): void {
  const blob = new Blob([content], { type: mimeType });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const DOWNLOAD_GAP_MS = 250;

/** Trigger multiple browser downloads without the second being blocked. */
export async function downloadFilesSequential(
  files: Array<{
    content: Uint8Array | string;
    filename: string;
    mimeType?: string;
  }>,
): Promise<void> {
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
    if (typeof file.content === "string") {
      downloadText(file.content, file.filename, file.mimeType);
    } else {
      downloadBytes(file.content, file.filename);
    }
    if (index < files.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_GAP_MS));
    }
  }
}
