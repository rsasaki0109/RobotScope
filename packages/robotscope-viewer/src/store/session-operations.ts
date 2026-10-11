/** A newer source request owns the viewer; older async work must stop updating it. */
export class SessionOperations {
  private controller?: AbortController;

  begin() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    return {
      signal: controller.signal,
      isCurrent: () => this.controller === controller && !controller.signal.aborted,
    };
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
  }
}
