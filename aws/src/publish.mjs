/* A slow hook can accept a rebuild before its response reaches us. Never retry it automatically. */
export class PublishHookError extends Error {
  constructor(reason, status) {
    super("The publish request failed.");
    this.reason = reason;
    this.status = status;
  }
}

export function createPublisher(hook, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  return async () => {
    const signal = AbortSignal.timeout(timeoutMs);
    let response;
    try {
      response = await fetchImpl(hook, { method: "POST", signal });
    } catch {
      throw new PublishHookError(signal.aborted ? "timeout" : "network");
    }
    if (!response.ok) throw new PublishHookError("http", response.status);
  };
}
