export interface NetBalance {
  userId: string;
  net: number;
}

export interface Payment {
  from: string;
  to: string;
  amount: number;
}

export interface SimplifyDebtsInput {
  balances: NetBalance[];
}

export interface SimplifyDebtsOutput {
  payments: Payment[];
}

export interface CsvMemberColumn {
  userId: string;
  label: string;
}

export interface CsvLedgerRow {
  date: string;
  description: string;
  paidBy: string;
  amount: number;
  splitType: string;
  shares: Record<string, number>;
}

export interface ExportCsvInput {
  columns: CsvMemberColumn[];
  rows: CsvLedgerRow[];
}

export interface ExportCsvOutput {
  csv: string;
  rowCount: number;
}

export interface TaskMap {
  simplifyDebts: { input: SimplifyDebtsInput; output: SimplifyDebtsOutput };
  exportCsv: { input: ExportCsvInput; output: ExportCsvOutput };
}

export type TaskName = keyof TaskMap;

export interface WorkerRequest {
  taskId: number;
  data: unknown;
}

export type WorkerResponse =
  | { taskId: number; type: 'result'; result: unknown }
  | { taskId: number; type: 'progress'; progress: number }
  | { taskId: number; type: 'error'; error: string };
