import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { configuration } from '../../config/configuration';
import { logger } from '../../logger/logger';
import { type TaskMap, type TaskName, type WorkerRequest, type WorkerResponse } from './worker.types';

export interface RunTaskOptions {
  onProgress?: (progress: number) => void;
  timeoutMs?: number;
}

interface PendingTask {
  taskId: number;
  data: unknown;
  options: RunTaskOptions;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface ActiveTask {
  task: PendingTask;
  timer: NodeJS.Timeout;
}

class WorkerPool {
  private readonly idle: Worker[] = [];
  private readonly workers = new Set<Worker>();
  private readonly active = new Map<Worker, ActiveTask>();
  private readonly queue: PendingTask[] = [];
  private closed = false;

  constructor(
    private readonly name: string,
    private readonly file: string,
    private readonly size: number,
    private readonly defaultTimeoutMs: number,
  ) {}

  submit(task: PendingTask): void {
    if (this.closed) return task.reject(new Error('Worker pool is shut down'));
    this.queue.push(task);
    this.drain();
  }

  async destroy(): Promise<void> {
    this.closed = true;
    for (const task of this.queue.splice(0)) task.reject(new Error('Worker pool is shut down'));
    await Promise.all([...this.workers].map((worker) => worker.terminate()));
    this.workers.clear();
    this.idle.length = 0;
  }

  private drain(): void {
    while (this.queue.length > 0) {
      const worker = this.idle.pop() ?? (this.workers.size < this.size ? this.spawn() : undefined);
      if (!worker) return;
      const task = this.queue.shift();
      if (!task) {
        this.idle.push(worker);
        return;
      }
      this.dispatch(worker, task);
    }
  }

  private dispatch(worker: Worker, task: PendingTask): void {
    const timeoutMs = task.options.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => {
      logger.error(`Worker task ${this.name} timed out after ${timeoutMs}ms`);
      this.fail(worker, new Error(`Worker task ${this.name} timed out`));
      void worker.terminate();
    }, timeoutMs);
    this.active.set(worker, { task, timer });
    const request: WorkerRequest = { taskId: task.taskId, data: task.data };
    worker.postMessage(request);
  }

  private spawn(): Worker {
    // Production runs compiled .js; in dev/tests (tsx, vitest) the worker registers tsx before loading the .ts file.
    const worker = this.file.endsWith('.ts')
      ? new Worker(`require('tsx/cjs'); require(${JSON.stringify(this.file)});`, { eval: true })
      : new Worker(this.file);
    this.workers.add(worker);

    worker.on('message', (message: WorkerResponse) => this.onMessage(worker, message));
    worker.on('error', (error) => {
      logger.error(`Worker ${this.name} crashed`, { error: error.message });
      this.fail(worker, error);
    });
    worker.on('exit', (code) => {
      this.fail(worker, new Error(`Worker ${this.name} exited with code ${code}`));
      this.workers.delete(worker);
      const idleIndex = this.idle.indexOf(worker);
      if (idleIndex >= 0) this.idle.splice(idleIndex, 1);
      if (!this.closed) this.drain();
    });
    return worker;
  }

  private onMessage(worker: Worker, message: WorkerResponse): void {
    const current = this.active.get(worker);
    if (!current || current.task.taskId !== message.taskId) return;

    if (message.type === 'progress') {
      current.task.options.onProgress?.(message.progress);
      return;
    }

    clearTimeout(current.timer);
    this.active.delete(worker);
    if (message.type === 'result') current.task.resolve(message.result);
    else current.task.reject(new Error(message.error));

    if (!this.closed) {
      this.idle.push(worker);
      this.drain();
    }
  }

  private fail(worker: Worker, error: Error): void {
    const current = this.active.get(worker);
    if (!current) return;
    clearTimeout(current.timer);
    this.active.delete(worker);
    current.task.reject(error);
  }
}

/** Workers only receive and return plain data (no DB / Redis access inside a thread). */
export class WorkerThreadService {
  private readonly pools = new Map<TaskName, WorkerPool>();
  private nextTaskId = 1;
  private readonly poolSize: number;

  constructor(
    poolSize: number,
    private readonly defaultTimeoutMs: number,
  ) {
    this.poolSize = Math.max(1, Math.min(poolSize, os.availableParallelism() - 1 || 1));
  }

  runTask<K extends TaskName>(
    name: K,
    data: TaskMap[K]['input'],
    options: RunTaskOptions = {},
  ): Promise<TaskMap[K]['output']> {
    return new Promise<TaskMap[K]['output']>((resolve, reject) => {
      this.getPool(name).submit({
        taskId: this.nextTaskId++,
        data,
        options,
        resolve: (value) => resolve(value as TaskMap[K]['output']),
        reject,
      });
    });
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.pools.values()].map((pool) => pool.destroy()));
    this.pools.clear();
  }

  private getPool(name: TaskName): WorkerPool {
    let pool = this.pools.get(name);
    if (!pool) {
      const extension = path.extname(__filename);
      const file = path.join(__dirname, `${name}.worker${extension}`);
      pool = new WorkerPool(name, file, this.poolSize, this.defaultTimeoutMs);
      this.pools.set(name, pool);
    }
    return pool;
  }
}

export const workerThreadService = new WorkerThreadService(
  configuration.workers.poolSize,
  configuration.workers.taskTimeoutMs,
);
