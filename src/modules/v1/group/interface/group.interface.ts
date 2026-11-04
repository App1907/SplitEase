export interface GroupMemberResponse {
  userId: string;
  name: string;
  email: string;
  joinedAt: Date;
}

export interface GroupDetailsResponse {
  id: string;
  name: string;
  createdBy: string;
  memberCount: number;
  members: GroupMemberResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupListItemResponse {
  id: string;
  name: string;
  createdBy: string;
  memberCount: number;
  /** Caller's net balance in this group, paise. Positive = owed to you. */
  myBalance: number;
  createdAt: Date;
  updatedAt: Date;
}
