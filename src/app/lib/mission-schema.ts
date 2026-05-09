export type MissionKind = "checkbox" | "number";

export type MissionFields = {
  id: number;
  order: number;
  title: string;
  description: string;
  type: MissionKind;
  points: number;
  pointPerUnit: number;
  unitLabel: string;
  category: string;
  categoryColor: string;
  isActive: boolean;
};

const LEGACY_SCHEDULE_TYPES = new Set(["daily", "weekly", "event"]);

export function normalizeMissionFromFirestore(
  docId: string,
  data: Record<string, unknown>,
): MissionFields {
  const rawType = data.type;
  let type: MissionKind = "checkbox";
  if (rawType === "number") {
    type = "number";
  } else if (rawType === "checkbox") {
    type = "checkbox";
  } else if (LEGACY_SCHEDULE_TYPES.has(String(rawType))) {
    type = "checkbox";
  }

  const safeId = typeof data.id === "number" ? data.id : Number(docId);
  const id = Number.isFinite(safeId) ? safeId : Date.now();
  const safeOrder = typeof data.order === "number" ? data.order : id;
  const order = Number.isFinite(safeOrder) ? safeOrder : id;

  const isActive =
    typeof data.isActive === "boolean"
      ? data.isActive
      : Boolean(data.visible !== false && data.isActive !== false);

  return {
    id,
    order,
    title: String(data.title ?? "項目"),
    description: String(data.description ?? ""),
    type,
    points: typeof data.points === "number" ? data.points : 0,
    pointPerUnit: typeof data.pointPerUnit === "number" ? data.pointPerUnit : 0,
    unitLabel: String(data.unitLabel ?? ""),
    category: String(data.category ?? ""),
    categoryColor: String(data.categoryColor ?? "custom"),
    isActive,
  };
}

/** 初回シード用（競技・勝敗に依存しない文言） */
export const DEFAULT_MISSIONS_SEED: MissionFields[] = [
  {
    id: 1,
    order: 1,
    title: "はじめましてチャレンジ",
    description: "イベント内で誰か1人にあいさつしよう。",
    type: "checkbox",
    points: 10,
    pointPerUnit: 0,
    unitLabel: "",
    category: "event",
    categoryColor: "event",
    isActive: true,
  },
  {
    id: 2,
    order: 2,
    title: "交流チャレンジ",
    description: "参加者と1回交流しよう。",
    type: "checkbox",
    points: 20,
    pointPerUnit: 0,
    unitLabel: "",
    category: "event",
    categoryColor: "event",
    isActive: true,
  },
  {
    id: 3,
    order: 3,
    title: "ボーナスチャレンジ",
    description: "今日のイベントを最後まで楽しもう。",
    type: "checkbox",
    points: 30,
    pointPerUnit: 0,
    unitLabel: "",
    category: "bonus",
    categoryColor: "bonus",
    isActive: true,
  },
];
