/**
 * 风险分析层单元测试
 *
 * 覆盖夏普·索提诺（年化口径 / 兜底语义）/ 最大回撤（峰谷 / 符号约定）/
 * VaR·CVaR（分位 / 尾部关系）的边界与取值精度。
 *
 * @module analysis/__tests__/risk
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { maxDrawdown, sharpe, valueAtRisk } from "../risk.js";

/** 按契约公式独立计算周期夏普（总体方差口径），供精度对照 */
function expectedSharpe(returns: number[], riskFreeRate: number, periodPerYear: number): number {
  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  return std > 0 ? ((mean - riskFreeRate) / std) * Math.sqrt(periodPerYear) : 0;
}

describe("夏普·索提诺", () => {
  test("S1 全正收益率时夏普为正、索提诺兜底 0（无下方波动）", () => {
    const r = sharpe([0.01, 0.02, 0.01, 0.03, 0.02], 0, 252);
    assert.ok(r.annualReturn > 0);
    assert.ok(r.annualVolatility > 0);
    assert.ok(r.sharpe > 0);
    // 全部为正收益时下方偏差为 0，索提诺按契约兜底 0
    assert.equal(r.sortino, 0);
  });

  test("S2 含亏损收益率时索提诺为正（下方波动 > 0）", () => {
    const r = sharpe([0.01, -0.02, 0.01, 0.03, -0.01], 0, 252);
    assert.ok(r.sortino > 0);
  });

  test("S3 零收益率时四值全 0", () => {
    const r = sharpe([0, 0, 0, 0], 0, 252);
    assert.equal(r.annualReturn, 0);
    assert.equal(r.annualVolatility, 0);
    assert.equal(r.sharpe, 0);
    assert.equal(r.sortino, 0);
  });

  test("S4 单元素序列不抛错（无方差时夏普兜底 0）", () => {
    const r = sharpe([0.01], 0, 252);
    assert.equal(r.sharpe, 0);
    assert.equal(r.sortino, 0);
  });

  test("S5 夏普为年化口径：等于周期夏普 × √periodPerYear（1e-12）", () => {
    const returns = [0.01, -0.02, 0.01, 0.03, -0.01];
    const periodPerYear = 252;
    const r = sharpe(returns, 0, periodPerYear);
    const expected = expectedSharpe(returns, 0, periodPerYear);
    assert.ok(Math.abs(r.sharpe - expected) < 1e-12, `sharpe=${r.sharpe} expected=${expected}`);
  });

  test("S6 年化倍数缩放：periodPerYear ×4 时夏普 ×2（√4 倍）", () => {
    const returns = [0.01, -0.02, 0.01, 0.03, -0.01];
    const r1 = sharpe(returns, 0, 252);
    const r4 = sharpe(returns, 0, 1008);
    assert.ok(Math.abs(r4.sharpe / r1.sharpe - 2) < 1e-9);
  });

  test("S7 非零无风险利率时夏普与索提诺分子均为年化超额收益（1e-12）", () => {
    const returns = [0.02, -0.01, 0.03, -0.02];
    const riskFreeRate = 0.001;
    const periodPerYear = 252;
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    const downside =
      returns.reduce((acc, r) => acc + Math.min(r - riskFreeRate, 0) ** 2, 0) / n;
    const annualDownsideDeviation = Math.sqrt(downside * periodPerYear);
    const r = sharpe(returns, riskFreeRate, periodPerYear);
    const expectedSharpe = ((mean - riskFreeRate) / std) * Math.sqrt(periodPerYear);
    const expectedSortino = ((mean - riskFreeRate) * periodPerYear) / annualDownsideDeviation;
    assert.ok(Math.abs(r.sharpe - expectedSharpe) < 1e-12);
    assert.ok(Math.abs(r.sortino - expectedSortino) < 1e-12);
  });

  test("S8 波动年化口径：annualVolatility 等于 σ × √N（1e-12）", () => {
    const returns = [0.01, -0.02, 0.01, 0.03, -0.01];
    const periodPerYear = 8760;
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / n;
    const expectedVolatility = Math.sqrt(variance) * Math.sqrt(periodPerYear);
    const r = sharpe(returns, 0, periodPerYear);
    assert.ok(Math.abs(r.annualVolatility - expectedVolatility) < 1e-12);
  });
});

describe("最大回撤", () => {
  test("D1 单调上升净值序列无回撤", () => {
    const r = maxDrawdown([1, 1.1, 1.2, 1.3]);
    assert.equal(r.maxDrawdown, 0);
    assert.equal(r.peak, 1.3);
    assert.equal(r.trough, 1.3);
  });

  test("D2 先涨后跌时回撤为负小数，峰谷正确", () => {
    const r = maxDrawdown([100, 110, 90, 95]);
    // 从峰值 110 跌到谷值 90：-20/110 ≈ -0.1818
    assert.ok(r.maxDrawdown < 0);
    assert.equal(r.peak, 110);
    assert.equal(r.trough, 90);
    assert.ok(Math.abs(r.maxDrawdown - -20 / 110) < 1e-9);
  });

  test("D3 空序列全 0 兜底不抛错", () => {
    const r = maxDrawdown([]);
    assert.equal(r.maxDrawdown, 0);
    assert.equal(r.peak, 0);
    assert.equal(r.trough, 0);
  });
});

describe("VaR · CVaR", () => {
  test("V1 含亏损序列时 VaR 与 CVaR 为负值", () => {
    const r = valueAtRisk([-0.05, -0.03, 0.01, 0.02, -0.01, 0.03], 0.95);
    assert.ok(r.var < 0);
    assert.ok(r.cvar < 0);
    assert.equal(r.confidence, 0.95);
  });

  test("V2 置信度越高 VaR 越严苛（更负）", () => {
    const returns = [-0.1, -0.05, -0.02, 0, 0.01, 0.02, 0.03, 0.05];
    const r90 = valueAtRisk(returns, 0.9);
    const r99 = valueAtRisk(returns, 0.99);
    assert.ok(r99.var <= r90.var);
  });

  test("V3 尾部关系：CVaR 不优于 VaR（cvar ≤ var）", () => {
    const returns = [-0.08, -0.05, -0.02, 0.01, 0.02, 0.03, 0.04, 0.06, 0.07, 0.09];
    const r = valueAtRisk(returns, 0.95);
    assert.ok(r.cvar <= r.var, `cvar=${r.cvar} 应 ≤ var=${r.var}`);
  });
});
