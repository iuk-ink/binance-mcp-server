/**
 * 工具定义 — 风险绩效域（analysis_*）
 *
 * 全直连模式：内部拉取 K 线 → 推导收益率 / 净值序列 → 计算风险绩效指标，
 * 一次调用直接拿到结果。覆盖夏普·索提诺 / 最大回撤 / VaR·CVaR。
 * 度量对象为标的价格序列的风险特征（非账户绩效）。
 *
 * 收益率按 `r_i = (close_i - close_{i-1}) / close_{i-1}` 计算；
 * 净值序列直接用收盘价（价格即净值）。
 *
 * @module tools/analysis
 */

import { z } from "zod/v4";
import { maxDrawdown, sharpe, valueAtRisk } from "../analysis/risk.js";
import {
  CONFIDENCE_DEFAULT,
  CONFIDENCE_MAX,
  CONFIDENCE_MIN,
  KLINE_DEFAULT_LIMIT,
  KLINE_MAX_LIMIT,
  MINUTES_PER_INTERVAL,
  MINUTES_PER_YEAR,
  PERIODS_PER_YEAR_DECIMALS,
  PERIODS_PER_YEAR_MAX,
  RISK_FREE_RATE_DEFAULT,
  RISK_MIN_KLINES,
} from "../constants/index.js";
import type { KlineInterval } from "../exchange/types.js";
import { klineIntervalSchema, limitSchema, symbolSchema } from "../mcp/schema.js";
import type { ToolDef } from "../mcp/types.js";
import { numberParam } from "../utils/args.js";
import { fetchClose } from "../utils/klines.js";
import type { KlinesFetcher } from "../utils/klines.js";
import type { ToolContext } from "./index.js";

/** 只读 + 外部世界注解 */
const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true } as const;

/** 通用参数：symbol + interval + limit（min 3：需 3 根 K 线产生 2 个收益率样本） */
const baseParams = {
  symbol: symbolSchema,
  interval: klineIntervalSchema,
  limit: limitSchema(KLINE_DEFAULT_LIMIT, RISK_MIN_KLINES, KLINE_MAX_LIMIT),
};

/**
 * 由收盘价序列推导逐根收益率（前值为 0 跳过防除零）
 *
 * @param closes - 收盘价序列（时间升序）
 * @returns 逐根收益率序列（小数），长度 = closes.length - 1
 */
function returnsOf(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const previous = closes[i - 1];
    if (previous !== 0) returns.push((closes[i] - previous) / previous);
  }
  return returns;
}

/**
 * 按 K 线周期推导年化换算系数（每年 K 线根数）
 *
 * 1h→8760、4h→2190、1d→365、1M→12.17；未知周期兜底按 1 天计算。
 *
 * @param interval - K 线周期
 * @returns 每年 K 线根数（保留 2 位小数）
 */
function periodsPerYearForInterval(interval: string): number {
  const minutes = MINUTES_PER_INTERVAL[interval as keyof typeof MINUTES_PER_INTERVAL];
  const perYear = MINUTES_PER_YEAR / (minutes ?? MINUTES_PER_INTERVAL["1d"]);
  const precisionFactor = 10 ** PERIODS_PER_YEAR_DECIMALS;
  return Math.round(perYear * precisionFactor) / precisionFactor;
}

/**
 * 组装风险绩效工具定义
 *
 * @param ctx - 工具上下文（提供行情服务）
 * @returns 风险绩效工具定义列表（3 个）
 */
export function buildAnalysisToolDefs(ctx: ToolContext): ToolDef[] {
  const fetcher: KlinesFetcher = (params) => ctx.market.getKlines(params);

  return [
    {
      name: "analysis_sharpe",
      title: "夏普·索提诺",
      description:
        "直连版：拉取 K 线推导标的收益率序列，计算年化收益/波动、夏普与索提诺。度量对象为标的价格序列的风险特征（非账户绩效）；periodPerYear 缺省按 interval 自动推断（1h→8760、1d→365）；严肃评估建议使用 1d×365 及以上大窗口（小窗口年化统计意义有限）。",
      schema: z.object({
        ...baseParams,
        // 单周期无风险利率：与单根 K 线收益率同口径（小数），内部统一年化后再对比
        riskFreeRate: z
          .number()
          .min(0)
          .default(RISK_FREE_RATE_DEFAULT)
          .describe("单周期无风险利率（小数，如 0.0001 = 0.01%），默认 0"),
        periodPerYear: z
          .number()
          .int()
          .min(1)
          .max(PERIODS_PER_YEAR_MAX)
          .optional()
          .describe("年化系数（每年 K 线根数），缺省按 interval 自动推断"),
      }),
      outputSchema: z.object({
        annualReturn: z.number(),
        annualVolatility: z.number(),
        sharpe: z.number(),
        sortino: z.number(),
        periodPerYear: z.number(),
        sampleCount: z.number(),
      }),
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const closes = await fetchClose(
          fetcher,
          String(args.symbol),
          args.interval as KlineInterval,
          numberParam(args.limit, KLINE_DEFAULT_LIMIT),
        );
        const returns = returnsOf(closes);
        if (returns.length < 2) {
          throw new Error("K 线数量不足，至少需要 3 根 K 线产生 2 个收益率样本，请增大 limit");
        }
        const periodPerYear =
          args.periodPerYear !== undefined
            ? Number(args.periodPerYear)
            : periodsPerYearForInterval(String(args.interval));
        const result = sharpe(
          returns,
          numberParam(args.riskFreeRate, RISK_FREE_RATE_DEFAULT),
          periodPerYear,
        );
        // sampleCount 为收益率样本数（= K 线数 − 1），窗口透明度
        return { ...result, periodPerYear, sampleCount: returns.length };
      },
    },
    {
      name: "analysis_drawdown",
      title: "最大回撤",
      description:
        "直连版：拉取 K 线以收盘价为净值序列，计算标的最大回撤（负数）与峰谷位置（非账户绩效）。窗口越大越接近历史极值，建议 1d×365 起评估最大可能回撤。",
      schema: z.object({ ...baseParams }),
      outputSchema: z.object({
        maxDrawdown: z.number(),
        peak: z.number(),
        trough: z.number(),
        sampleCount: z.number(),
      }),
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const closes = await fetchClose(
          fetcher,
          String(args.symbol),
          args.interval as KlineInterval,
          numberParam(args.limit, KLINE_DEFAULT_LIMIT),
        );
        if (closes.length < 2) {
          throw new Error("K 线数量不足，至少需要 2 根 K 线，请增大 limit");
        }
        // sampleCount 为 K 线根数（净值样本数）
        return { ...maxDrawdown(closes), sampleCount: closes.length };
      },
    },
    {
      name: "analysis_var",
      title: "VaR · CVaR",
      description:
        "直连版：拉取 K 线推导收益率，按历史模拟法计算置信度下的 VaR 与 CVaR（负值=损失；度量标的单根 K 线尾部风险，非账户绩效）。可作止损距离参考：止损应 ≥ 单根 VaR × 杠杆，否则易被正常波动扫损。",
      schema: z.object({
        ...baseParams,
        confidence: z
          .number()
          .min(CONFIDENCE_MIN)
          .max(CONFIDENCE_MAX)
          .default(CONFIDENCE_DEFAULT)
          .describe("置信度（0.5~0.99）"),
      }),
      outputSchema: z.object({
        var: z.number(),
        cvar: z.number(),
        confidence: z.number(),
        sampleCount: z.number(),
      }),
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        const closes = await fetchClose(
          fetcher,
          String(args.symbol),
          args.interval as KlineInterval,
          numberParam(args.limit, KLINE_DEFAULT_LIMIT),
        );
        const returns = returnsOf(closes);
        if (returns.length < 2) {
          throw new Error("K 线数量不足，至少需要 3 根 K 线产生 2 个收益率样本，请增大 limit");
        }
        // sampleCount 为收益率样本数（= K 线数 − 1）
        return {
          ...valueAtRisk(returns, numberParam(args.confidence, CONFIDENCE_DEFAULT)),
          sampleCount: returns.length,
        };
      },
    },
  ];
}
