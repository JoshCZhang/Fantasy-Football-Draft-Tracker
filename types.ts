
export enum Position {
  QB = 'QB',
  RB = 'RB',
  WR = 'WR',
  TE = 'TE',
  K = 'K',
  DST = 'DST',
  ALL = 'ALL'
}

export interface Player {
  id: number;
  rank: number;
  name: string;
  team: string | null; // Team can be null for free agents
  position: Position;
  isDrafted: boolean;
  tags?: string[];
}
