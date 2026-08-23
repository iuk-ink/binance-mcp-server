/**
 * 工具定义 — 指标域（indicator_*）
 *
 * 全直连模式：内部拉取 K 线 → 本地提取视图 → 计算指标，一次调用直接拿到结果。
 * 覆盖 13 个基础指标 + 5 个组合信号 + 1 个批量计算。
 * 全部工具声明 outputSchema（本地确定性计算，输出形状可精确契约化）：
 * 数值序列共用 seriesOutputSchema，对象序列与信号类各自内联定义。
 *
 * @module tools/indicator
 */

import { z } from "zod/v4";
import type { KlineInterval } from "../exchange/types.js";
import {
  ADX_PERIOD,
  ATR_PERIOD,
  BOLLINGER_MULTIPLIER,
  BOLLINGER_MULTIPLIER_MAX,
  BOLLINGER_PERIOD,
  CCI_PERIOD,
  DIVERGENCE_LOOKBACK,
  DIVERGENCE_LOOKBACK_MIN,
  INDICATOR_KLINE_LIMIT_MIN,
  KLINE_DEFAULT_LIMIT,
  KLINE_MAX_LIMIT,
  LOOKBACK_MAX,
  MACD_FAST,
  MACD_SIGNAL,
  MACD_SLOW,
  MA_CROSS_FAST,
  MA_CROSS_SLOW,
  MFI_PERIOD,
  MOVING_AVERAGE_PERIOD,
  OBV_PERIOD,
  PERIOD_MAX_LONG,
  PERIOD_MAX_MEDIUM,
  PERIOD_MAX_SHORT,
  RSI_PERIOD,
  STOCH_D_PERIOD,
  STOCH_K_PERIOD,
  STOCH_K_SLOWING,
  SUPER_TREND_MULTIPLIER,
  SUPER_TREND_PERIOD,
  VOLATILITY_LOOKBACK,
  VOLATILITY_LOOKBACK_MIN,
} from "../constants/index.js";
import {
  assertStable,
  averageDirectionalIndex,
  averageTrueRange,
  bbRsi,
  bollingerBands,
  commodityChannelIndex,
  computeMultiIndicators,
  divergence,
  exponentialMovingAverage,
  macd,
  maCross,
  macdRsi,
  moneyFlowIndex,
  onBalanceVolume,
  relativeStrengthIndex,
  simpleMovingAverage,
  stochasticOscillator,
  superTrend,
  volatilityRegime,
  volumeWeightedAveragePrice,
  type MaType,
} from "../indicators/index.js";
import {
  klineIntervalSchema,
  limitSchema,
  multiplierSchema,
  periodSchema,
  seriesOutputSchema,
  symbolSchema,
} from "../mcp/schema.js";
import type { ToolDef } from "../mcp/types.js";
import { numberParam } from "../utils/args.js";
import { fetchClose, fetchHLC, fetchHLCV, fetchOHLCV, toCloses, toHlcRows } from "../utils/klines.js";
import type { KlinesFetcher } from "../utils/klines.js";
import type { ToolContext } from "./index.js";

/** 指标工具公共注解：只读 + 外部世界（拉取 K 线访问外部交易所） */
const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true } as const;

/** 通用参数：symbol + interval + limit */
const baseParams = {
  symbol: symbolSchema,
  interval: klineIntervalSchema,
  limit: limitSchema(KLINE_DEFAULT_LIMIT, INDICATOR_KLINE_LIMIT_MIN, KLINE_MAX_LIMIT),
};

/** 取均线类型入参（缺省回退 EMA） */
const maTypeParam = (value: unknown): MaType => (value === "SMA" ? "SMA" : "EMA");

/** MACD 三元组对象 */
const macdPointSchema = z.object({ macd: z.number(), signal: z.number(), histogram: z.number() });
/** 随机指标三元组对象 */
const stochPointSchema = z.object({ stochK: z.number(), stochD: z.number(), stochJ: z.number() });
/** 布林带三元组对象 */
const bandsPointSchema = z.object({ lower: z.number(), middle: z.number(), upper: z.number() });

/** MACD 序列输出 schema（数组经工厂包装为 { data } ） */
const macdSeriesOutputSchema = z.object({ data: z.array(macdPointSchema) });
/** 随机指标序列输出 schema */
const stochSeriesOutputSchema = z.object({ data: z.array(stochPointSchema) });
/** SuperTrend 序列输出 schema */
const superTrendSeriesOutputSchema = z.object({
  data: z.array(
    z.object({ supertrend: z.number(), trend: z.enum(["BULLISH", "BEARISH"]) }),
  ),
});

/** 均线交叉信号输出 schema */
const maCrossOutputSchema = z.object({
  cross: z.enum(["golden_cross", "death_cross", "none"]),
  bias: z.enum(["bullish", "bearish", "neutral"]),
  fast: z.number(),
  slow: z.number(),
});
/** MACD + RSI 组合输出 schema */
const macdRsiOutputSchema = z.object({ macd: macdPointSchema, rsi: z.number() });
/** 布林带 + RSI 组合输出 schema */
const bbRsiOutputSchema = z.object({
  upper: z.number(),
  middle: z.number(),
  lower: z.number(),
  percentB: z.number(),
  zone: z.enum(["above", "upper_half", "lower_half", "below"]),
  rsi: z.number(),
});
/** RSI 背离检测输出 schema */
const divergenceOutputSchema = z.object({
  type: z.enum(["bearish", "bullish", "both", "none"]),
  window: z.number(),
  price: z.object({
    high1: z.object({ index: z.number(), value: z.number() }),
    high2: z.object({ index: z.number(), value: z.number() }),
    low1: z.object({ index: z.number(), value: z.number() }),
    low2: z.object({ index: z.number(), value: z.number() }),
  }),
  rsi: z.object({
    atHigh1: z.number(),
    atHigh2: z.number(),
    atLow1: z.number(),
    atLow2: z.number(),
  }),
});
/** 波动率状态分类输出 schema */
const volatilityRegimeOutputSchema = z.object({
  regime: z.enum(["squeeze", "low_volatility", "normal", "high_volatility", "expansion"]),
  bandwidth: z.number(),
  percentile: z.number(),
});
/** 批量指标输出 schema（可选件按开关出现） */
const multiOutputSchema = z.object({
  rsi: z.number(),
  macd: macdPointSchema,
  bbands: bandsPointSchema,
  atr: z.number().optional(),
  adx: z.number().optional(),
  stoch: stochPointSchema.optional(),
});

/**
 * 组装全部指标工具定义
 *
 * @param ctx - 工具上下文（提供行情服务）
 * @returns 指标工具定义列表（19 个）
 */
export function buildIndicatorToolDefs(ctx: ToolContext): ToolDef[] {
  const fetcher: KlinesFetcher = (params) => ctx.market.getKlines(params);

  return [
    // ===================== 基础指标（13） =====================
    {
      name: "indicator_sma",
      title: "简单移动平均",
      description:
        "直连版：拉取 K 线后计算简单移动平均，返回稳定 SMA 序列（period 为周期）。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(MOVING_AVERAGE_PERIOD, PERIOD_MAX_LONG),
      }),
      outputSchema: seriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const closes = await fetchClose(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(simpleMovingAverage(closes, numberParam(args.period, MOVING_AVERAGE_PERIOD)), limit);
      },
    },
    {
      name: "indicator_ema",
      title: "指数移动平均",
      description:
        "直连版：拉取 K 线后计算指数移动平均，返回 EMA 序列（以首价为平滑种子，period 为周期）。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(MOVING_AVERAGE_PERIOD, PERIOD_MAX_LONG),
      }),
      outputSchema: seriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const closes = await fetchClose(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(exponentialMovingAverage(closes, numberParam(args.period, MOVING_AVERAGE_PERIOD)), limit);
      },
    },
    {
      name: "indicator_macd",
      title: "MACD",
      description:
        "直连版：拉取 K 线后计算 MACD，返回稳定三元组序列（macd / signal / histogram）。",
      schema: z.object({
        ...baseParams,
        shortPeriod: periodSchema(MACD_FAST, PERIOD_MAX_MEDIUM),
        longPeriod: periodSchema(MACD_SLOW, PERIOD_MAX_MEDIUM),
        signalPeriod: periodSchema(MACD_SIGNAL, PERIOD_MAX_SHORT),
      }),
      outputSchema: macdSeriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const closes = await fetchClose(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(
          macd(
            closes,
            numberParam(args.shortPeriod, MACD_FAST),
            numberParam(args.longPeriod, MACD_SLOW),
            numberParam(args.signalPeriod, MACD_SIGNAL),
          ),
          limit,
        );
      },
    },
    {
      name: "indicator_rsi",
      title: "相对强弱指标",
      description:
        "直连版：拉取 K 线后计算 RSI，返回稳定序列（0-100，Wilder 平滑，period 为周期）。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(RSI_PERIOD, PERIOD_MAX_MEDIUM),
      }),
      outputSchema: seriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const closes = await fetchClose(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(relativeStrengthIndex(closes, numberParam(args.period, RSI_PERIOD)), limit);
      },
    },
    {
      name: "indicator_stoch",
      title: "随机指标 KDJ",
      description:
        "直连版：拉取 K 线后计算随机指标，返回稳定 K / D / J 三元组序列（kPeriod / kSmoothing / dPeriod 可调）。",
      schema: z.object({
        ...baseParams,
        kPeriod: periodSchema(STOCH_K_PERIOD, PERIOD_MAX_SHORT),
        kSlowing: periodSchema(STOCH_K_SLOWING, PERIOD_MAX_SHORT),
        dPeriod: periodSchema(STOCH_D_PERIOD, PERIOD_MAX_SHORT),
      }),
      outputSchema: stochSeriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const hlc = await fetchHLC(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(
          stochasticOscillator(
            hlc,
            numberParam(args.kPeriod, STOCH_K_PERIOD),
            numberParam(args.dPeriod, STOCH_D_PERIOD),
            numberParam(args.kSmoothing, STOCH_K_SLOWING),
          ),
          limit,
        );
      },
    },
    {
      name: "indicator_cci",
      title: "顺势指标",
      description:
        "直连版：拉取 K 线后计算 CCI，返回稳定序列（以典型价离差归一，可正可负）。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(CCI_PERIOD, PERIOD_MAX_SHORT),
      }),
      outputSchema: seriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const hlc = await fetchHLC(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(commodityChannelIndex(hlc, numberParam(args.period, CCI_PERIOD)), limit);
      },
    },
    {
      name: "indicator_mfi",
      title: "资金流量指标",
      description:
        "直连版：拉取 K 线后计算 MFI，返回稳定序列（0-100，带成交量的 RSI 变体）。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(MFI_PERIOD, PERIOD_MAX_SHORT),
      }),
      outputSchema: seriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const hlcv = await fetchHLCV(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(moneyFlowIndex(hlcv, numberParam(args.period, MFI_PERIOD)), limit);
      },
    },
    {
      name: "indicator_adx",
      title: "平均趋向指标",
      description:
        "直连版：拉取 K 线后计算 ADX，返回稳定序列（衡量趋势强度，0-100，与方向无关）。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(ADX_PERIOD, PERIOD_MAX_SHORT),
      }),
      outputSchema: seriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const hlc = await fetchHLC(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(averageDirectionalIndex(hlc, numberParam(args.period, ADX_PERIOD)), limit);
      },
    },
    {
      name: "indicator_super_trend",
      title: "SuperTrend",
      description:
        "直连版：拉取 K 线后计算 SuperTrend，返回稳定序列（supertrend 值 + BULLISH/BEARISH 方向）。period 为 ATR 周期，multiplier 为通道倍数。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(SUPER_TREND_PERIOD, PERIOD_MAX_SHORT),
        multiplier: multiplierSchema(SUPER_TREND_MULTIPLIER),
      }),
      outputSchema: superTrendSeriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const hlc = await fetchHLC(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(
          superTrend(hlc, numberParam(args.period, SUPER_TREND_PERIOD), numberParam(args.multiplier, SUPER_TREND_MULTIPLIER)),
          limit,
        );
      },
    },
    {
      name: "indicator_vwap",
      title: "成交量加权平均价",
      description:
        "直连版：拉取 K 线后计算累计 VWAP，返回稳定序列。",
      schema: z.object({ ...baseParams }),
      outputSchema: seriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const hlcv = await fetchHLCV(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(volumeWeightedAveragePrice(hlcv), limit);
      },
    },
    {
      name: "indicator_atr",
      title: "平均真实波幅",
      description:
        "直连版：拉取 K 线后计算 ATR，返回稳定序列（衡量波动，默认 Wilder 平滑）。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(ATR_PERIOD, PERIOD_MAX_SHORT),
      }),
      outputSchema: seriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const hlc = await fetchHLC(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(averageTrueRange(hlc, numberParam(args.period, ATR_PERIOD)), limit);
      },
    },
    {
      name: "indicator_bbands",
      title: "布林带",
      description:
        "直连版：拉取 K 线后计算布林带，返回稳定三元组序列（lower / middle / upper）。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(BOLLINGER_PERIOD, PERIOD_MAX_MEDIUM),
        deviationMultiplier: multiplierSchema(BOLLINGER_MULTIPLIER, BOLLINGER_MULTIPLIER_MAX),
      }),
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const closes = await fetchClose(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(
          bollingerBands(
            closes,
            numberParam(args.period, BOLLINGER_PERIOD),
            numberParam(args.deviationMultiplier, BOLLINGER_MULTIPLIER),
          ),
          limit,
        );
      },
    },
    {
      name: "indicator_obv",
      title: "能量潮",
      description:
        "直连版：拉取 K 线后计算 OBV，返回稳定序列（结合开盘与收盘方向的累计成交量）。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(OBV_PERIOD, PERIOD_MAX_MEDIUM),
      }),
      outputSchema: seriesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        const ohlcv = await fetchOHLCV(fetcher, String(args.symbol), args.interval as KlineInterval, limit);
        return assertStable(onBalanceVolume(ohlcv, numberParam(args.period, OBV_PERIOD)), limit);
      },
    },

    // ===================== 组合信号（5） =====================
    {
      name: "indicator_ma_cross",
      title: "均线交叉",
      description:
        "直连版：拉取 K 线后检测双均线交叉状态（golden_cross / death_cross / none）与多空偏向。",
      schema: z.object({
        ...baseParams,
        fast: periodSchema(MA_CROSS_FAST, PERIOD_MAX_MEDIUM),
        slow: periodSchema(MA_CROSS_SLOW, PERIOD_MAX_MEDIUM),
        type: z.enum(["SMA", "EMA"]).default("EMA").describe("均线类型"),
      }),
      outputSchema: maCrossOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const closes = await fetchClose(fetcher, String(args.symbol), args.interval as KlineInterval, numberParam(args.limit, KLINE_DEFAULT_LIMIT));
        return maCross(closes, numberParam(args.fast, MA_CROSS_FAST), numberParam(args.slow, MA_CROSS_SLOW), maTypeParam(args.type));
      },
    },
    {
      name: "indicator_macd_rsi",
      title: "MACD + RSI 组合",
      description:
        "直连版：拉取 K 线后同时计算 MACD 与 RSI 最新值，返回完整数据（不输出主观信号）。",
      schema: z.object({
        ...baseParams,
        fast: periodSchema(MACD_FAST, PERIOD_MAX_MEDIUM),
        slow: periodSchema(MACD_SLOW, PERIOD_MAX_MEDIUM),
        signal: periodSchema(MACD_SIGNAL, PERIOD_MAX_SHORT),
        rsiPeriod: periodSchema(RSI_PERIOD, PERIOD_MAX_MEDIUM),
      }),
      outputSchema: macdRsiOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const closes = await fetchClose(fetcher, String(args.symbol), args.interval as KlineInterval, numberParam(args.limit, KLINE_DEFAULT_LIMIT));
        return macdRsi(
          closes,
          numberParam(args.fast, MACD_FAST),
          numberParam(args.slow, MACD_SLOW),
          numberParam(args.signal, MACD_SIGNAL),
          numberParam(args.rsiPeriod, RSI_PERIOD),
        );
      },
    },
    {
      name: "indicator_bb_rsi",
      title: "布林带 + RSI 组合",
      description:
        "直连版：拉取 K 线后同时计算布林带完整数据、RSI、%B 与价格分区。",
      schema: z.object({
        ...baseParams,
        period: periodSchema(BOLLINGER_PERIOD, PERIOD_MAX_MEDIUM),
        deviationMultiplier: multiplierSchema(BOLLINGER_MULTIPLIER, BOLLINGER_MULTIPLIER_MAX),
        rsiPeriod: periodSchema(RSI_PERIOD, PERIOD_MAX_MEDIUM),
      }),
      outputSchema: bbRsiOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const closes = await fetchClose(fetcher, String(args.symbol), args.interval as KlineInterval, numberParam(args.limit, KLINE_DEFAULT_LIMIT));
        return bbRsi(
          closes,
          numberParam(args.period, BOLLINGER_PERIOD),
          numberParam(args.deviationMultiplier, BOLLINGER_MULTIPLIER),
          numberParam(args.rsiPeriod, RSI_PERIOD),
        );
      },
    },
    {
      name: "indicator_divergence",
      title: "RSI 背离检测",
      description:
        "直连版：拉取 K 线后检测价格与 RSI 的顶背离 / 底背离（前后半窗极值对比），返回背离类型与全部极值明细。",
      schema: z.object({
        ...baseParams,
        rsiPeriod: periodSchema(RSI_PERIOD, PERIOD_MAX_MEDIUM),
        lookback: z
          .number()
          .int()
          .min(DIVERGENCE_LOOKBACK_MIN)
          .max(LOOKBACK_MAX)
          .default(DIVERGENCE_LOOKBACK)
          .describe("背离检测分析窗口（K 线根数）"),
      }),
      outputSchema: divergenceOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const closes = await fetchClose(fetcher, String(args.symbol), args.interval as KlineInterval, numberParam(args.limit, KLINE_DEFAULT_LIMIT));
        return divergence(closes, numberParam(args.rsiPeriod, RSI_PERIOD), numberParam(args.lookback, DIVERGENCE_LOOKBACK));
      },
    },
    {
      name: "indicator_volatility_regime",
      title: "波动率状态分类",
      description:
        "直连版：基于布林带宽百分位判断 squeeze / low_volatility / normal / high_volatility / expansion，辅助仓位管理。",
      schema: z.object({
        ...baseParams,
        bbPeriod: periodSchema(BOLLINGER_PERIOD, PERIOD_MAX_MEDIUM),
        lookback: z
          .number()
          .int()
          .min(VOLATILITY_LOOKBACK_MIN)
          .max(LOOKBACK_MAX)
          .default(VOLATILITY_LOOKBACK)
          .describe("带宽百分位历史比较窗口（K 线根数）"),
      }),
      outputSchema: volatilityRegimeOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const closes = await fetchClose(fetcher, String(args.symbol), args.interval as KlineInterval, numberParam(args.limit, KLINE_DEFAULT_LIMIT));
        return volatilityRegime(closes, numberParam(args.bbPeriod, BOLLINGER_PERIOD), BOLLINGER_MULTIPLIER, numberParam(args.lookback, VOLATILITY_LOOKBACK));
      },
    },

    // ===================== 批量计算（1） =====================
    {
      name: "indicator_multi",
      title: "批量指标",
      description:
        "直连版：单次拉取 K 线，批量计算 RSI(14) + MACD(12/26/9) + BBands(20/2) 最新值。可选启用 ATR / ADX / Stoch。替代逐个调用 3-6 次网络往返。",
      schema: z.object({
        ...baseParams,
        includeATR: z.boolean().default(false),
        includeADX: z.boolean().default(false),
        includeStoch: z.boolean().default(false),
      }),
      outputSchema: multiOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const limit = numberParam(args.limit, KLINE_DEFAULT_LIMIT);
        // 单次拉取 K 线，本地提取 close 与 HLC 两份视图，避免重复网络请求
        const klines = await fetcher({ symbol: String(args.symbol), interval: args.interval as KlineInterval, limit });
        const includeAtr = Boolean(args.includeATR);
        const includeAdx = Boolean(args.includeADX);
        const includeStoch = Boolean(args.includeStoch);
        const needHlc = includeAtr || includeAdx || includeStoch;
        return computeMultiIndicators(toCloses(klines), needHlc ? toHlcRows(klines) : null, {
          includeAtr,
          includeAdx,
          includeStoch,
        });
      },
    },
  ];
}
