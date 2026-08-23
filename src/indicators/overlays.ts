/**
 * 指标计算层 — 叠加类（绘制在价格图上的指标）
 *
 * 委托 trading-signals 的 SMA / EMA / ATR / BollingerBands / SuperTrend / VWAP，
 * 统一为「显式参数纯函数 → 稳定序列 + 预热需求」形态。
 * 全部显式传入周期与倍数，不依赖包构造函数的默认值。
 *
 * @module indicators/overlays
 */

import {
  ATR,
  BollingerBands,
  EMA,
  SMA,
  SuperTrend,
  VWAP,
} from "trading-signals";
import type {
  BandsResult,
  HighLowClose,
  HighLowCloseVolume,
  SuperTrendResult,
} from "trading-signals";
import { runSeries, type SeriesResult } from "./runner.js";

/**
 * 简单移动平均
 *
 * @param closes - 收盘价序列
 * @param period - 周期
 * @returns 稳定 SMA 序列与预热需求
 */
export function simpleMovingAverage(
  closes: readonly number[],
  period: number,
): SeriesResult<number> {
  return runSeries(() => new SMA(period), closes);
}

/**
 * 指数移动平均
 *
 * 以首个价格作平滑种子，自首个输入起逐根产出结果。
 *
 * @param closes - 收盘价序列
 * @param period - 周期
 * @returns EMA 序列（长度与输入一致）与预热需求
 */
export function exponentialMovingAverage(
  closes: readonly number[],
  period: number,
): SeriesResult<number> {
  return runSeries(() => new EMA(period), closes);
}

/**
 * 平均真实波幅（默认 Wilder 平滑）
 *
 * @param hlc    - 高低价与收盘价序列
 * @param period - 周期
 * @returns 稳定 ATR 序列与预热需求
 */
export function averageTrueRange(
  hlc: readonly HighLowClose[],
  period: number,
): SeriesResult<number> {
  return runSeries(() => new ATR(period), hlc);
}

/**
 * 布林带（基于移动平均与标准差）
 *
 * @param closes     - 收盘价序列
 * @param period     - 周期
 * @param multiplier - 标准差倍数
 * @returns 稳定三元组序列（lower / middle / upper）与预热需求
 */
export function bollingerBands(
  closes: readonly number[],
  period: number,
  multiplier: number,
): SeriesResult<BandsResult> {
  return runSeries(() => new BollingerBands(period, multiplier), closes);
}

/**
 * SuperTrend 趋势跟踪
 *
 * @param hlc        - 高低价与收盘价序列
 * @param period     - ATR 周期
 * @param multiplier - 通道倍数
 * @returns 稳定序列（supertrend 值 + BULLISH/BEARISH 方向）与预热需求
 */
export function superTrend(
  hlc: readonly HighLowClose[],
  period: number,
  multiplier: number,
): SeriesResult<SuperTrendResult> {
  return runSeries(() => new SuperTrend({ interval: period, multiplier }), hlc);
}

/**
 * 成交量加权平均价（自首个输入起累计）
 *
 * @param hlcv - 高低价、收盘价与成交量序列
 * @returns VWAP 序列与预热需求
 */
export function volumeWeightedAveragePrice(
  hlcv: readonly HighLowCloseVolume[],
): SeriesResult<number> {
  return runSeries(() => new VWAP(), hlcv);
}
