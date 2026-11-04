import { type SortOrder } from '../enum/enum';

export interface PaginationQuery<TSort extends string = string> {
  page: number;
  limit: number;
  sortBy: TSort;
  order: SortOrder;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
