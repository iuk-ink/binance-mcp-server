/**
 * 风险分析层 — 纯函数计算
 *
 * 夏普 / 索提诺 / 最大回撤 / VaR / CVaR。
 * 输入收益率或净值序列，不触网、可离线单测。
 * 全显式参数（无默认值），口径零隐藏：夏普为年化（周期夏普 × √periodPerYear），
 * maxDrawdown 为负小数，VaR 为历史模拟法分位。
 *
 * 错误消息不带工具名前缀：MCP 工厂统一以 `[工具名]` 前缀包装异常。
 *
 * @module analysis/risk
 */

/**
 * 计算夏普比率与索提诺比率（全显式参数，无默认值）
 *
 * 四个返回值统一年化口径：夏普 = 周期夏普 × √periodPerYear（收益率 iid 假设
 * 下的标准做法）；索提诺分母为年化下方偏差，分子为年化超额收益。
 *
 * @param returns       - 收益率序列（小数，如 0.01 = 1%）
 * @param riskFreeRate  - 单周期无风险利率（小数，与收益率同口径）
 * @param periodPerYear - 年化换算系数（每年 K 线根数，如 1h → 8760）
 * @returns 年化收益 / 年化波动 / 夏普 / 索提诺（无波动时夏普与索提诺兜底 0）
 */
export function sharpe(
  returns: number[],
  riskFreeRate: number,
  periodPerYear: number,
): {
  annualReturn: number;
  annualVolatility: number;
  sharpe: number;
  sortino: number;
} {
  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const annualReturn = mean * periodPerYear;
  // 总体方差（除 n），与工具层年化口径一致
  const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / n;
  // 下方偏差：仅相对无风险利率的亏损样本计入
  const downside = returns.reduce((acc, r) => acc + Math.min(r - riskFreeRate, 0) ** 2, 0) / n;
  const standardDeviation = Math.sqrt(variance);
  const annualVolatility = Math.sqrt(variance * periodPerYear);
  const downsideDeviation = Math.sqrt(downside * periodPerYear);

  return {
    annualReturn,
    annualVolatility,
    // 周期夏普 × √N 年化；无波动（标准差为 0）时无意义，返回 0 而非抛错
    sharpe:
      standardDeviation > 0
        ? ((mean - riskFreeRate) / standardDeviation) * Math.sqrt(periodPerYear)
        : 0,
    // 分子同样年化：(mean − rf) × N；下方偏差为 0 时无意义，返回 0 而非无穷
    sortino:
      downsideDeviation > 0
        ? ((mean - riskFreeRate) * periodPerYear) / downsideDeviation
        : 0,
  };
}

/**
 * 计算最大回撤（含峰、谷位置）
 *
 * maxDrawdown 为负小数（-0.15 表示回撤 15%）；空序列返回全 0（不抛错）。
 *
 * @param values - 净值序列
 * @returns 最大回撤与峰谷上下文
 */
export function maxDrawdown(values: number[]): {
  maxDrawdown: number;
  peak: number;
  trough: number;
} {
  let peak = values[0] ?? 0;
  let trough = values[0] ?? 0;
  let maxDd = 0;
  for (const v of values) {
    // 峰值刷新时谷值同步重置为当前值（先涨后跌再涨形态正确）
    if (v > peak) {
      peak = v;
      trough = v;
    }
    if (v < trough) trough = v;
    const dd = peak > 0 ? (trough - peak) / peak : 0;
    if (dd < maxDd) maxDd = dd;
  }
  return {
    maxDrawdown: maxDd,
    peak,
    trough,
  };
}

/**
 * 计算 VaR 与 CVaR（历史模拟法）
 *
 * VaR 为收益序列在置信度下的分位损失；CVaR 为损失超过 VaR 条件的平均损失
 * （数值上 cvar ≤ var，即更差）。结果为负值表示损失；全正收益序列返回
 * 正值（无损失），属合法输出。
 *
 * @param returns    - 收益率序列（小数）
 * @param confidence - 置信度（如 0.95），工具层限定 [0.5, 0.99]
 * @returns VaR / CVaR / 置信度
 */
export function valueAtRisk(
  returns: number[],
  confidence: number,
): { var: number; cvar: number; confidence: number } {
  const sorted = [...returns].sort((a, b) => a - b);
  const n = sorted.length;
  // 分位下标：取 (1 - confidence) 分位处（最左侧），clamp 防越界
  const varIndex = Math.min(n - 1, Math.max(0, Math.floor((1 - confidence) * n)));
  const varValue = sorted[varIndex];
  // CVaR：低于等于 VaR 的尾部样本均值
  const tail = sorted.slice(0, varIndex + 1);
  const cvarValue = tail.length > 0 ? tail.reduce((a, b) => a + b, 0) / tail.length : varValue;
  return { var: varValue, cvar: cvarValue, confidence };
}
