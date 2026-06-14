/** Permission-gated live action goals (v1.2+) with progress tracking (v1.3) and cancel (v1.4 alpha). */

export const DEFAULT_FIBONACCI_ACTION = "/robotscope/demo/fibonacci";
export const EXAMPLE_FIBONACCI_ACTION_SCHEMA = "example_interfaces/action/Fibonacci";

export type LiveActionOutcomeStatus = "succeeded" | "aborted" | "canceled" | "failed";

export type LiveActionTrackingStatus = "running" | LiveActionOutcomeStatus;

export interface FibonacciActionGoal {
  order: number;
}

export interface LiveActionSendGoalRequest {
  action: string;
  schema: string;
  /** Agent sends Fibonacci goal when set. */
  fibonacci?: FibonacciActionGoal;
}

export interface LiveActionSendGoalResult {
  ok: boolean;
  action?: string;
  message: string;
  goal_accepted?: boolean;
}

export interface LiveActionCancelGoalRequest {
  action: string;
}

export interface LiveActionCancelGoalResult {
  ok: boolean;
  action?: string;
  message: string;
  cancel_accepted?: boolean;
}

export interface LiveActionFeedbackUpdate {
  kind: "feedback";
  action: string;
  sequence: number[];
}

export interface LiveActionOutcomeUpdate {
  kind: "outcome";
  action: string;
  ok: boolean;
  status: LiveActionOutcomeStatus;
  sequence: number[];
  message?: string;
}

export type LiveActionProgressUpdate = LiveActionFeedbackUpdate | LiveActionOutcomeUpdate;

export interface LiveActionTrackingState {
  action: string;
  status: LiveActionTrackingStatus;
  sequence: number[];
  message?: string;
}

function assertFiniteOrder(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("order must be a finite number");
  }
  if (value < 0) {
    throw new Error("order must be non-negative");
  }
  return Math.trunc(value);
}

export function buildFibonacciActionGoalRequest(
  order: number,
  action: string = DEFAULT_FIBONACCI_ACTION,
): LiveActionSendGoalRequest {
  return {
    action,
    schema: EXAMPLE_FIBONACCI_ACTION_SCHEMA,
    fibonacci: {
      order: assertFiniteOrder(order),
    },
  };
}

export function buildFibonacciActionCancelRequest(
  action: string = DEFAULT_FIBONACCI_ACTION,
): LiveActionCancelGoalRequest {
  return { action };
}

export function formatFibonacciSequence(sequence: number[]): string {
  if (sequence.length === 0) {
    return "[]";
  }
  return `[${sequence.join(", ")}]`;
}

export function applyLiveActionProgressUpdate(
  _current: LiveActionTrackingState | null,
  update: LiveActionProgressUpdate,
): LiveActionTrackingState {
  if (update.kind === "feedback") {
    return {
      action: update.action,
      status: "running",
      sequence: [...update.sequence],
    };
  }

  return {
    action: update.action,
    status: update.status,
    sequence: [...update.sequence],
    message: update.message,
  };
}
