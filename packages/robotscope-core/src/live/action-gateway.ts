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

export type LiveActionEventKind =
  | "goal_sent"
  | "goal_accepted"
  | "goal_rejected"
  | "feedback"
  | "outcome"
  | "cancel_requested"
  | "cancel_result";

export interface LiveActionEvent {
  id: string;
  time_ns: number;
  action: string;
  kind: LiveActionEventKind;
  status?: LiveActionTrackingStatus;
  sequence?: number[];
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

export function appendLiveActionEvent(
  events: LiveActionEvent[],
  event: Omit<LiveActionEvent, "id" | "time_ns"> & { time_ns?: number },
  maxEvents = 32,
): LiveActionEvent[] {
  const next: LiveActionEvent = {
    ...event,
    id: `${event.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time_ns: event.time_ns ?? Date.now() * 1_000_000,
  };
  return [next, ...events].slice(0, maxEvents);
}

export function shouldAppendLiveActionFeedbackEvent(
  events: LiveActionEvent[],
  action: string,
  sequence: number[],
): boolean {
  const latest = events.find((entry) => entry.kind === "feedback" && entry.action === action);
  if (!latest) {
    return true;
  }
  const previous = latest.sequence ?? [];
  if (previous.length !== sequence.length) {
    return true;
  }
  for (let index = 0; index < sequence.length; index += 1) {
    if (previous[index] !== sequence[index]) {
      return true;
    }
  }
  return false;
}
