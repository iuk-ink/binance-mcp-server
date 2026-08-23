/**
 * 指标计算层 — 批量计算
 *
 * 单次 K 线拉取后本地提取 close / HLC 两份视图，
 * 一次产出核心三件（RSI / MACD / BBands）与可选三件（ATR / ADX / Stoch）的最新值，
 * 替代逐个工具调用 3-6 次网络往返。
 *
 * @module indicators/multi
 */

import type { BandsResult, HighLowClose, MACDResult, StochasticResult } from "trading-signals";
import {
  ADX_PERIOD,
  ATR_PERIOD,
  BOLLINGER_MULTIPLIER,
  BOLLINGER_PERIOD,
  MACD_FAST,
  MACD_SIGNAL,
  MACD_SLOW,
  RSI_PERIOD,
  STOCH_D_PERIOD,
  STOCH_K_PERIOD,
  STOCH_K_SLOWING,
} from "../constants/index.js";
import { averageDirectionalIndex, macd, relativeStrengthIndex, stochasticOscillator } from "./oscillators.js";
import { averageTrueRange, bollingerBands } from "./overlays.js";
import { latestOf } from "./runner.js";

/** 批量计算的可选指标开关 */
export interface MultiIndicatorOptions {
  includeAtr: boolean;
  includeAdx: boolean;
  includeStoch: boolean;
}

/** 批量指标结果（核心三件必含，可选件按开关出现） */
export interface MultiIndicatorResult {
  rsi: number;
  macd: MACDResult;
  bbands: BandsResult;
  atr?: number;
  adx?: number;
  stoch?: StochasticResult;
}

/**
 * 批量计算核心与可选指标的最新值
 *
 * @param closes  - 收盘价序列（K 线本地提取）
 * @param hlc     - 高低价与收盘价序列（HLC 类指标需要；不需要可选指标时传 null）
 * @param options - 可选指标开关
 * @returns 核心三件最新值 + 按开关附带的可选件最新值
 * @throws 任一启用指标无稳定值时抛出含预热需求的错误
 */
export function computeMultiIndicators(
  closes: readonly number[],
  hlc: readonly HighLowClose[] | null,
  options: MultiIndicatorOptions,
): MultiIndicatorResult {
  const rsiResult = relativeStrengthIndex(closes, RSI_PERIOD);
  const macdResult = macd(closes, MACD_FAST, MACD_SLOW, MACD_SIGNAL);
  const bbResult = bollingerBands(closes, BOLLINGER_PERIOD, BOLLINGER_MULTIPLIER);
  const rsiLatest = latestOf(rsiResult);
  const macdLatest = latestOf(macdResult);
  const bbLatest = latestOf(bbResult);
  if (rsiLatest === null || macdLatest === null || bbLatest === null) {
    throw new Error(
      `K 线数量不足（RSI 预热需 ${rsiResult.requiredInputs}，MACD 预热需 ${macdResult.requiredInputs}，布林带预热需 ${bbResult.requiredInputs} 个输入），请增大 limit`,
    );
  }
  const result: MultiIndicatorResult = {
    rsi: rsiLatest,
    macd: macdLatest,
    bbands: bbLatest,
  };
  if (options.includeAtr || options.includeAdx || options.includeStoch) {
    if (hlc === null) {
      throw new Error("HLC 视图缺失：启用 ATR / ADX / Stoch 时必须提供 K 线数据");
    }
    if (options.includeAtr) {
      const atrResult = averageTrueRange(hlc, ATR_PERIOD);
      const atrLatest = latestOf(atrResult);
      if (atrLatest === null) {
        throw new Error(`K 线数量不足（ATR 预热需 ${atrResult.requiredInputs} 个输入），请增大 limit`);
      }
      result.atr = atrLatest;
    }
    if (options.includeAdx) {
      const adxResult = averageDirectionalIndex(hlc, ADX_PERIOD);
      const adxLatest = latestOf(adxResult);
      if (adxLatest === null) {
        throw new Error(`K 线数量不足（ADX 预热需 ${adxResult.requiredInputs} 个输入），请增大 limit`);
      }
      result.adx = adxLatest;
    }
    if (options.includeStoch) {
      const stochResult = stochasticOscillator(hlc, STOCH_K_PERIOD, STOCH_D_PERIOD, STOCH_K_SLOWING);
      const stochLatest = latestOf(stochResult);
      if (stochLatest === null) {
        throw new Error(`K 线数量不足（Stoch 预热需 ${stochResult.requiredInputs} 个输入），请增大 limit`);
      }
      result.stoch = stochLatest;
    }
  }
  return result;
}
