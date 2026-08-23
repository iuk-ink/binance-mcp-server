/**
 * 工具定义 — 行情域（market_*）
 *
 * 覆盖价格 / 深度 / K 线 / 24h 统计 / 资金费率 / 未平仓量 / 连续合约 / 情绪统计。
 * 情绪类端点仅主网可用，测试网 / demo 环境跳过（服务端不提供）。
 * API 透传工具不声明 outputSchema（响应形状随官方演进，schema 校验反成负担）；
 * 本地聚合计算的工具（如 overview）全量声明。
 *
 * @module tools/market
 */

import { z } from "zod/v4";
import type { ContractType, KlineInterval, StatsPeriod } from "../exchange/types.js";
import {
  CONTINUOUS_KLINE_DEFAULT_LIMIT,
  FUNDING_HISTORY_DEFAULT_LIMIT,
  FUNDING_HISTORY_MAX_LIMIT,
  KLINE_MAX_LIMIT,
  MARKET_KLINE_DEFAULT_LIMIT,
  ORDERBOOK_DEFAULT_LIMIT,
  ORDERBOOK_VALID_LIMITS,
  SENTIMENT_DEFAULT_LIMIT,
  SENTIMENT_MAX_LIMIT,
} from "../constants/index.js";
import {
  contractTypeSchema,
  klineIntervalSchema,
  limitSchema,
  statsPeriodSchema,
  symbolSchema,
} from "../mcp/schema.js";
import type { ToolDef } from "../mcp/types.js";
import { numberParam } from "../utils/args.js";
import type { ToolContext } from "./index.js";

/** 行情类工具公共注解：只读 + 外部世界（访问外部交易所） */
const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true } as const;

/** K 线数组输出 schema（与业务 Kline 字段对应，本域 market_klines 专用） */
const klinesOutputSchema = z.object({
  data: z.array(
    z.object({
      openTime: z.number(),
      open: z.number(),
      high: z.number(),
      low: z.number(),
      close: z.number(),
      volume: z.number(),
      closeTime: z.number(),
      quoteVolume: z.number(),
      trades: z.number(),
      takerBuyVolume: z.number(),
      takerQuoteVolume: z.number(),
    }),
  ),
});

/**
 * 组装全部行情工具定义
 *
 * @param ctx - 工具上下文（提供行情服务与配置）
 * @returns 行情工具定义列表；非主网（测试网 / demo）时排除情绪类端点
 */
export function buildMarketToolDefs(ctx: ToolContext): ToolDef[] {
  const market = ctx.market;
  const isMainnet = !ctx.config.testnet && !ctx.config.demoTrading;

  const defs: ToolDef[] = [
    {
      name: "market_ping",
      title: "连通性测试",
      description:
        "测试与币安交易所 REST API 的连通性。无需参数，成功返回 { ok: true }。",
      schema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      annotations: READ_ANNOTATIONS,
      handler: () => market.ping(),
    },
    {
      name: "market_time",
      title: "服务器时钟",
      description:
        "获取币安交易所服务器时间（毫秒时间戳），用于时钟同步与签名校验。",
      schema: z.object({}),
      outputSchema: z.object({ serverTime: z.number() }),
      annotations: READ_ANNOTATIONS,
      handler: () => market.getServerTime(),
    },
    {
      name: "market_price",
      title: "最新成交价",
      description:
        "获取交易对最新成交价。返回 symbol 与 price（number 类型）。",
      schema: z.object({ symbol: symbolSchema }),
      outputSchema: z.object({ symbol: z.string(), price: z.number() }),
      annotations: READ_ANNOTATIONS,
      handler: (args) => market.getSymbolPrice(String(args.symbol)),
    },
    {
      name: "market_book_ticker",
      title: "最优买卖报价",
      description:
        "获取最优买/卖价与数量（比订单簿轻量）。缺省 symbol 返回全市场（weight 高，慎用）。",
      schema: z.object({ symbol: symbolSchema.optional() }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.getBookTicker(args.symbol !== undefined ? String(args.symbol) : undefined),
    },
    {
      name: "market_orderbook",
      title: "订单簿深度",
      description:
        "获取指定交易对的买卖盘快照。limit 合法值 5/10/20/50/100/500/1000。",
      schema: z.object({
        symbol: symbolSchema,
        // 官方端点仅接受离散档位，非法值直接被 schema 拦截
        limit: z
          .number()
          .int()
          .refine(
            (v) => ORDERBOOK_VALID_LIMITS.includes(v),
            "订单簿档位合法值：5/10/20/50/100/500/1000",
          )
          .default(ORDERBOOK_DEFAULT_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.getOrderBook(String(args.symbol), numberParam(args.limit, ORDERBOOK_DEFAULT_LIMIT)),
    },
    {
      name: "market_klines",
      title: "K 线历史",
      description:
        "获取指定交易对与周期的 K 线（含 OHLCV 与成交信息），支持时间范围过滤。",
      schema: z.object({
        symbol: symbolSchema,
        interval: klineIntervalSchema,
        limit: limitSchema(MARKET_KLINE_DEFAULT_LIMIT, 1, KLINE_MAX_LIMIT),
        startTime: z.number().int().optional(),
        endTime: z.number().int().optional(),
      }),
      outputSchema: klinesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.getKlines({
          symbol: String(args.symbol),
          interval: args.interval as KlineInterval,
          limit: numberParam(args.limit, MARKET_KLINE_DEFAULT_LIMIT),
          ...(args.startTime !== undefined ? { startTime: Number(args.startTime) } : {}),
          ...(args.endTime !== undefined ? { endTime: Number(args.endTime) } : {}),
        }),
    },
    {
      name: "market_24hr_ticker",
      title: "24h 行情统计",
      description:
        "获取 24h 滚动统计（涨跌幅/高低价/成交量额）。缺省 symbol 返回全市场（weight 高，慎用）。",
      schema: z.object({ symbol: symbolSchema.optional() }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.get24hrTicker(args.symbol !== undefined ? String(args.symbol) : undefined),
    },
    {
      name: "market_mark_price",
      title: "标记价",
      description:
        "获取标记价、指数价与资金费率信息。查单交易对资金费率数值（lastFundingRate + nextFundingTime）首选本工具。缺省 symbol 返回全市场（weight 高，慎用）。",
      schema: z.object({ symbol: symbolSchema.optional() }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.getMarkPrice(args.symbol !== undefined ? String(args.symbol) : undefined),
    },
    {
      name: "market_open_interest",
      title: "未平仓量",
      description:
        "获取指定交易对当前未平仓量。",
      schema: z.object({ symbol: symbolSchema }),
      outputSchema: z.object({
        symbol: z.string(),
        openInterest: z.number(),
        time: z.number(),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) => market.getOpenInterest(String(args.symbol)),
    },
    {
      name: "market_funding_rate",
      title: "资金费率规则",
      description:
        "获取全市场资金费率规则（各币种费率上下限与结算间隔，无 symbol 过滤，weight 高慎用）。查单交易对当前费率数值请用 market_mark_price。",
      schema: z.object({}),
      annotations: READ_ANNOTATIONS,
      handler: () => market.getFundingRateInfo(),
    },
    {
      name: "market_funding_rate_history",
      title: "历史资金费率",
      description:
        "获取指定交易对的历史资金费率记录。",
      schema: z.object({
        symbol: symbolSchema.optional(),
        limit: limitSchema(FUNDING_HISTORY_DEFAULT_LIMIT, 1, FUNDING_HISTORY_MAX_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.getFundingRateHistory(
          args.symbol !== undefined ? String(args.symbol) : undefined,
          numberParam(args.limit, FUNDING_HISTORY_DEFAULT_LIMIT),
        ),
    },
    {
      name: "market_continuous_klines",
      title: "连续合约 K 线",
      description:
        "获取连续合约（如季度/永续）的 K 线。",
      schema: z.object({
        pair: symbolSchema,
        contractType: contractTypeSchema,
        interval: klineIntervalSchema,
        limit: limitSchema(CONTINUOUS_KLINE_DEFAULT_LIMIT, 1, KLINE_MAX_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.getContinuousKlines(
          String(args.pair),
          args.contractType as ContractType,
          args.interval as KlineInterval,
          numberParam(args.limit, CONTINUOUS_KLINE_DEFAULT_LIMIT),
        ),
    },
    {
      name: "market_exchange_info",
      title: "交易规则",
      description:
        "获取交易对精度规格（价格/数量小数位、tickSize、stepSize、最小名义价值）。缺省返回全市场（数据量大，慎用）。",
      schema: z.object({ symbol: symbolSchema.optional() }),
      annotations: READ_ANNOTATIONS,
      handler: async (args) => {
        if (args.symbol !== undefined) return market.getSymbolSpec(String(args.symbol));
        // 全市场：Map 转为数组便于 JSON 序列化
        const specs = await market.getSymbolSpecs();
        return Array.from(specs.values());
      },
    },
  ];

  // 情绪类端点（14-17）仅主网可用，非主网（测试网 / demo）跳过
  if (isMainnet) {
    defs.push({
      name: "market_open_interest_hist",
      title: "历史未平仓量",
      description:
        "获取指定交易对的历史 OI 统计（仅主网可用）。",
      schema: z.object({
        symbol: symbolSchema,
        period: statsPeriodSchema,
        limit: limitSchema(SENTIMENT_DEFAULT_LIMIT, 1, SENTIMENT_MAX_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.getOpenInterestHist(
          String(args.symbol),
          args.period as StatsPeriod,
          numberParam(args.limit, SENTIMENT_DEFAULT_LIMIT),
        ),
    });
    defs.push({
      name: "market_long_short_ratio",
      title: "多空比",
      description:
        "获取指定交易对的多空账户数比（仅主网可用）。",
      schema: z.object({
        symbol: symbolSchema,
        period: statsPeriodSchema,
        limit: limitSchema(SENTIMENT_DEFAULT_LIMIT, 1, SENTIMENT_MAX_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.getLongShortRatio(
          String(args.symbol),
          args.period as StatsPeriod,
          numberParam(args.limit, SENTIMENT_DEFAULT_LIMIT),
        ),
    });
    defs.push({
      name: "market_taker_volume",
      title: "主动买卖量",
      description:
        "获取主动买入/卖出量及买卖比（仅主网可用）。",
      schema: z.object({
        symbol: symbolSchema,
        period: statsPeriodSchema,
        limit: limitSchema(SENTIMENT_DEFAULT_LIMIT, 1, SENTIMENT_MAX_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.getTakerVolume(
          String(args.symbol),
          args.period as StatsPeriod,
          numberParam(args.limit, SENTIMENT_DEFAULT_LIMIT),
        ),
    });
    defs.push({
      name: "market_top_trader_ratio",
      title: "大户持仓比",
      description:
        "获取大户多空持仓比（仅主网可用）。",
      schema: z.object({
        symbol: symbolSchema,
        period: statsPeriodSchema,
        limit: limitSchema(SENTIMENT_DEFAULT_LIMIT, 1, SENTIMENT_MAX_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        market.getTopTraderRatio(
          String(args.symbol),
          args.period as StatsPeriod,
          numberParam(args.limit, SENTIMENT_DEFAULT_LIMIT),
        ),
    });
  }

  return defs;
}
