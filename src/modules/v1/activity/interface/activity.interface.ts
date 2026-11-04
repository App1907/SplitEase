import { type ActivityType } from '../../../../enum/enum';

export interface ActivityResponse {
  id: string;
  type: ActivityType;
  groupId: string;
  actorId: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface RecordedActivity {
  created: boolean;
  summary: string;
  groupName: string;
  names: Map<string, { name: string; email: string; isActive: boolean }>;
}
