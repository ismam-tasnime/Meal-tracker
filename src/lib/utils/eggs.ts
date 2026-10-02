/**
 * Eggs are an extra charge, never a meal: nothing here touches a meal
 * count, a meal rate or a meal's ON/OFF status (0019_egg_tracking.sql).
 */

/** What the price per egg starts at before a mess manager sets one (BDT). */
export const DEFAULT_EGG_PRICE = 15;

/** Most eggs one employee can be charged for on one date; matches 0019. */
export const MAX_EGG_QTY = 100;

/** Highest price per egg the database accepts; matches 0019. */
export const MAX_EGG_PRICE = 10000;

/** Money is stored with 2 decimals, so round before showing or saving. */
export function roundEggAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

/** quantity × price per egg. The database computes the stored total the same way. */
export function eggTotal(qty: number, price: number): number {
  return roundEggAmount(qty * price);
}

/** 0 means "no eggs" (the record is removed); anything above the cap is refused. */
export function isValidEggQty(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 0 && qty <= MAX_EGG_QTY;
}

export function isValidEggPrice(price: number): boolean {
  return Number.isFinite(price) && price >= 0 && price <= MAX_EGG_PRICE;
}

/** One employee's eggs on one date, as the Meal Status page keeps them. */
export type EggEntry = {
  /** Eggs recorded for this date; 0 when there's no record. */
  qty: number;
  /** The price the record was saved with; null when there's no record. */
  price: number | null;
  /** qty × price, straight from the database; 0 when there's no record. */
  total: number;
};

export const NO_EGGS: EggEntry = { qty: 0, price: null, total: 0 };
