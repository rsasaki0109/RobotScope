import assert from "node:assert/strict";
import test from "node:test";

import {
  findIncidentBySlug,
  groupRecipeMarkers,
  incidentSlug,
} from "../src/incidents/model.ts";
import { incidentReportMarkdown } from "../src/incidents/report.ts";

const marker = (time_ns, recipe_id = "phantom_obstacle_stop") => ({
  time_ns,
  stack: "autoware",
  recipe_id,
  label: "Phantom obstacle stop suspected",
  description: "Planning stalls after a transient perception object.",
  matched_symptoms: ["trajectory_velocity_zero", "brief_perception_object"],
  highlight_panels: ["autoware.planning", "perception_objects"],
});

test("groups consecutive recipe samples into one incident", () => {
  const incidents = groupRecipeMarkers([
    marker(1_000_000_000),
    { ...marker(1_000_000_000, "nav2_controller_stuck"), stack: "nav2" },
    marker(1_100_000_000),
    { ...marker(1_100_000_000, "nav2_controller_stuck"), stack: "nav2" },
    marker(1_200_000_000),
    marker(2_000_000_000, "localization_drift"),
  ]);

  assert.equal(incidents.length, 3);
  assert.equal(incidents[0].start_ns, 1_000_000_000);
  assert.equal(incidents[0].end_ns, 1_200_000_000);
  assert.equal(incidents[0].sample_count, 3);
  assert.equal(incidents[1].sample_count, 2);
});

test("resolves deep links with hyphens or underscores", () => {
  const incidents = groupRecipeMarkers([marker(1_000_000_000)]);
  assert.equal(incidentSlug("phantom_obstacle_stop"), "phantom-obstacle-stop");
  assert.equal(findIncidentBySlug(incidents, "phantom-obstacle-stop")?.recipe_id, "phantom_obstacle_stop");
  assert.equal(findIncidentBySlug(incidents, "phantom_obstacle_stop")?.recipe_id, "phantom_obstacle_stop");
});

test("exports facts and inference as separate report sections", () => {
  const incident = groupRecipeMarkers([marker(1_400_000_000)])[0];
  const report = incidentReportMarkdown(
    incident,
    {
      marker: incident.marker,
      facts: [{
        label: "Planned trajectory length",
        observed: "0.21 m",
        threshold: "< 0.35 m",
        source: "/planning/trajectory",
        entity_path: "/robot/ego/planning/trajectory",
      }],
      inference: incident.description,
      matched_symptoms: incident.marker.matched_symptoms,
      highlight_panels: incident.marker.highlight_panels,
    },
    { source: "mcap", start_ns: 0 },
  );

  assert.match(report, /## Facts \(observed\)/);
  assert.match(report, /Planned trajectory length/);
  assert.match(report, /## Inference \(heuristic\)/);
  assert.match(report, /not a proven root cause/);
  assert.match(report, /1\.40s–1\.40s \(elapsed\)/);
});
