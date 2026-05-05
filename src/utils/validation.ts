/**
 * Binance MCP Server v2.0 — 输入校验模块
 *
 * @module utils/validation
 * @description
 * 提供通用的输入参数校验函数，所有 MCP 工具的 handler 都依赖此模块进行前置校验。
 * 校验规则：
 * - 交易对符号: 大写字母+数字，5-20 位
 * - 数量/价格: 必须为正数
 */

/**
 * 校验交易对符号格式是否合法
 *
 * @description
 * Binance 期货交易对格式如 BTCUSDT、ETHUSDT 等，
 * 由大写字母和数字组成，长度 5-20 个字符。
 *
 * @param symbol - 待校验的交易对符号
 * @returns 是否合法
 */
export function isValidSymbol(symbol: string): boolean {
  return /^[A-Z0-9]{5,20}$/.test(symbol);
}

/**
 * 校验交易对符号，不合法时抛出异常
 *
 * @param symbol - 待校验的交易对符号
 * @throws {Error} 符号格式不合法时抛出，提示期望格式
 */
export function validateSymbol(symbol: string): void {
  if (!isValidSymbol(symbol)) {
    throw new Error(`无效的交易对格式: ${symbol}。期望格式如 BTCUSDT`);
  }
}

/**
 * 校验数量是否为合法的正数
 *
 * @param quantity - 待校验的数量字符串
 * @throws {Error} 不是正数时抛出
 */
export function validateQuantity(quantity: string): void {
  const num = parseFloat(quantity);
  if (isNaN(num) || num <= 0) {
    throw new Error(`无效的数量: ${quantity}。必须为正数`);
  }
}

/**
 * 校验价格是否为合法的正数
 *
 * @param price - 待校验的价格字符串
 * @throws {Error} 不是正数时抛出
 */
export function validatePrice(price: string): void {
  const num = parseFloat(price);
  if (isNaN(num) || num <= 0) {
    throw new Error(`无效的价格: ${price}。必须为正数`);
  }
}
