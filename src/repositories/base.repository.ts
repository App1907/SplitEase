import {
  Types,
  type FilterQuery,
  type Model,
  type ProjectionType,
  type QueryOptions,
  type UpdateQuery,
} from 'mongoose';

export type Id = string | Types.ObjectId;

export function toObjectId(id: Id): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

export interface FacetResult<T> {
  items: T[];
  total: { count: number }[];
}

export abstract class BaseRepository<T extends { _id: Types.ObjectId }> {
  protected constructor(protected readonly model: Model<T>) {}

  async create(data: Partial<T>): Promise<T> {
    const document = await this.model.create(data);
    return document.toObject<T>();
  }

  findById(id: Id, projection?: ProjectionType<T>): Promise<T | null> {
    return this.model.findById(id, projection).lean<T>().exec();
  }

  findOne(filter: FilterQuery<T>, projection?: ProjectionType<T>): Promise<T | null> {
    return this.model.findOne(filter, projection).lean<T>().exec();
  }

  find(filter: FilterQuery<T>, projection?: ProjectionType<T>, options?: QueryOptions<T>): Promise<T[]> {
    return this.model.find(filter, projection, options).lean<T[]>().exec();
  }

  count(filter: FilterQuery<T>): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  async exists(filter: FilterQuery<T>): Promise<boolean> {
    return (await this.model.exists(filter).exec()) !== null;
  }

  findOneAndUpdate(filter: FilterQuery<T>, update: UpdateQuery<T>): Promise<T | null> {
    return this.model.findOneAndUpdate(filter, update, { new: true, runValidators: true }).lean<T>().exec();
  }

  async updateOne(filter: FilterQuery<T>, update: UpdateQuery<T>): Promise<number> {
    const result = await this.model.updateOne(filter, update, { runValidators: true }).exec();
    return result.modifiedCount;
  }

  protected static unpackFacet<T>(result: FacetResult<T>[]): { items: T[]; total: number } {
    const first = result[0];
    return { items: first?.items ?? [], total: first?.total[0]?.count ?? 0 };
  }
}
