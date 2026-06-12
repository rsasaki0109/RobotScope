import initSqlJs, { type Database, type SqlJsStatic } from "sql.js/dist/sql-asm.js";

import type { IngestHandle, SessionInfo, TopicInfo } from "../query.js";
import {
  indexRosbag2FolderMessages,
  indexRosbag2FolderTfOnly,
  indexRosbag2Messages,
  indexRosbag2TfOnly,
  loadRosbag2FolderPayloads,
  loadRosbag2Payloads,
  rosbag2FolderTimeBounds,
  rosbag2TimeBounds,
} from "./rosbag2-indexer.js";
import {
  parseRosbag2MetadataYaml,
  resolveRosbag2FolderFiles,
  type Rosbag2FolderFile,
} from "./rosbag2-metadata.js";
import { Rosbag2QueryEngineImpl } from "./rosbag2-query-engine.js";
import type { McapOpenOptions } from "./mcap.js";
import { TopicTimeIndex } from "../storage/topic-time-index.js";
import { validateSidecarFingerprint } from "../storage/sidecar.js";

let sqlModulePromise: Promise<SqlJsStatic> | null = null;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs();
  }
  return sqlModulePromise;
}

function collectTopics(db: Database): TopicInfo[] {
  const result = db.exec(
    "SELECT name, type, (SELECT COUNT(*) FROM messages WHERE topic_id = topics.id) FROM topics ORDER BY name",
  );
  if (!result.length) {
    return [];
  }

  return result[0]!.values.map((row) => ({
    name: String(row[0]),
    schema: String(row[1]),
    message_count: Number(row[2] ?? 0),
  }));
}

function collectTopicsFromDatabases(databases: Database[]): TopicInfo[] {
  const byName = new Map<string, TopicInfo>();
  for (const db of databases) {
    for (const topic of collectTopics(db)) {
      const existing = byName.get(topic.name);
      if (existing) {
        existing.message_count = (existing.message_count ?? 0) + (topic.message_count ?? 0);
      } else {
        byName.set(topic.name, { ...topic });
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function openDatabases(SQL: SqlJsStatic, buffers: Uint8Array[]): Database[] {
  return buffers.map((buffer) => new SQL.Database(buffer));
}

function closeDatabases(databases: Database[]): void {
  for (const db of databases) {
    db.close();
  }
}

async function buildRosbag2Handle(
  databases: Database[],
  session: SessionInfo,
  options: McapOpenOptions,
  displayName: string,
): Promise<IngestHandle> {
  try {
    options.onProgress?.({
      phase: "indexing",
      percent: 20,
      message: `Indexing ${session.topics.length} topics…`,
    });

    const useCachedSidecar =
      options.sidecar &&
      options.fingerprint &&
      validateSidecarFingerprint(options.sidecar, options.fingerprint) &&
      options.sidecar.recording_source === "rosbag2";

    let indexResult;
    if (useCachedSidecar && options.sidecar) {
      options.onProgress?.({
        phase: "indexing",
        percent: 35,
        message: "Loading rosbag2 sidecar + TF…",
      });
      const topicIndex = TopicTimeIndex.fromSidecarTopics(
        options.sidecar.topics,
        "rosbag2",
      );
      const messagePayloads =
        databases.length === 1
          ? loadRosbag2Payloads(databases[0]!)
          : loadRosbag2FolderPayloads(databases);
      const tfResult =
        databases.length === 1
          ? indexRosbag2TfOnly(databases[0]!, (progress) => {
              options.onProgress?.({
                phase: "indexing",
                percent: Math.min(90, 35 + Math.floor(progress.messages_read / 50)),
                message: `Rosbag2 sidecar · TF ${progress.transforms_added} transforms`,
              });
            })
          : indexRosbag2FolderTfOnly(databases, (progress) => {
              options.onProgress?.({
                phase: "indexing",
                percent: Math.min(90, 35 + Math.floor(progress.messages_read / 50)),
                message: `Rosbag2 sidecar · TF ${progress.transforms_added} transforms`,
              });
            });
      indexResult = {
        tfBuffer: tfResult.tfBuffer,
        topicIndex,
        tf_message_count: tfResult.tf_message_count,
        tf_transform_count: tfResult.tf_transform_count,
        tf_topics: tfResult.tf_topics,
        messagePayloads,
      };
    } else if (databases.length === 1) {
      indexResult = indexRosbag2Messages(databases[0]!, (progress) => {
        options.onProgress?.({
          phase: "indexing",
          percent: Math.min(90, 20 + Math.floor(progress.messages_read / 50)),
          message: `Rosbag2 ${progress.messages_read} msgs · ${progress.topics_indexed} topics · ${progress.transforms_added} TF`,
        });
      });
    } else {
      indexResult = indexRosbag2FolderMessages(databases, (progress) => {
        options.onProgress?.({
          phase: "indexing",
          percent: Math.min(90, 20 + Math.floor(progress.messages_read / 50)),
          message: `Rosbag2 folder ${progress.messages_read} msgs · ${progress.topics_indexed} topics · ${progress.transforms_added} TF`,
        });
      });
    }

    const indexStatus = {
      tf_indexed: indexResult.tf_topics.length > 0,
      tf_message_count: indexResult.tf_message_count,
      tf_transform_count: indexResult.tf_transform_count,
      tf_topics: indexResult.tf_topics,
      sidecar_loaded: Boolean(useCachedSidecar),
      topic_index_messages: indexResult.topicIndex.messageCount,
    };

    const engine = Rosbag2QueryEngineImpl.create(
      databases,
      session,
      indexResult.tfBuffer,
      indexResult.topicIndex,
      indexStatus,
      indexResult.messagePayloads,
      options.fingerprint,
    );

    options.onProgress?.({
      phase: "ready",
      percent: 100,
      message: indexStatus.sidecar_loaded
        ? `Ready (rosbag2 sidecar · ${displayName} · ${indexStatus.topic_index_messages} msgs)`
        : `Ready (rosbag2 · ${displayName} · ${indexStatus.topic_index_messages} msgs)`,
    });

    return {
      engine,
      close: async () => {
        engine.close();
      },
    };
  } catch (error) {
    closeDatabases(databases);
    throw error;
  }
}

export async function openRosbag2(
  data: Uint8Array | ArrayBuffer,
  options: McapOpenOptions = {},
): Promise<IngestHandle> {
  options.onProgress?.({ phase: "opening", percent: 0, message: "Opening rosbag2 SQLite" });

  const SQL = await loadSqlJs();
  const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const databases = openDatabases(SQL, [buffer]);
  const topics = collectTopics(databases[0]!);
  const bounds = rosbag2TimeBounds(databases[0]!);

  const session: SessionInfo = {
    source: "rosbag2",
    start_ns: bounds.start_ns,
    end_ns: bounds.end_ns,
    topics,
  };

  return buildRosbag2Handle(databases, session, options, "sqlite");
}

export async function openRosbag2Folder(
  metadataYaml: string,
  files: Rosbag2FolderFile[],
  options: McapOpenOptions = {},
): Promise<IngestHandle> {
  options.onProgress?.({ phase: "opening", percent: 0, message: "Opening rosbag2 folder bag" });

  const metadata = parseRosbag2MetadataYaml(metadataYaml);
  const resolvedFiles = resolveRosbag2FolderFiles(metadata, files);
  const SQL = await loadSqlJs();
  const databases = openDatabases(
    SQL,
    resolvedFiles.map((file) => file.data),
  );

  const topics = collectTopicsFromDatabases(databases);
  const bounds = rosbag2FolderTimeBounds(databases);
  const bagName =
    resolvedFiles[0]?.relativePath.split("/").filter(Boolean)[0] ??
    metadata.relative_file_paths[0] ??
    "rosbag2";

  const session: SessionInfo = {
    source: "rosbag2",
    start_ns: bounds.start_ns,
    end_ns: bounds.end_ns,
    topics,
  };

  return buildRosbag2Handle(databases, session, options, bagName);
}

export type { Rosbag2FolderFile };
