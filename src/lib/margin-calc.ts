/** GP / sell-margin math — no imports from db-defaults or route-materials */

export const DEFAULT_HAUL_GP_PERCENT = 10;
export const DEFAULT_MATERIAL_GP_PERCENT = 15;

export function materialGpPercent(buyPerUnit: number, sellPerUnit: number): number {
  if (sellPerUnit <= 0) return DEFAULT_MATERIAL_GP_PERCENT;
  return Math.round(((sellPerUnit - buyPerUnit) / sellPerUnit) * 1000) / 10;
}

export function materialSellFromBuyGp(buyPerUnit: number, gpPercent: number): number {
  if (gpPercent >= 100) return buyPerUnit;
  return Math.round((buyPerUnit / (1 - gpPercent / 100)) * 100) / 100;
}

export function netHaulBuyRate(buyPerUnit: number, brokerFeePercent: number): number {
  return buyPerUnit * (1 - brokerFeePercent / 100);
}

export function haulGpPercent(
  buyPerUnit: number,
  sellPerUnit: number,
  brokerFeePercent: number
): number {
  if (sellPerUnit <= 0) return DEFAULT_HAUL_GP_PERCENT;
  const net = netHaulBuyRate(buyPerUnit, brokerFeePercent);
  return Math.round(((sellPerUnit - net) / sellPerUnit) * 1000) / 10;
}

export function haulSellFromBuyGp(
  buyPerUnit: number,
  brokerFeePercent: number,
  gpPercent: number
): number {
  const net = netHaulBuyRate(buyPerUnit, brokerFeePercent);
  if (gpPercent >= 100) return net;
  return Math.round((net / (1 - gpPercent / 100)) * 100) / 100;
}
