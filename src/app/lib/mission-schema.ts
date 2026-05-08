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
    title: "条件付き達成",
    description: "設定された条件を満たしたときにチェックしてください。",
    type: "checkbox",
    points: 15,
    pointPerUnit: 0,
    unitLabel: "",
    category: "battle",
    categoryColor: "battle",
    isActive: true,
  },
  {
    id: 2,
    order: 2,
    title: "特別チャレンジ達成",
    description: "特別な取り組みを完了したときにチェックしてください。",
    type: "checkbox",
    points: 25,
    pointPerUnit: 0,
    unitLabel: "",
    category: "event",
    categoryColor: "event",
    isActive: true,
  },
  {
    id: 3,
    order: 3,
    title: "制限条件を満たして達成",
    description: "決められた制限のもとで条件を満たしたときにチェックしてください。",
    type: "checkbox",
    points: 30,
    pointPerUnit: 0,
    unitLabel: "",
    category: "bonus",
    categoryColor: "bonus",
    isActive: true,
  },
  {
    id: 4,
    order: 4,
    title: "サポート項目を1回以上使用",
    description: "用意されたサポート項目を1回以上使ったらチェックしてください。",
    type: "checkbox",
    points: 10,
    pointPerUnit: 0,
    unitLabel: "",
    category: "habit",
    categoryColor: "habit",
    isActive: true,
  },
  {
    id: 5,
    order: 5,
    title: "特殊条件を満たす",
    description: "指定の特殊条件を満たしたときにチェックしてください。",
    type: "checkbox",
    points: 40,
    pointPerUnit: 0,
    unitLabel: "",
    category: "custom",
    categoryColor: "custom",
    isActive: true,
  },
  {
    id: 6,
    order: 6,
    title: "達成回数",
    description: "カウントしたい達成の回数を入力してください。",
    type: "number",
    points: 0,
    pointPerUnit: 50,
    unitLabel: "",
    category: "habit",
    categoryColor: "habit",
    isActive: true,
  },
];
