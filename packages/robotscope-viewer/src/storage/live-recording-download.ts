import type { LiveRecordingResult } from "@robotscope/core";
import {
  serializeSidecarManifest,
  sidecarDownloadFilenameForMcap,
} from "@robotscope/core";

import { downloadFilesSequential } from "./download";

export async function downloadLiveRecordingBundle(result: LiveRecordingResult): Promise<void> {
  const sidecarFilename = sidecarDownloadFilenameForMcap(result.filename);
  const sidecar = {
    ...result.sidecar,
    fingerprint: {
      name: result.filename,
      size: result.data.byteLength,
    },
  };

  await downloadFilesSequential([
    { content: result.data, filename: result.filename },
    {
      content: serializeSidecarManifest(sidecar),
      filename: sidecarFilename,
      mimeType: "application/json",
    },
  ]);
}

export function findCompanionSidecarFile(files: FileList | File[], mcapFile: File): File | undefined {
  const expectedName = sidecarDownloadFilenameForMcap(mcapFile.name);
  return [...files].find(
    (file) =>
      file !== mcapFile &&
      (file.name === expectedName ||
        (file.name.endsWith(".json") && file.name.includes("robotscope"))),
  );
}
