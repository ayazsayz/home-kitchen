import { roundMoney } from "./format";

export type DriverCash = { driverId: string; name: string; collected: number; handedOver: number; balance: number };

/**
 * Cash each driver is holding: cash collected on delivered (unpaid-by-card) orders
 * minus what they've already handed over.
 */
export function driverBalances(
  orders: { driver_id: string | null; driver_name: string; total: number | string }[],
  handovers: { driver_id: string; driver_name: string; amount: number | string }[],
): DriverCash[] {
  const m = new Map<string, DriverCash>();
  const get = (id: string, name: string) => {
    const e = m.get(id) ?? { driverId: id, name, collected: 0, handedOver: 0, balance: 0 };
    if (!e.name && name) e.name = name;
    m.set(id, e);
    return e;
  };
  for (const o of orders) if (o.driver_id) get(o.driver_id, o.driver_name).collected += Number(o.total);
  for (const h of handovers) get(h.driver_id, h.driver_name).handedOver += Number(h.amount);
  return [...m.values()]
    .map((e) => ({ ...e, collected: roundMoney(e.collected, 3), handedOver: roundMoney(e.handedOver, 3), balance: roundMoney(e.collected - e.handedOver, 3) }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}
