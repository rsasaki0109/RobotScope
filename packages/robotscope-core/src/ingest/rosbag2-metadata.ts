export interface Rosbag2BagMetadata {
  relative_file_paths: string[];
  storage_identifier?: string;
}

function stripYamlQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Minimal parser for rosbag2 `metadata.yaml` (relative_file_paths only). */
export function parseRosbag2MetadataYaml(yaml: string): Rosbag2BagMetadata {
  const relative_file_paths: string[] = [];
  let storage_identifier: string | undefined;
  let inPaths = false;

  for (const line of yaml.split(/\r?\n/)) {
    const storageMatch = line.match(/^\s*storage_identifier:\s*(.+)\s*$/);
    if (storageMatch) {
      storage_identifier = stripYamlQuotes(storageMatch[1]!);
      continue;
    }

    if (/^\s*relative_file_paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }

    if (inPaths) {
      const itemMatch = line.match(/^\s*-\s*(.+)\s*$/);
      if (itemMatch) {
        relative_file_paths.push(stripYamlQuotes(itemMatch[1]!));
        continue;
      }
      if (line.trim() && !/^\s/.test(line)) {
        inPaths = false;
      }
    }
  }

  if (relative_file_paths.length === 0) {
    throw new Error("metadata.yaml: no relative_file_paths found");
  }

  return { relative_file_paths, storage_identifier };
}

export function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? path;
}

export interface Rosbag2FolderFile {
  relativePath: string;
  data: Uint8Array;
}

/** Resolve metadata paths to uploaded folder files (match by basename). */
export function resolveRosbag2FolderFiles(
  metadata: Rosbag2BagMetadata,
  files: Rosbag2FolderFile[],
): Rosbag2FolderFile[] {
  const byBasename = new Map<string, Rosbag2FolderFile>();
  for (const file of files) {
    byBasename.set(basename(file.relativePath).toLowerCase(), file);
  }

  return metadata.relative_file_paths.map((relativePath) => {
    const match = byBasename.get(basename(relativePath).toLowerCase());
    if (!match) {
      throw new Error(`Missing rosbag2 storage file: ${relativePath}`);
    }
    return match;
  });
}
