import { AppError } from '../../../common/errors';
import { MESSAGES } from '../../../common/messages';
import { type UserRepository, userRepository } from '../../../repositories/user.repository';
import { type IUser } from '../../../schemas/user.schema';
import { type UpdateMeDto } from './dto/user.dto';
import { type UserProfileResponse, type UserSearchResponse } from './interface/user.interface';

export class UserService {
  constructor(private readonly users: UserRepository) {}

  private static toProfile(user: IUser): UserProfileResponse {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async getMe(userId: string): Promise<UserProfileResponse> {
    const user = await this.users.findActiveById(userId);
    if (!user) throw AppError.notFound();
    return UserService.toProfile(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<UserProfileResponse> {
    const user = await this.users.updateName(userId, dto.name);
    if (!user) throw AppError.notFound();
    return UserService.toProfile(user);
  }

  /** Exact (case-insensitive) email match only, so the endpoint cannot be used to browse users. */
  async searchByEmail(email: string): Promise<UserSearchResponse> {
    const user = await this.users.findActiveByEmail(email);
    if (!user) throw AppError.notFound(MESSAGES.USER_NOT_FOUND);
    return { id: user._id.toString(), name: user.name, email: user.email };
  }
}

export const userService = new UserService(userRepository);
