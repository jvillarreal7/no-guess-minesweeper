export interface Difficulty {
  readonly width: number;
  readonly height: number;
  readonly mineCount: number;
}

export const DIFFICULTIES = {
  beginner: { width: 9, height: 9, mineCount: 10 },
  intermediate: { width: 16, height: 16, mineCount: 40 },
  expert: { width: 30, height: 16, mineCount: 99 },
} as const satisfies Record<string, Difficulty>;

export type DifficultyName = keyof typeof DIFFICULTIES;
