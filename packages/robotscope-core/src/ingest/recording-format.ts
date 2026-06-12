export function isRosbag2Filename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".db3") || lower.endsWith(".sqlite") || lower.endsWith(".sqlite3");
}

export function isRosbag2MetadataFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "metadata.yaml" || lower.endsWith("/metadata.yaml") || lower.endsWith(".metadata.yaml");
}

export function isMcapFilename(name: string): boolean {
  return name.toLowerCase().endsWith(".mcap");
}
