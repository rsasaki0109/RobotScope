/** Pack rosbag2 folder `(file_index, sqlite_row_id)` into one sidecar-safe number. */
const FILE_INDEX_SHIFT = 0x1_0000_0000;

export function encodeRosbag2StorageId(fileIndex: number, messageId: number): number {
  return fileIndex * FILE_INDEX_SHIFT + messageId;
}

export function decodeRosbag2StorageId(encoded: number): { fileIndex: number; messageId: number } {
  return {
    fileIndex: Math.floor(encoded / FILE_INDEX_SHIFT),
    messageId: encoded % FILE_INDEX_SHIFT,
  };
}
