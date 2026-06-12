import initSqlJs, { type Database, type SqlJsStatic } from "sql.js/dist/sql-asm.js";

import type { IngestHandle, SessionInfo, TopicInfo } from "../query.js";
import {
  indexRosbag2Messages,
  rosbag2TimeBounds,
} from "./rosbag2-indexer.js";
import { Rosbag2QueryEngineImpl } from "./rosbag2-query-engine.js";
import type { McapOpenOptions } from "./mcap.js";

let sqlModulePromise: Promise<SqlJsStatic> | null = null;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs();
  }
  return sqlModulePromise;
}

export function isRosbag2Filename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".db3") || lower.endsWith(".sqlite") || lower.endsWith(".sqlite3");
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

export async function openRosbag2(
  data: Uint8Array | ArrayBuffer,
  options: McapOpenOptions = {},
): Promise<IngestHandle> {
  options.onProgress?.({ phase: "opening", percent: 0, message: "Opening rosbag2 SQLite" });

  const SQL = await loadSqlJs();
  const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const db = new SQL.Database(buffer);

  try {
    const topics = collectTopics(db);
    const bounds = rosbag2TimeBounds(db);

    const session: SessionInfo = {
      source: "rosbag2",
      start_ns: bounds.start_ns,
      end_ns: bounds.end_ns,
      topics,
    };

    options.onProgress?.({
      phase: "indexing",
      percent: 20,
      message: `Indexing ${topics.length} topics…`,
    });

    const indexResult = indexRosbag2Messages(db, (progress) => {
      options.onProgress?.({
        phase: "indexing",
        percent: Math.min(90, 20 + Math.floor(progress.messages_read / 50)),
        message: `Rosbag2 ${progress.messages_read} msgs · ${progress.topics_indexed} topics · ${progress.transforms_added} TF`,
      });
    });

    const indexStatus = {
      tf_indexed: indexResult.tf_topics.length > 0,
      tf_message_count: indexResult.tf_message_count,
      tf_transform_count: indexResult.tf_transform_count,
      tf_topics: indexResult.tf_topics,
      sidecar_loaded: false,
      topic_index_messages: indexResult.topicIndex.messageCount,
    };

    const engine = Rosbag2QueryEngineImpl.create(
      db,
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
      message: `Ready (rosbag2 · ${indexStatus.topic_index_messages} msgs)`,
    });

    return {
      engine,
      close: async () => {
        engine.close();
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
