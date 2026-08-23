/**
 * 指标计算层 — 聚合导出
 *
 * 统一导出各指标模块，供工具层按需引用。
 *
 * @module indicators
 */

export { runSeries, assertStable, latestOf } from "./runner.js";
export type { SeriesResult, StreamIndicator } from "./runner.js";

export {
  simpleMovingAverage,
  exponentialMovingAverage,
  averageTrueRange,
  bollingerBands,
  superTrend,
  volumeWeightedAveragePrice,
} from "./overlays.js";

export {
  relativeStrengthIndex,
  macd,
  stochasticOscillator,
  commodityChannelIndex,
  moneyFlowIndex,
  averageDirectionalIndex,
  onBalanceVolume,
} from "./oscillators.js";

export {
  maCross,
  macdRsi,
  bbRsi,
  divergence,
  volatilityRegime,
} from "./signals.js";
export type {
  MaType,
  MaCrossResult,
  MacdRsiResult,
  BbRsiResult,
  PivotPoint,
  DivergenceResult,
  VolatilityRegimeResult,
} from "./signals.js";

export { computeMultiIndicators } from "./multi.js";
export type { MultiIndicatorOptions, MultiIndicatorResult } from "./multi.js";
