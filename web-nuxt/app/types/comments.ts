export interface commentAnchor {
  from: string;
  to: string;
}

export interface commentData {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  resolved: boolean;
  anchor: commentAnchor;
}

export interface commentInput {
  text: string;
  anchor: commentAnchor;
}
