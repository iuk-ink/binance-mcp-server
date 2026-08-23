/**
 * 指标计算层 — 振荡类（围绕固定区间摆动的指标）
 *
 * 委托 trading-signals 的 RSI / MACD / StochasticOscillator / CCI / MFI / ADX / OBV，
 * 统一为「显式参数纯函数 → 稳定序列 + 预热需求」形态。
 * RSI 保留包默认的 Wilder（WSMA）平滑；ADX 仅输出强度序列，
 * 方向分量（pdi/mdi）为仅最新值的 getter，不混入序列以免破坏数组形状。
 *
 * @module indicators/oscillators
 */

import { ADX, CCI, EMA, MACD, MFI, OBV, RSI, StochasticOscillator } from "trading-signals";
import type {
  HighLowClose,
  HighLowCloseVolume,
  MACDResult,
  OpenHighLowCloseVolume,
  StochasticResult,
} from "trading-signals";
import { runSeries, type SeriesResult } from "./runner.js";

/**
 * 相对强弱指标（0-100，Wilder 平滑）
 *
 * @param closes - 收盘价序列
 * @param period - 周期
 * @returns 稳定 RSI 序列与预热需求
 */
export function relativeStrengthIndex(
  closes: readonly number[],
  period: number,
): SeriesResult<number> {
  return runSeries(() => new RSI(period), closes);
}

/**
 * 平滑异同移动平均
 *
 * @param closes  - 收盘价序列
 * @param short   - 快线周期
 * @param long    - 慢线周期
 * @param signal  - 信号线周期
 * @returns 稳定三元组序列（macd / signal / histogram）与预热需求
 */
export function macd(
  closes: readonly number[],
  short: number,
  long: number,
  signal: number,
): SeriesResult<MACDResult> {
  return runSeries(() => new MACD(new EMA(short), new EMA(long), new EMA(signal)), closes);
}

/**
 * 随机指标（K / D / J）
 *
 * @param hlc       - 高低价与收盘价序列
 * @param kPeriod   - K 线周期
 * @param dPeriod   - D 线周期
 * @param kSlowing  - K 线平滑周期
 * @returns 稳定三元组序列（stochK / stochD / stochJ）与预热需求
 */
export function stochasticOscillator(
  hlc: readonly HighLowClose[],
  kPeriod: number,
  dPeriod: number,
  kSlowing: number,
): SeriesResult<StochasticResult> {
  return runSeries(
    () => new StochasticOscillator({ kPeriod, kSlowingPeriod: kSlowing, dPeriod }),
    hlc,
  );
}

/**
 * 顺势指标（以典型价离差归一，可正可负）
 *
 * @param hlc    - 高低价与收盘价序列
 * @param period - 周期
 * @returns 稳定 CCI 序列与预热需求
 */
export function commodityChannelIndex(
  hlc: readonly HighLowClose[],
  period: number,
): SeriesResult<number> {
  return runSeries(() => new CCI(period), hlc);
}

/**
 * 资金流量指标（0-100，带成交量的 RSI 变体）
 *
 * @param hlcv   - 高低价、收盘价与成交量序列
 * @param period - 周期
 * @returns 稳定 MFI 序列与预热需求
 */
export function moneyFlowIndex(
  hlcv: readonly HighLowCloseVolume[],
  period: number,
): SeriesResult<number> {
  return runSeries(() => new MFI(period), hlcv);
}

/**
 * 平均趋向指标（衡量趋势强度，与方向无关）
 *
 * @param hlc    - 高低价与收盘价序列
 * @param period - 周期
 * @returns 稳定 ADX 序列与预热需求
 */
export function averageDirectionalIndex(
  hlc: readonly HighLowClose[],
  period: number,
): SeriesResult<number> {
  return runSeries(() => new ADX(period), hlc);
}

/**
 * 能量潮（结合开盘与收盘方向的累计成交量）
 *
 * @param ohlcv  - 开高低收与成交量序列
 * @param period - 周期
 * @returns 稳定 OBV 序列与预热需求
 */
export function onBalanceVolume(
  ohlcv: readonly OpenHighLowCloseVolume[],
  period: number,
): SeriesResult<number> {
  return runSeries(() => new OBV(period), ohlcv);
}
