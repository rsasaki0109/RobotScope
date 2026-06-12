import { resolveRightColumn } from "../plugins/registry";
import { EntityInspector } from "./EntityInspector";

export function PluginRightColumn({ layoutId }: { layoutId: string }) {
  const Column = resolveRightColumn(layoutId);
  if (!Column) {
    return <EntityInspector />;
  }
  return <Column />;
}
