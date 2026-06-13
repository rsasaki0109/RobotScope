/** Permission-gated live action goals (v1.2 alpha). */

export const DEFAULT_FIBONACCI_ACTION = "/robotscope/demo/fibonacci";
export const EXAMPLE_FIBONACCI_ACTION_SCHEMA = "example_interfaces/action/Fibonacci";

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
