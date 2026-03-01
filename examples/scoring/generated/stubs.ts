import type { Score } from "./types.js";

export function combine(a: Score, b: Score): Score {
  return {
    earned: a.earned + b.earned,
    possible: a.possible + b.possible,
  };
}

export function addBonus(s: Score, bonus: number): Score {
  return {
    earned: s.earned + bonus,
    possible: s.possible,
  };
}
