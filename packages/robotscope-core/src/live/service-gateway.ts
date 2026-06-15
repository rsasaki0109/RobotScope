/** Permission-gated live service calls (v1.1 alpha). */

export const DEFAULT_TRIGGER_SERVICE = "/robotscope/demo/trigger";
export const STD_SRVS_TRIGGER_SCHEMA = "std_srvs/srv/Trigger";
export const STD_SRVS_SETBOOL_SCHEMA = "std_srvs/srv/SetBool";

export interface LiveServiceCallRequest {
  service: string;
  schema: string;
  /** Agent sends an empty Trigger request when true. */
  trigger?: boolean;
  /** SetBool request data value. */
  data?: boolean;
}

export interface LiveServiceCallResult {
  ok: boolean;
  service?: string;
  message: string;
  success?: boolean;
}

export function buildTriggerServiceCallRequest(
  service: string = DEFAULT_TRIGGER_SERVICE,
): LiveServiceCallRequest {
  return {
    service,
    schema: STD_SRVS_TRIGGER_SCHEMA,
    trigger: true,
  };
}

export function buildSetBoolServiceCallRequest(
  service: string,
  value: boolean,
): LiveServiceCallRequest {
  return {
    service,
    schema: STD_SRVS_SETBOOL_SCHEMA,
    data: value,
  };
}
