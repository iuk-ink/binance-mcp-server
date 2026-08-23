/**
 * 指标计算层 — 组合信号（自研解读逻辑）
 *
 * 基于基础指标派生「结论型」输出：均线交叉 / 指标组合 / 背离检测 / 波动率状态。
 * 数据组合类（macdRsi / bbRsi）只给数据不给主观信号，解读留给 AI；
 * 信号判定类（maCross / divergence / volatilityRegime）输出确定性枚举结论。
 *
 * 输入不足时抛出含各指标预热需求的可读错误（由 MCP 工厂加工具名前缀）。
 *
 * @module indicators/signals
 */

import { hasCrossedOver, hasCrossedUnder } from "trading-signals";
import type { MACDResult } from "trading-signals";
import {
  PERCENT_SCALE,
  PERCENTB_FALLBACK,
  VOLATILITY_QUANTILE_HIGH,
  VOLATILITY_QUANTILE_LOW,
  VOLATILITY_QUANTILE_MID_HIGH,
  VOLATILITY_QUANTILE_MID_LOW,
} from "../constants/index.js";
import { bollingerBands, exponentialMovingAverage, simpleMovingAverage } from "./overlays.js";
import { macd, relativeStrengthIndex } from "./oscillators.js";
import { latestOf } from "./runner.js";

/** 均线类型 */
export type MaType = "SMA" | "EMA";

/** 均线交叉信号结果 */
export interface MaCrossResult {
  /** 末两根内的交叉状态：金叉 / 死叉 / 无 */
  cross: "golden_cross" | "death_cross" | "none";
  /** 末值偏多偏空：快线高于慢线为多头排列 */
  bias: "bullish" | "bearish" | "neutral";
  /** 快线末值 */
  fast: number;
  /** 慢线末值 */
  slow: number;
}

/**
 * 检测双均线交叉状态与多空偏向
 *
 * 两序列按尾部对齐后，用包内置 hasCrossedOver/Under 判定末两根交叉。
 *
 * @param closes - 收盘价序列
 * @param fast   - 快线周期
 * @param slow   - 慢线周期
 * @param type   - 均线类型（SMA / EMA）
 * @returns 交叉状态与多空偏向
 * @throws 稳定序列不足两根时抛出含预热需求的错误
 */
export function maCross(
  closes: readonly number[],
  fast: number,
  slow: number,
  type: MaType,
): MaCrossResult {
  const fastResult = type === "SMA" ? simpleMovingAverage(closes, fast) : exponentialMovingAverage(closes, fast);
  const slowResult = type === "SMA" ? simpleMovingAverage(closes, slow) : exponentialMovingAverage(closes, slow);
  // 快慢线稳定起点不同，尾部对齐到共同长度
  const n = Math.min(fastResult.series.length, slowResult.series.length);
  if (n < 2) {
    const required = Math.max(fastResult.requiredInputs, slowResult.requiredInputs) + 1;
    throw new Error(
      `K 线数量不足以判定交叉（需 ${required} 个输入产出至少两根稳定值），请增大 limit`,
    );
  }
  const fastTail = fastResult.series.slice(-n);
  const slowTail = slowResult.series.slice(-n);
  const currentFast = fastTail[n - 1];
  const currentSlow = slowTail[n - 1];
  const cross = hasCrossedOver(fastTail[n - 2], slowTail[n - 2], currentFast, currentSlow)
    ? "golden_cross"
    : hasCrossedUnder(fastTail[n - 2], slowTail[n - 2], currentFast, currentSlow)
      ? "death_cross"
      : "none";
  const bias =
    currentFast > currentSlow ? "bullish" : currentFast < currentSlow ? "bearish" : "neutral";
  return { cross, bias, fast: currentFast, slow: currentSlow };
}

/** MACD + RSI 组合结果（最新值） */
export interface MacdRsiResult {
  macd: MACDResult;
  rsi: number;
}

/**
 * 同时计算 MACD 与 RSI 最新值
 *
 * @param closes    - 收盘价序列
 * @param fast      - MACD 快线周期
 * @param slow      - MACD 慢线周期
 * @param signal    - MACD 信号线周期
 * @param rsiPeriod - RSI 周期
 * @returns MACD 三元组与 RSI 最新值
 * @throws 任一指标无稳定值时抛出含各自预热需求的错误
 */
export function macdRsi(
  closes: readonly number[],
  fast: number,
  slow: number,
  signal: number,
  rsiPeriod: number,
): MacdRsiResult {
  const macdResult = macd(closes, fast, slow, signal);
  const rsiResult = relativeStrengthIndex(closes, rsiPeriod);
  const macdLatest = latestOf(macdResult);
  const rsiLatest = latestOf(rsiResult);
  if (macdLatest === null || rsiLatest === null) {
    throw new Error(
      `K 线数量不足（MACD 预热需 ${macdResult.requiredInputs} 个输入，RSI 预热需 ${rsiResult.requiredInputs} 个输入），请增大 limit`,
    );
  }
  return { macd: macdLatest, rsi: rsiLatest };
}

/** 布林带 + RSI 组合结果（最新值） */
export interface BbRsiResult {
  upper: number;
  middle: number;
  lower: number;
  /** 最新价在带内的百分比位置（0=下轨，100=上轨；带重合时兜底 50） */
  percentB: number;
  /** 最新价分区：带上方 / 上半带 / 下半带 / 带下方 */
  zone: "above" | "upper_half" | "lower_half" | "below";
  rsi: number;
}

/**
 * 同时计算布林带完整数据、RSI、%B 与价格分区
 *
 * @param closes     - 收盘价序列
 * @param bbPeriod   - 布林带周期
 * @param multiplier - 标准差倍数
 * @param rsiPeriod  - RSI 周期
 * @returns 带轨、%B、分区与 RSI 最新值
 * @throws 任一指标无稳定值时抛出含各自预热需求的错误
 */
export function bbRsi(
  closes: readonly number[],
  bbPeriod: number,
  multiplier: number,
  rsiPeriod: number,
): BbRsiResult {
  const bbResult = bollingerBands(closes, bbPeriod, multiplier);
  const rsiResult = relativeStrengthIndex(closes, rsiPeriod);
  const bbLatest = latestOf(bbResult);
  const rsiLatest = latestOf(rsiResult);
  if (bbLatest === null || rsiLatest === null) {
    throw new Error(
      `K 线数量不足（布林带预热需 ${bbResult.requiredInputs} 个输入，RSI 预热需 ${rsiResult.requiredInputs} 个输入），请增大 limit`,
    );
  }
  const price = closes[closes.length - 1];
  const bandWidth = bbLatest.upper - bbLatest.lower;
  const percentB = bandWidth !== 0 ? ((price - bbLatest.lower) / bandWidth) * PERCENT_SCALE : PERCENTB_FALLBACK;
  const zone =
    percentB > PERCENT_SCALE
      ? "above"
      : percentB >= PERCENTB_FALLBACK
        ? "upper_half"
        : percentB >= 0
          ? "lower_half"
          : "below";
  return { ...bbLatest, percentB, zone, rsi: rsiLatest };
}

/** 窗口内的极值点（索引对齐原始收盘序列） */
export interface PivotPoint {
  index: number;
  value: number;
}

/** RSI 背离检测结果 */
export interface DivergenceResult {
  /** 背离类型：顶背离 / 底背离 / 双背离 / 无 */
  type: "bearish" | "bullish" | "both" | "none";
  /** 实际参与分析的有效窗口长度 */
  window: number;
  /** 前后半窗的价格高点 / 低点 */
  price: {
    high1: PivotPoint;
    high2: PivotPoint;
    low1: PivotPoint;
    low2: PivotPoint;
  };
  /** 对应极值点处的 RSI 值 */
  rsi: {
    atHigh1: number;
    atHigh2: number;
    atLow1: number;
    atLow2: number;
  };
}

/**
 * 检测价格与 RSI 的顶背离 / 底背离
 *
 * 将有效窗口（最近 lookback 根且 RSI 已稳定）对半分为前后两段，
 * 顶背离 = 后半段价格高点创新高而该处 RSI 低于前半段高点处 RSI；
 * 底背离反之。输出全部极值明细，供 AI 自行复核结论。
 *
 * @param closes    - 收盘价序列
 * @param rsiPeriod - RSI 周期
 * @param lookback  - 分析窗口大小
 * @returns 背离类型与极值明细
 * @throws RSI 稳定段不足两根时抛出含预热需求的错误
 */
export function divergence(
  closes: readonly number[],
  rsiPeriod: number,
  lookback: number,
): DivergenceResult {
  const rsiResult = relativeStrengthIndex(closes, rsiPeriod);
  const rsi = rsiResult.series;
  // RSI 稳定序列与原始收盘序列的索引偏移（rsi[i] 对应 closes 索引 i + offset）
  const offset = closes.length - rsi.length;
  // 有效区间：窗口限制 + RSI 已稳定
  const validStart = Math.max(closes.length - lookback, offset, 0);
  if (closes.length - validStart < 2 || rsi.length < 2) {
    throw new Error(
      `K 线数量不足以检测背离（RSI 预热需 ${rsiResult.requiredInputs} 个输入），请增大 limit`,
    );
  }
  const mid = validStart + Math.floor((closes.length - validStart) / 2);
  const pivotOf = (from: number, to: number, pickMax: boolean): PivotPoint => {
    let best = from;
    for (let i = from + 1; i < to; i++) {
      if (pickMax ? closes[i] > closes[best] : closes[i] < closes[best]) best = i;
    }
    return { index: best, value: closes[best] };
  };
  const high1 = pivotOf(validStart, mid, true);
  const high2 = pivotOf(mid, closes.length, true);
  const low1 = pivotOf(validStart, mid, false);
  const low2 = pivotOf(mid, closes.length, false);
  const at = (p: PivotPoint): number => rsi[p.index - offset];
  const bearish = high2.value > high1.value && at(high2) < at(high1);
  const bullish = low2.value < low1.value && at(low2) > at(low1);
  const type = bearish && bullish ? "both" : bearish ? "bearish" : bullish ? "bullish" : "none";
  return {
    type,
    window: closes.length - validStart,
    price: { high1, high2, low1, low2 },
    rsi: { atHigh1: at(high1), atHigh2: at(high2), atLow1: at(low1), atLow2: at(low2) },
  };
}

/** 波动率状态分类结果 */
export interface VolatilityRegimeResult {
  /** 状态：挤压 / 低波动 / 常态 / 高波动 / 扩张 */
  regime: "squeeze" | "low_volatility" | "normal" | "high_volatility" | "expansion";
  /** 当前布林带宽（百分比） */
  bandwidth: number;
  /** 当前带宽在历史窗口中的百分位（0-100） */
  percentile: number;
}

/**
 * 基于布林带宽百分位分类波动率状态
 *
 * 带宽 = (upper − lower) / middle × 100；取最近 lookback 根带宽，
 * 以当前带宽在其中的百分位分五档（<20 / 20-40 / 40-60 / 60-80 / >80）。
 *
 * @param closes     - 收盘价序列
 * @param bbPeriod   - 布林带周期
 * @param multiplier - 标准差倍数
 * @param lookback   - 历史比较窗口
 * @returns 状态、当前带宽与百分位
 * @throws 稳定带宽不足两根时抛出含预热需求的错误
 */
export function volatilityRegime(
  closes: readonly number[],
  bbPeriod: number,
  multiplier: number,
  lookback: number,
): VolatilityRegimeResult {
  const bbResult = bollingerBands(closes, bbPeriod, multiplier);
  const bands = bbResult.series;
  if (bands.length < 2) {
    throw new Error(
      `K 线数量不足以分类波动率（布林带预热需 ${bbResult.requiredInputs} 个输入），请增大 limit`,
    );
  }
  const window = bands.slice(-lookback);
  const bandwidthOf = (b: { upper: number; lower: number; middle: number }): number =>
    b.middle !== 0 ? ((b.upper - b.lower) / b.middle) * PERCENT_SCALE : 0;
  const bandwidths = window.map(bandwidthOf);
  const bandwidth = bandwidths[bandwidths.length - 1];
  // 当前带宽在历史窗口中的百分位（不大于当前值的占比）
  const percentile =
    (bandwidths.filter((v) => v <= bandwidth).length / bandwidths.length) * PERCENT_SCALE;
  const regime =
    percentile < VOLATILITY_QUANTILE_LOW
      ? "squeeze"
      : percentile < VOLATILITY_QUANTILE_MID_LOW
        ? "low_volatility"
        : percentile < VOLATILITY_QUANTILE_MID_HIGH
          ? "normal"
          : percentile < VOLATILITY_QUANTILE_HIGH
            ? "high_volatility"
            : "expansion";
  return { regime, bandwidth, percentile };
}
