export type OwnerEventListItem = {
  id: string;
  title: string;
  creatorName: string;
  createdAtIso: string | null;
  participantCount: number;
  status: string;
  joinPassword: string;
  adminPin: string;
};
