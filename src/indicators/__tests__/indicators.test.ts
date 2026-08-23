/**
 * 指标计算层单元测试
 *
 * 覆盖数学正确性 / 契约形状 / 空输入与预热不足边界 / 稳定段长度 / 组合信号。
 * fixture 为模块内自建合成序列，不触网、不依赖 utils 层。
 *
 * @module indicators/__tests__/indicators
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PERCENTB_FALLBACK } from "../../constants/index.js";
import {
  assertStable,
  averageDirectionalIndex,
  averageTrueRange,
  bollingerBands,
  bbRsi,
  commodityChannelIndex,
  divergence,
  exponentialMovingAverage,
  macd,
  maCross,
  moneyFlowIndex,
  onBalanceVolume,
  relativeStrengthIndex,
  simpleMovingAverage,
  stochasticOscillator,
  superTrend,
  volatilityRegime,
  volumeWeightedAveragePrice,
} from "../index.js";

// ============================================================================
//  fixture：合成序列与视图
// ============================================================================

/** 单调上升收盘序列 */
function risingCloses(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 100 + i);
}

/** 震荡收盘序列（有涨有跌，供振荡类指标产出中间值） */
function oscillatingCloses(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 2) * 10);
}

/** 由收盘序列派生 HLC 视图 */
function hlcOf(closes: readonly number[]): { high: number; low: number; close: number }[] {
  return closes.map((c) => ({ high: c + 2, low: c - 2, close: c }));
}

/** 由收盘序列派生 HLCV 视图 */
function hlcvOf(closes: readonly number[]): { high: number; low: number; close: number; volume: number }[] {
  return closes.map((c, i) => ({ high: c + 2, low: c - 2, close: c, volume: 1000 + i }));
}

/** 由收盘序列派生 OHLCV 视图 */
function ohlcvOf(closes: readonly number[]): { open: number; high: number; low: number; close: number; volume: number }[] {
  return closes.map((c, i) => ({ open: c - 1, high: c + 2, low: c - 2, close: c, volume: 1000 + i }));
}

describe("叠加类指标", () => {
  test("SMA 首个稳定值为前 period 个收盘的算术平均", () => {
    const closes = risingCloses(30);
    const result = simpleMovingAverage(closes, 14);
    const expected = closes.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
    assert.equal(result.series[0], expected);
  });

  test("SMA 稳定段长度 = limit − period + 1", () => {
    const result = simpleMovingAverage(risingCloses(30), 14);
    assert.equal(result.series.length, 30 - 14 + 1);
  });

  test("EMA 以首价为种子且每个输入都产出结果", () => {
    const closes = [100, 101, 102, 103, 104];
    const result = exponentialMovingAverage(closes, 3);
    assert.equal(result.series[0], 100, "首个结果应为平滑种子（首价）");
    assert.equal(result.series.length, closes.length, "EMA 自首个输入起逐根产出");
  });

  test("BBands 逐点满足 lower ≤ middle ≤ upper", () => {
    const result = bollingerBands(oscillatingCloses(60), 20, 2);
    assert.ok(result.series.length > 0);
    for (const b of result.series) {
      assert.ok(b.lower <= b.middle && b.middle <= b.upper, `带序错误：${JSON.stringify(b)}`);
    }
  });

  test("ATR 输出正的稳定序列", () => {
    const result = averageTrueRange(hlcOf(oscillatingCloses(60)), 14);
    assert.ok(result.series.length > 0);
    assert.ok(result.series.every((v) => v > 0));
  });

  test("SuperTrend 方向仅取 BULLISH / BEARISH", () => {
    const result = superTrend(hlcOf(oscillatingCloses(100)), 10, 3);
    assert.ok(result.series.length > 0);
    for (const point of result.series) {
      assert.ok(point.trend === "BULLISH" || point.trend === "BEARISH");
      assert.ok(Number.isFinite(point.supertrend));
    }
  });

  test("VWAP 全序列为有限数", () => {
    const result = volumeWeightedAveragePrice(hlcvOf(oscillatingCloses(60)));
    assert.ok(result.series.length > 0);
    assert.ok(result.series.every((v) => Number.isFinite(v)));
  });
});

describe("振荡类指标", () => {
  test("单调上涨序列 RSI 恒为 100", () => {
    const result = relativeStrengthIndex(risingCloses(50), 14);
    assert.ok(result.series.length > 0);
    assert.ok(result.series.every((v) => v === 100));
  });

  test("MACD 结果含 macd / signal / histogram 三键", () => {
    const result = macd(oscillatingCloses(80), 12, 26, 9);
    assert.ok(result.series.length > 0);
    for (const point of result.series) {
      assert.ok("macd" in point && "signal" in point && "histogram" in point);
    }
  });

  test("Stoch 结果含 K / D / J 三键且 K ∈ [0, 100]", () => {
    const result = stochasticOscillator(hlcOf(oscillatingCloses(80)), 14, 3, 3);
    assert.ok(result.series.length > 0);
    for (const point of result.series) {
      assert.ok("stochK" in point && "stochD" in point && "stochJ" in point);
      assert.ok(point.stochK >= 0 && point.stochK <= 100, `K 越界：${point.stochK}`);
    }
  });

  test("CCI / MFI / ADX / OBV 输出稳定数值序列", () => {
    const closes = oscillatingCloses(80);
    const cci = commodityChannelIndex(hlcOf(closes), 20);
    const mfi = moneyFlowIndex(hlcvOf(closes), 14);
    const adx = averageDirectionalIndex(hlcOf(closes), 14);
    const obv = onBalanceVolume(ohlcvOf(closes), 30);
    for (const result of [cci, mfi, adx, obv]) {
      assert.ok(result.series.length > 0);
      assert.ok(result.series.every((v) => Number.isFinite(v)));
    }
  });
});

describe("边界与预热需求", () => {
  test("空输入返回空序列且不抛错", () => {
    const result = simpleMovingAverage([], 14);
    assert.equal(result.series.length, 0);
    assert.equal(result.requiredInputs, 14);
  });

  test("预热不足时 assertStable 抛出含预热需求与 limit 的错误", () => {
    const result = simpleMovingAverage(risingCloses(10), 14);
    assert.equal(result.series.length, 0);
    assert.throws(
      () => assertStable(result, 10),
      /预热需 14 个输入.*limit=10/,
    );
  });
});

describe("组合信号", () => {
  test("maCross 检出末根金叉（构造序列）", () => {
    // 平稳段后接 10,1,1,10：SMA(2) 在末根上穿 SMA(3)
    const closes = [...Array(30).fill(5), 10, 1, 1, 10];
    const result = maCross(closes, 2, 3, "SMA");
    assert.equal(result.cross, "golden_cross");
    assert.equal(result.bias, "bullish");
  });

  test("maCross 检出末根死叉（构造序列）", () => {
    const closes = [...Array(30).fill(5), 1, 10, 10, 1];
    const result = maCross(closes, 2, 3, "SMA");
    assert.equal(result.cross, "death_cross");
    assert.equal(result.bias, "bearish");
  });

  test("maCross 单边上行无交叉且偏多", () => {
    const result = maCross(risingCloses(60), 5, 20, "EMA");
    assert.equal(result.cross, "none");
    assert.equal(result.bias, "bullish");
  });

  test("divergence 检出顶背离（价格新高 + RSI 走低）", () => {
    // 前半：纯上涨（RSI=100）至 158；后半：锯齿上行创新高（涨4跌1 → RSI≈80）
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) closes.push(100 + i * 2); // 100..158
    let price = 150;
    for (let i = 0; i < 30; i++) {
      closes.push(price + 4);
      price += 4;
      closes.push(price - 1);
      price -= 1;
    }
    const result = divergence(closes, 14, closes.length);
    assert.ok(["bearish", "both"].includes(result.type), `期望顶背离，实际 ${result.type}`);
    assert.ok(result.price.high2.value > result.price.high1.value);
    assert.ok(result.rsi.atHigh2 < result.rsi.atHigh1);
  });

  test("volatilityRegime 带宽收窄判定 squeeze、扩张判定 expansion", () => {
    // 前段宽幅震荡（±15），后段收敛（±1）→ 当前带宽处于历史低位
    const squeezeCloses: number[] = [];
    for (let i = 0; i < 40; i++) squeezeCloses.push(100 + Math.sin(i) * 15);
    for (let i = 0; i < 25; i++) squeezeCloses.push(100 + Math.sin(i) * 1);
    const squeeze = volatilityRegime(squeezeCloses, 20, 2, 50);
    assert.equal(squeeze.regime, "squeeze");

    // 前段收敛，后段宽幅 → 当前带宽处于历史高位
    const expansionCloses: number[] = [];
    for (let i = 0; i < 40; i++) expansionCloses.push(100 + Math.sin(i) * 1);
    for (let i = 0; i < 25; i++) expansionCloses.push(100 + Math.sin(i) * 15);
    const expansion = volatilityRegime(expansionCloses, 20, 2, 50);
    assert.ok(
      ["expansion", "high_volatility"].includes(expansion.regime),
      `期望高波动档，实际 ${expansion.regime}`,
    );
  });

  test("bbRsi 常数序列下 percentB 兜底为 50", () => {
    const closes = Array(40).fill(100);
    const result = bbRsi(closes, 20, 2, 14);
    assert.equal(result.percentB, PERCENTB_FALLBACK);
    assert.ok(Number.isFinite(result.rsi));
  });
});
