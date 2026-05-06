/**
 * 将指标结果中的数值截断到合理精度（8 位小数以内）
 *
 * @description
 * trading-signals 库返回的浮点数可能包含 10+ 位小数（如 9.9912109375），
 * 对交易场景而言精度过高，本函数对对象/数组/数值做递归截断使输出更可读。
 */
export function roundValue(v: unknown): unknown {
  if (typeof v === 'number') {
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
