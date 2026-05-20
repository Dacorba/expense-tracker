export type CategoryKey =
  | "Supermercado"
  | "Restaurante"
  | "Renda"
  | "Transporte"
  | "Saúde"
  | "Lazer"
  | "Vestuário"
  | "Serviços"
  | "Outro";

export const CATEGORIES: { key: CategoryKey; emoji: string }[] = [
  { key: "Supermercado", emoji: "🛒" },
  { key: "Restaurante", emoji: "🍽️" },
  { key: "Renda", emoji: "🏠" },
  { key: "Transporte", emoji: "🚌" },
  { key: "Saúde", emoji: "💊" },
  { key: "Lazer", emoji: "🎉" },
  { key: "Vestuário", emoji: "👕" },
  { key: "Serviços", emoji: "🧾" },
  { key: "Outro", emoji: "✨" },
];

export function categoryEmoji(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.emoji ?? "✨";
}

export function formatEUR(n: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);
}
