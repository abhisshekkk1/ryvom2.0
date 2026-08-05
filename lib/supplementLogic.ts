export interface SupplementRecommendation {
  id: string;
  name: string;
  dosage: string;
  numericValue?: number;
  numericRange?: [number, number];
  unit: string;
  scalingType: "weight-based" | "fixed";
  note: string;
  timing?: string;
  icon?: string;
}

/**
 * Calculates supplement dosage recommendations based on body mass (in kg).
 * Weight-based formulas:
 * - Creatine Monohydrate: (weightKg * 0.03) g/day
 * - Vitamin D3: (weightKg / 25) * 1000 IU/day
 * - Protein: (weightKg * 1.6) to (weightKg * 2.2) g/day total
 * Fixed clinical dosages:
 * - Omega-3 (Fish Oil): 2,000 - 3,000 mg combined EPA/DHA
 * - Glucosamine & Chondroitin: 1,500 mg / 1,200 mg
 */
export function calculateSupplementDosages(weightKg: number): SupplementRecommendation[] {
  const validWeight = weightKg > 0 ? weightKg : 104;

  const creatineGrams = (validWeight * 0.03).toFixed(1);
  const vitaminD3IU = Math.round((validWeight / 25) * 1000);
  const proteinMin = Math.round(validWeight * 1.6);
  const proteinMax = Math.round(validWeight * 2.2);

  return [
    {
      id: "creatine",
      name: "Creatine Monohydrate",
      dosage: `${creatineGrams} g / day`,
      numericValue: Number(creatineGrams),
      unit: "g",
      scalingType: "weight-based",
      note: "Calculated at 0.03g/kg. A standard 5g scoop is ideal for maintenance.",
      timing: "Daily (Consistent timing)",
      icon: "⚡",
    },
    {
      id: "protein",
      name: "Total Daily Protein",
      dosage: `${proteinMin} - ${proteinMax} g / day`,
      numericRange: [proteinMin, proteinMax],
      unit: "g",
      scalingType: "weight-based",
      note: "Calculated at 1.6g to 2.2g/kg total daily intake for muscle protein synthesis and recovery.",
      timing: "Spread across 3-5 meals daily",
      icon: "🥩",
    },
    {
      id: "vitamin-d3",
      name: "Vitamin D3",
      dosage: `${vitaminD3IU.toLocaleString()} IU / day`,
      numericValue: vitaminD3IU,
      unit: "IU",
      scalingType: "weight-based",
      note: "Calculated at 1,000 IU per 25kg body mass. Supports immunity, bone density, and hormone balance.",
      timing: "Morning with fat-containing meal",
      icon: "☀️",
    },
    {
      id: "omega-3",
      name: "Omega-3 (Fish Oil)",
      dosage: "2,000 - 3,000 mg",
      unit: "mg",
      scalingType: "fixed",
      note: "Fixed clinical dose. Combined EPA/DHA for cardiovascular health, joint mobility, and systemic anti-inflammation.",
      timing: "Daily with food",
      icon: "🐟",
    },
    {
      id: "glucosamine",
      name: "Glucosamine & Chondroitin",
      dosage: "1,500 mg / 1,200 mg",
      unit: "mg",
      scalingType: "fixed",
      note: "Fixed clinical dose. Standard daily dosage to support cartilage integrity, joint hydration, and connective tissue.",
      timing: "Daily with food",
      icon: "🦴",
    },
  ];
}
