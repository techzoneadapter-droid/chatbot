export interface PaintEstimateInput {
  area?: number | null;
  coats?: number | null;
  coverage?: number | null;
}

export interface PaintEstimate {
  required_liters: number | null;
  missing: Array<"area" | "coats" | "coverage">;
  label: "ESTIMATE";
}

export function estimatePaintQuantity(input: PaintEstimateInput): PaintEstimate {
  const missing: PaintEstimate["missing"] = [];
  if (!input.area || input.area <= 0) missing.push("area");
  if (!input.coats || input.coats <= 0) missing.push("coats");
  if (!input.coverage || input.coverage <= 0) missing.push("coverage");

  if (missing.length) {
    return { required_liters: null, missing, label: "ESTIMATE" };
  }

  return {
    required_liters: Math.ceil(((input.area as number) * (input.coats as number)) / (input.coverage as number) * 10) / 10,
    missing,
    label: "ESTIMATE"
  };
}

export function parseAreaNumber(area: string | null | undefined) {
  if (!area) return null;
  const match = area.match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : null;
}
