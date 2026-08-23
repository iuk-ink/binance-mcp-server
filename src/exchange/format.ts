/**
 * 币安操作模块 — 精度工具
 *
 * 从 exchangeInfo 过滤器中提取 tickSize / stepSize / minNotional，
 * 并向下取整规整价格与数量，尽量在下单前满足交易所过滤器约束。
 *
 * 规整原则：
 * - 价格向下取整（买价取整避免超价被拒）
 * - 数量向下取整到 stepSize 整数倍，避免超出交易对允许精度
 * - 均使用幂运算而非字符串操作，规避浮点误差
 *
 * @module exchange/format
 */

import { FLOATING_POINT_EPSILON } from "../constants/index.js";

// ============================================================================
//  小数位推导
// ============================================================================

/**
 * 从步进值推导小数位
 *
 * - 普通小数按字符串位数推导（如 `0.01` → 2）
 * - 科学计数法直接取指数（如 `1e-7` → 7）
 *
 * 适用于交易所 tickSize / stepSize（恒为 10 的幂）；
 * 多位尾数的科学计数法（如 `2.5e-8`）指数不等于实际小数位数，不在支持范围。
 * 非有限值或非正数返回 0。
 *
 * @param value - 步进值
 * @returns 小数位数
 */
export function countDecimals(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const str = value.toString();
  // 科学计数法直接取指数（交易所步进恒为 10 的幂，如 "1e-7" → 7）
  const expMatch = str.match(/e-(\d+)/i);
  if (expMatch) return Number(expMatch[1]);
  const dotIndex = str.indexOf(".");
  return dotIndex === -1 ? 0 : str.length - dotIndex - 1;
}

// ============================================================================
//  向下取整
// ============================================================================

/**
 * 将数值向下取整到指定步进的整数倍
 *
 * @example
 * roundDownToStep(1.2345, 0.01)  // => 1.23
 * roundDownToStep(0.1234, 0.001) // => 0.123
 *
 * @param value - 原始值（价格或数量）
 * @param step  - 步进值（tickSize / stepSize），必须为正数
 * @returns 向下取整后的值；step 非法时原值返回
 */
export function roundDownToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return value;
  }
  // 加 epsilon 消除浮点除法误差（如 0.0046 / 0.0001 = 45.9999... → 应为 46）
  const quotient = Math.floor(value / step + FLOATING_POINT_EPSILON);
  // 用乘法恢复时引入小数位误差，再按 step 精度修整
  const raw = quotient * step;
  return Number(raw.toFixed(countDecimals(step)));
}

/**
 * 向下取整价格到 tickSize 整数倍
 *
 * @param price    - 原始价格
 * @param tickSize - 最小价格步进
 * @returns 规整后的价格
 */
export function roundPrice(price: number, tickSize: number): number {
  return roundDownToStep(price, tickSize);
}

/**
 * 向下取整数量到 stepSize 整数倍
 *
 * @param quantity - 原始数量
 * @param stepSize - 最小数量步进
 * @returns 规整后的数量
 */
export function roundQuantity(quantity: number, stepSize: number): number {
  return roundDownToStep(quantity, stepSize);
}

// ============================================================================
//  名义价值校验
// ============================================================================

/**
 * 校验名义价值（price × quantity）是否不低于最小名义价值
 *
 * @param price       - 价格
 * @param quantity    - 数量
 * @param minNotional - 最小名义价值
 * @returns true 表示满足约束
 */
export function isAboveMinNotional(
  price: number,
  quantity: number,
  minNotional: number,
): boolean {
  return price * quantity >= minNotional;
}
