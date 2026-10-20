export const QLOO_401_MESSAGE =
  "Wrong or missing Qloo key. Hackathon keys go in the X-Api-Key header against https://hackathon.api.qloo.com.";

export const QLOO_403_MESSAGE =
  "Qloo does not support that entity type. Use a type from the hackathon list (artist, person, place, destination, and the rest of the documented ten).";

export class QlooHttpError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, body: string) {
    const snippet = body.replace(/\s+/g, " ").slice(0, 180);
    const helpful =
      status === 401
        ? QLOO_401_MESSAGE
        : status === 403
          ? QLOO_403_MESSAGE
          : `Qloo ${path} failed (${status})${snippet ? `: ${snippet}` : "."}`;
    super(helpful);
    this.name = "QlooHttpError";
    this.status = status;
    this.path = path;
  }
}

export function isAuthOrTypeError(error: unknown): error is QlooHttpError {
  return error instanceof QlooHttpError && (error.status === 401 || error.status === 403);
}
