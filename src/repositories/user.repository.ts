import { type IUser, UserModel } from '../schemas/user.schema';
import { BaseRepository, type Id } from './base.repository';

export type PublicUser = Pick<IUser, '_id' | 'name' | 'email' | 'isActive'>;

export class UserRepository extends BaseRepository<IUser> {
  constructor() {
    super(UserModel);
  }

  findByEmail(email: string): Promise<IUser | null> {
    return this.model.findOne({ email: email.toLowerCase() }).lean<IUser>().exec();
  }

  findByEmailWithPassword(email: string): Promise<IUser | null> {
    return this.model.findOne({ email: email.toLowerCase() }).select('+passwordHash').lean<IUser>().exec();
  }

  findActiveById(id: Id): Promise<IUser | null> {
    return this.model.findOne({ _id: id, isActive: true }).lean<IUser>().exec();
  }

  findActiveByEmail(email: string): Promise<IUser | null> {
    return this.model.findOne({ email: email.toLowerCase(), isActive: true }).lean<IUser>().exec();
  }

  findByIds(ids: readonly Id[]): Promise<PublicUser[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.model
      .find({ _id: { $in: ids } }, { name: 1, email: 1, isActive: 1 })
      .lean<PublicUser[]>()
      .exec();
  }

  updateName(id: Id, name: string): Promise<IUser | null> {
    return this.findOneAndUpdate({ _id: id, isActive: true }, { $set: { name } });
  }
}

export const userRepository = new UserRepository();
