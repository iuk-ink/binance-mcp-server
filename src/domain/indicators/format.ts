/**
 * Binance MCP Server — 指标输出格式化
 *
 * @module domain/indicators/format
 * @description
 * 提供指标计算结果的格式化函数，递归截断浮点数精度至 8 位小数，
 * 确保输出结果可读且 LLM 处理高效。
 *
 * @example
 * roundValue(9.9912109375)     → 9.99121094
 * roundValue({ a: 1.123456789, b: [2.987654321] }) → { a: 1.12345679, b: [2.98765432] }
 */

/**
 * 将指标结果中的数值截断到合理精度（8 位小数以内）
 *
 * @description
 * trading-signals 库返回的浮点数可能包含 10+ 位小数（如 9.9912109375），
 * 对交易场景而言精度过高，本函数对对象/数组/数值做递归截断使输出更可读。
 */
export function roundValue(v: unknown): unknown {
  if (typeof v === 'number') {
    // toFixed(8) 输出字符串，+ 号转回 number 同时自动去掉末尾多余的 0
    return +v.toFixed(8);
  }
  if (Array.isArray(v)) {
    return v.map(roundValue);
  }
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = roundValue(val);
    }
    return out;
  }
  return v;
}
