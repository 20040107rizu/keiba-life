export const YEN_PER_POINT = 3000;
export const DEFAULT_STABLE_CAP = 10;
export const MAX_STABLE_CAP = 30;
export const expansionPrice = (cap: number) => 5_000_000 + Math.max(0, Math.floor((cap - 10) / 2)) * 3_000_000;
export const gachaPrice = (count: number) => count === 10 ? 27_000_000 : 3_000_000;
export const formatYen = (value: number, compact = false) => {
  if (!compact || Math.abs(value) < 10_000) return value.toLocaleString('ja-JP') + '円';
  const unit = Math.abs(value) >= 100_000_000 ? 100_000_000 : 10_000;
  return (value / unit).toLocaleString('ja-JP', { maximumFractionDigits: unit === 10_000 ? 0 : 1 }) + (unit === 10_000 ? '万円' : '億円');
};
