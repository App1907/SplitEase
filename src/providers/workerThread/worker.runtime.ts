import { isMainThread, parentPort } from 'node:worker_threads';
import { type WorkerRequest, type WorkerResponse } from './worker.types';

export type ProgressReporter = (progress: number) => void;

/** No-op on the main thread, so unit tests can import worker modules directly. */
export function exposeWorker<TInput, TOutput>(
  handler: (input: TInput, reportProgress: ProgressReporter) => TOutput,
): void {
  if (isMainThread || !parentPort) return;
  const port = parentPort;
  port.on('message', (request: WorkerRequest) => {
    const send = (response: WorkerResponse): void => port.postMessage(response);
    try {
      const result = handler(request.data as TInput, (progress) =>
        send({ taskId: request.taskId, type: 'progress', progress }),
      );
      send({ taskId: request.taskId, type: 'result', result });
    } catch (error) {
      send({
        taskId: request.taskId,
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
