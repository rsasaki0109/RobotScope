import type { Entity } from "./rdm.js";
import type { EntityFilter } from "./query.js";
import { mappedTopicToEntity, type MappedTopic } from "./mapping/entity-mapper.js";

function intersectsAllowed(values: readonly string[] | undefined, allowed: Set<string>): boolean {
  return values?.some((value) => allowed.has(value)) ?? false;
}

/** Apply every populated filter field as an AND constraint. */
export function filterEntities(
  entities: readonly Entity[],
  filter: EntityFilter | undefined,
): Entity[] {
  if (!filter) {
    return [...entities];
  }

  const paths = filter.paths?.length ? new Set(filter.paths) : undefined;
  const kinds = filter.kinds?.length ? new Set(filter.kinds) : undefined;
  const archetypes = filter.archetypes?.length
    ? new Set(filter.archetypes)
    : undefined;
  const tags = filter.tags?.length ? new Set(filter.tags) : undefined;

  return entities.filter((entity) => {
    if (paths && !paths.has(entity.path)) {
      return false;
    }
    if (kinds && !kinds.has(entity.kind)) {
      return false;
    }
    if (archetypes && !intersectsAllowed(entity.tags, archetypes)) {
      return false;
    }
    if (tags && ![...tags].every((tag) => entity.tags?.includes(tag))) {
      return false;
    }
    return true;
  });
}

/** Filter topic metadata before reading and decoding potentially large messages. */
export function filterMappedTopics(
  mappings: readonly MappedTopic[],
  filter: EntityFilter | undefined,
): MappedTopic[] {
  if (!filter) {
    return [...mappings];
  }
  return mappings.filter(
    (mapping) => filterEntities([mappedTopicToEntity(mapping)], filter).length > 0,
  );
}
