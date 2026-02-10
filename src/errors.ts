export class LogStitchError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(message: string, status: number, code: string, requestId: string) {
    super(message);
    this.name = 'LogStitchError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  static async fromResponse(res: Response): Promise<LogStitchError> {
    let code = 'unknown_error';
    let message = `HTTP ${res.status}`;
    let requestId = '';

    try {
      const body = (await res.json()) as {
        error?: { code?: string; message?: string };
        request_id?: string;
      };
      if (body.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
      requestId = body.request_id ?? '';
    } catch {
      // body not JSON — use defaults
    }

    return new LogStitchError(message, res.status, code, requestId);
  }
}
