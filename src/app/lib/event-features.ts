export type EventFeatures = {
  mission: boolean;
  quiz: boolean;
  bingo: boolean;
  roulette: boolean;
};

export const DEFAULT_EVENT_FEATURES: EventFeatures = {
  mission: true,
  quiz: false,
  bingo: false,
  roulette: false,
};

export function resolveEventFeatures(raw: unknown): EventFeatures {
  if (!raw || typeof raw !== "object") return DEFAULT_EVENT_FEATURES;
  const obj = raw as Record<string, unknown>;
  return {
    mission: obj.mission !== false,
    quiz: obj.quiz === true,
    bingo: obj.bingo === true,
    roulette: obj.roulette === true,
  };
}
