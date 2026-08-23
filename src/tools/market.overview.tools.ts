/**
 * 工具定义 — 行情快照（market_overview）
 *
 * 一次调用聚合单个交易对的完整分析数据：行情 / 流动性 / 资金 / 情绪 / 指标 / 派生量。
 * 服务端并行拉取全部端点，AI 拿到结构化快照后直接解读，无需多次往返。
 *
 * 设计约定：
 * - 非主网（测试网 / demo）跳过主网专属情绪端点（OI 历史 / 多空比 / 主动买卖 / 大户持仓比）
 * - 任一端点失败仅将该字段置 null 并记录到 meta.completeness，不中断整包
 * - 派生量（区间涨跌幅 / 成交量 / 点差 / OI 变化）本地计算，避免额外请求
 * - 指标层由快照 K 线本地计算，预热不足逐指标降级为 null
 *
 * @module tools/market-overview
 */

import type { BandsResult, MACDResult, SuperTrendResult } from "trading-signals";
import { z } from "zod/v4";
import {
  ADX_PERIOD,
  ATR_PERIOD,
  BOLLINGER_MULTIPLIER,
  BOLLINGER_PERIOD,
  KLINE_DEFAULT_LIMIT,
  MACD_FAST,
  MACD_SIGNAL,
  MACD_SLOW,
  MARKET_OVERVIEW_BOOK_DEPTH,
  MARKET_OVERVIEW_DEFAULT_INTERVAL,
  MARKET_OVERVIEW_HISTORY_N,
  MARKET_OVERVIEW_LIMIT_MAX,
  MARKET_OVERVIEW_LIMIT_MIN,
  MARKET_OVERVIEW_RECENT_N,
  MARKET_OVERVIEW_SENTIMENT_PERIOD,
  PERCENT_SCALE,
  RSI_PERIOD,
  SPREAD_PRECISION,
  SUPER_TREND_MULTIPLIER,
  SUPER_TREND_PERIOD,
} from "../constants/index.js";
import type { Kline, KlineInterval } from "../exchange/types.js";
import {
  averageDirectionalIndex,
  averageTrueRange,
  bollingerBands,
  latestOf,
  macd,
  relativeStrengthIndex,
  superTrend,
} from "../indicators/index.js";
import type { SeriesResult } from "../indicators/index.js";
import { klineIntervalSchema, limitSchema, symbolSchema } from "../mcp/schema.js";
import type { ToolDef } from "../mcp/types.js";
import { numberParam } from "../utils/args.js";
import { roundValue } from "../utils/format.js";
import { toCloses, toHlcRows } from "../utils/klines.js";
import type { ToolContext } from "./index.js";

/** 只读 + 外部世界注解 */
const READ_ANNOTATIONS = { readOnlyHint: true, openWorldHint: true } as const;

/** 快照六段完整输出 schema（本地聚合形状确定，可空字段全量 nullable） */
const overviewOutputSchema = z.object({
  meta: z.object({
    symbol: z.string(),
    interval: z.string(),
    limit: z.number(),
    generatedAt: z.number(),
    environment: z.enum(["mainnet", "testnet", "demo"]),
    completeness: z.object({
      klines: z.boolean(),
      ticker: z.boolean(),
      lastPrice: z.boolean(),
      markPrice: z.boolean(),
      openInterest: z.boolean(),
      bookTicker: z.boolean(),
      orderbook: z.boolean(),
      fundingHistory: z.boolean(),
      sentiment: z.boolean(),
    }),
  }),
  price: z.object({
    lastPrice: z.number().nullable(),
    markPrice: z.number().nullable(),
    indexPrice: z.number().nullable(),
    changePercent: z.number().nullable(),
    highPrice: z.number().nullable(),
    lowPrice: z.number().nullable(),
    volume: z.number().nullable(),
    quoteVolume: z.number().nullable(),
  }),
  candles: z.array(
    z.object({
      openTime: z.number(),
      open: z.number(),
      high: z.number(),
      low: z.number(),
      close: z.number(),
      volume: z.number(),
    }),
  ),
  liquidity: z.object({
    bidPrice: z.number().nullable(),
    bidQty: z.number().nullable(),
    askPrice: z.number().nullable(),
    askQty: z.number().nullable(),
    spread: z.number().nullable(),
    spreadPercent: z.number().nullable(),
    bids: z.array(z.tuple([z.number(), z.number()])),
    asks: z.array(z.tuple([z.number(), z.number()])),
  }),
  capital: z.object({
    openInterest: z.number().nullable(),
    fundingRate: z.number().nullable(),
    fundingHistory: z.array(
      z.object({ fundingRate: z.number(), fundingTime: z.number() }),
    ),
    oiHist: z
      .array(
        z.object({
          sumOpenInterest: z.number(),
          sumOpenInterestValue: z.number(),
          timestamp: z.number(),
        }),
      )
      .nullable(),
  }),
  sentiment: z
    .object({
      longShortRatio: z
        .array(
          z.object({
            longShortRatio: z.number(),
            longAccount: z.number(),
            shortAccount: z.number(),
            timestamp: z.number(),
          }),
        )
        .nullable(),
      takerVolume: z
        .array(
          z.object({
            buySellRatio: z.number(),
            buyVol: z.number(),
            sellVol: z.number(),
            timestamp: z.number(),
          }),
        )
        .nullable(),
      topTraderRatio: z
        .array(z.object({ longShortRatio: z.number(), timestamp: z.number() }))
        .nullable(),
    })
    .nullable(),
  indicators: z.object({
    rsi: z.object({ latest: z.number().nullable(), recent: z.array(z.number()) }),
    atr: z.object({ latest: z.number().nullable(), recent: z.array(z.number()) }),
    adx: z.object({ latest: z.number().nullable(), recent: z.array(z.number()) }),
    macd: z.object({
      latest: z
        .object({ macd: z.number(), signal: z.number(), histogram: z.number() })
        .nullable(),
      recent: z.array(
        z.object({ macd: z.number(), signal: z.number(), histogram: z.number() }),
      ),
    }),
    bollinger: z.object({
      latest: z
        .object({ lower: z.number(), middle: z.number(), upper: z.number() })
        .nullable(),
      recent: z.array(
        z.object({ lower: z.number(), middle: z.number(), upper: z.number() }),
      ),
    }),
    superTrend: z.object({
      latest: z
        .object({ supertrend: z.number(), trend: z.enum(["BULLISH", "BEARISH"]) })
        .nullable(),
      recent: z.array(
        z.object({ supertrend: z.number(), trend: z.enum(["BULLISH", "BEARISH"]) }),
      ),
    }),
  }),
  derived: z.object({
    windowChangePercent: z.number().nullable(),
    windowVolume: z.number().nullable(),
    avgVolume: z.number().nullable(),
    oiChangePercent: z.number().nullable(),
  }),
});

/** 安全包装：端点失败仅记录错误，不中断聚合 */
type SafeResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function safe<T>(fn: () => Promise<T>): Promise<SafeResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 将 K 线压缩为轻量 OHLCV（供 AI 直接读趋势） */
function compactCandles(klines: Kline[]): {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}[] {
  return klines.map((k) => ({
    openTime: k.openTime,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
  }));
}

/** 由最新价与盘口计算点差与深度 */
function buildLiquidity(
  book: { bidPrice: number; bidQty: number; askPrice: number; askQty: number } | null,
  orderbook:
    | { bids: readonly (readonly [number, number])[]; asks: readonly (readonly [number, number])[] }
    | null,
): {
  bidPrice: number | null;
  bidQty: number | null;
  askPrice: number | null;
  askQty: number | null;
  spread: number | null;
  spreadPercent: number | null;
  bids: readonly (readonly [number, number])[];
  asks: readonly (readonly [number, number])[];
} {
  const bidPrice = book?.bidPrice ?? undefined;
  const askPrice = book?.askPrice ?? undefined;
  let spread: number | null = null;
  let spreadPercent: number | null = null;
  if (bidPrice !== undefined && askPrice !== undefined) {
    spread = roundValue(askPrice - bidPrice, SPREAD_PRECISION);
    const mid = roundValue((askPrice + bidPrice) / 2, SPREAD_PRECISION);
    spreadPercent = mid !== 0 ? roundValue((spread / mid) * PERCENT_SCALE, SPREAD_PRECISION) : null;
  }
  return {
    bidPrice: bidPrice ?? null,
    bidQty: book?.bidQty ?? null,
    askPrice: askPrice ?? null,
    askQty: book?.askQty ?? null,
    spread,
    spreadPercent,
    bids: orderbook?.bids.slice(0, MARKET_OVERVIEW_BOOK_DEPTH) ?? [],
    asks: orderbook?.asks.slice(0, MARKET_OVERVIEW_BOOK_DEPTH) ?? [],
  };
}

/** 将指标运行结果压缩为 { latest, recent }（末位为最新值，附最近 n 项，升序） */
function compactSeries<T>(result: SeriesResult<T>): { latest: T | null; recent: T[] } {
  return {
    latest: latestOf(result),
    recent: result.series.slice(-MARKET_OVERVIEW_RECENT_N),
  };
}

/** 由 K 线计算六指标 compact 视图（K 线为空 / 预热不足时逐指标独立降级为 null） */
function computeIndicators(klines: readonly Kline[]): {
  rsi: { latest: number | null; recent: number[] };
  atr: { latest: number | null; recent: number[] };
  adx: { latest: number | null; recent: number[] };
  macd: { latest: MACDResult | null; recent: MACDResult[] };
  bollinger: { latest: BandsResult | null; recent: BandsResult[] };
  superTrend: { latest: SuperTrendResult | null; recent: SuperTrendResult[] };
} {
  const closes = toCloses(klines);
  const hlc = toHlcRows(klines);
  return {
    rsi: compactSeries(relativeStrengthIndex(closes, RSI_PERIOD)),
    atr: compactSeries(averageTrueRange(hlc, ATR_PERIOD)),
    adx: compactSeries(averageDirectionalIndex(hlc, ADX_PERIOD)),
    macd: compactSeries(macd(closes, MACD_FAST, MACD_SLOW, MACD_SIGNAL)),
    bollinger: compactSeries(bollingerBands(closes, BOLLINGER_PERIOD, BOLLINGER_MULTIPLIER)),
    superTrend: compactSeries(superTrend(hlc, SUPER_TREND_PERIOD, SUPER_TREND_MULTIPLIER)),
  };
}

/** 由 K 线与 OI 历史计算派生量 */
function computeDerived(
  klines: Kline[],
  oiHist: { sumOpenInterest: number }[] | null,
): {
  windowChangePercent: number | null;
  windowVolume: number | null;
  avgVolume: number | null;
  oiChangePercent: number | null;
} {
  let windowChangePercent: number | null = null;
  let windowVolume: number | null = null;
  let avgVolume: number | null = null;
  if (klines.length >= 2) {
    const firstClose = klines[0].close;
    const lastClose = klines[klines.length - 1].close;
    windowChangePercent =
      firstClose !== 0 ? ((lastClose - firstClose) / firstClose) * PERCENT_SCALE : null;
    windowVolume = klines.reduce((sum, k) => sum + k.volume, 0);
    avgVolume = windowVolume / klines.length;
  }
  let oiChangePercent: number | null = null;
  if (oiHist && oiHist.length >= 2) {
    const first = oiHist[0].sumOpenInterest;
    const last = oiHist[oiHist.length - 1].sumOpenInterest;
    oiChangePercent = first !== 0 ? ((last - first) / first) * PERCENT_SCALE : null;
  }
  return { windowChangePercent, windowVolume, avgVolume, oiChangePercent };
}

/** 当前接入环境：主网 / 测试网 / demo（与配置层环境推导一致） */
type Environment = "mainnet" | "testnet" | "demo";

/** 聚合参数 */
interface OverviewParams {
  market: ToolContext["market"];
  symbol: string;
  interval: KlineInterval;
  limit: number;
  environment: Environment;
}

/**
 * 组装市场快照响应
 *
 * @param p - 聚合参数
 * @returns 分层聚合的市场快照
 */
async function buildOverview({ market, symbol, interval, limit, environment }: OverviewParams) {
  const generatedAt = Date.now();

  // 第一段：并行拉取基础行情（含资金与流动性）。
  // lastPrice 由 ticker / markPrice 兜底提供，故不再单独调 getSymbolPrice（减少一次往返）。
  const [klinesR, tickerR, markR, oiR, bookR, orderbookR, fundingR] = await Promise.all([
    safe(() => market.getKlines({ symbol, interval, limit })),
    safe(() => market.get24hrTicker(symbol)),
    safe(() => market.getMarkPrice(symbol)),
    safe(() => market.getOpenInterest(symbol)),
    safe(() => market.getBookTicker(symbol)),
    safe(() => market.getOrderBook(symbol, MARKET_OVERVIEW_BOOK_DEPTH)),
    safe(() => market.getFundingRateHistory(symbol, MARKET_OVERVIEW_HISTORY_N)),
  ]);

  const klines = klinesR.ok ? klinesR.value : [];
  const ticker = tickerR.ok ? tickerR.value[0] ?? null : null;
  const mark = markR.ok ? markR.value[0] ?? null : null;
  const oi = oiR.ok ? oiR.value : null;
  const book = bookR.ok ? bookR.value[0] ?? null : null;
  const orderbook = orderbookR.ok ? orderbookR.value : null;
  const fundingHistory = fundingR.ok ? fundingR.value : [];
  // 最新价优先取 24h 快照，缺省回退到标记价
  const lastPrice = ticker?.lastPrice ?? mark?.markPrice ?? null;

  // 第二段：主网专属情绪端点并行（非主网服务端不提供，直接跳过）
  let sentiment: {
    longShortRatio: {
      longShortRatio: number;
      longAccount: number;
      shortAccount: number;
      timestamp: number;
    }[] | null;
    takerVolume: { buySellRatio: number; buyVol: number; sellVol: number; timestamp: number }[] | null;
    topTraderRatio: { longShortRatio: number; timestamp: number }[] | null;
  } | null = null;
  let oiHist: { sumOpenInterest: number; sumOpenInterestValue: number; timestamp: number }[] | null =
    null;
  if (environment === "mainnet") {
    const [lsrR, takerR, topR, oiHistR] = await Promise.all([
      safe(() => market.getLongShortRatio(symbol, MARKET_OVERVIEW_SENTIMENT_PERIOD, MARKET_OVERVIEW_HISTORY_N)),
      safe(() => market.getTakerVolume(symbol, MARKET_OVERVIEW_SENTIMENT_PERIOD, MARKET_OVERVIEW_HISTORY_N)),
      safe(() => market.getTopTraderRatio(symbol, MARKET_OVERVIEW_SENTIMENT_PERIOD, MARKET_OVERVIEW_HISTORY_N)),
      safe(() => market.getOpenInterestHist(symbol, MARKET_OVERVIEW_SENTIMENT_PERIOD, MARKET_OVERVIEW_HISTORY_N)),
    ]);
    sentiment = {
      longShortRatio: lsrR.ok
        ? lsrR.value.map((r) => ({
            longShortRatio: r.longShortRatio,
            longAccount: r.longAccount,
            shortAccount: r.shortAccount,
            timestamp: r.timestamp,
          }))
        : null,
      takerVolume: takerR.ok
        ? takerR.value.map((t) => ({
            buySellRatio: t.buySellRatio,
            buyVol: t.buyVol,
            sellVol: t.sellVol,
            timestamp: t.timestamp,
          }))
        : null,
      topTraderRatio: topR.ok
        ? topR.value.map((t) => ({ longShortRatio: t.longShortRatio, timestamp: t.timestamp }))
        : null,
    };
    oiHist = oiHistR.ok
      ? oiHistR.value.map((o) => ({
          sumOpenInterest: o.sumOpenInterest,
          sumOpenInterestValue: o.sumOpenInterestValue,
          timestamp: o.timestamp,
        }))
      : null;
  }

  // 第三段：派生量与指标计算（指标为纯本地计算，随 klines 降级为 null）
  const indicators = computeIndicators(klines);
  const derived = computeDerived(klines, oiHist);
  const latestFunding = fundingHistory[fundingHistory.length - 1] ?? null;

  return {
    meta: {
      symbol,
      interval,
      limit,
      generatedAt,
      environment,
      completeness: {
        klines: klinesR.ok,
        ticker: tickerR.ok,
        // 最新价由 ticker / markPrice 派生，不再独立请求
        lastPrice: lastPrice !== null,
        markPrice: markR.ok,
        openInterest: oiR.ok,
        bookTicker: bookR.ok,
        orderbook: orderbookR.ok,
        fundingHistory: fundingR.ok,
        sentiment: sentiment !== null,
      },
    },
    price: {
      lastPrice,
      markPrice: mark?.markPrice ?? null,
      indexPrice: mark?.indexPrice ?? null,
      changePercent: ticker?.priceChangePercent ?? null,
      highPrice: ticker?.highPrice ?? null,
      lowPrice: ticker?.lowPrice ?? null,
      volume: ticker?.volume ?? null,
      quoteVolume: ticker?.quoteVolume ?? null,
    },
    candles: compactCandles(klines),
    liquidity: buildLiquidity(book, orderbook),
    capital: {
      openInterest: oi?.openInterest ?? null,
      // 优先取当前周期费率（mark.lastFundingRate），缺省回退到最近一期已结算费率
      fundingRate: mark?.fundingRate ?? latestFunding?.fundingRate ?? null,
      fundingHistory: fundingHistory.slice(-MARKET_OVERVIEW_HISTORY_N).map((f) => ({
        fundingRate: f.fundingRate,
        fundingTime: f.fundingTime,
      })),
      oiHist,
    },
    sentiment,
    indicators,
    derived,
  };
}

/**
 * 组装市场快照工具定义
 *
 * @param ctx - 工具上下文（提供行情服务与配置）
 * @returns 市场快照工具定义
 */
export function buildMarketOverviewToolDef(ctx: ToolContext): ToolDef {
  // demo 优先于 testnet 判定（配置层二者互斥），与启动摘要的环境口径一致
  const environment: Environment = ctx.config.demoTrading
    ? "demo"
    : ctx.config.testnet
      ? "testnet"
      : "mainnet";
  return {
    name: "market_overview",
    title: "市场快照",
    description:
      "一次返回单个交易对的完整分析数据（行情/流动性/资金/情绪/指标/派生量），供 AI 直接解读并给出分析结论。",
    schema: z.object({
      symbol: symbolSchema,
      interval: klineIntervalSchema.default(MARKET_OVERVIEW_DEFAULT_INTERVAL),
      limit: limitSchema(KLINE_DEFAULT_LIMIT, MARKET_OVERVIEW_LIMIT_MIN, MARKET_OVERVIEW_LIMIT_MAX),
    }),
    outputSchema: overviewOutputSchema,
    annotations: READ_ANNOTATIONS,
    handler: (args) =>
      buildOverview({
        market: ctx.market,
        symbol: String(args.symbol),
        interval: args.interval as KlineInterval,
        limit: numberParam(args.limit, KLINE_DEFAULT_LIMIT),
        environment,
      }),
    // 快照数据量大，content 只给关键行情摘要，全量走 structuredContent
    summarize: (result) => {
      const snap = result as {
        meta?: {
          symbol?: unknown;
          interval?: unknown;
          generatedAt?: unknown;
          environment?: unknown;
        };
        price?: Record<string, unknown>;
        capital?: { fundingRate?: number };
        indicators?: { rsi?: { latest?: number } };
      };
      const meta = snap.meta ?? {};
      const price = snap.price ?? {};
      return [
        `symbol=${String(meta.symbol ?? "")}`,
        `interval=${String(meta.interval ?? "")}`,
        `lastPrice=${String(price.lastPrice ?? "")}`,
        `changePercent=${String(price.changePercent ?? "")}%`,
        `RSI=${String(snap.indicators?.rsi?.latest ?? "")}`,
        `fundingRate=${String(snap.capital?.fundingRate ?? "")}`,
        `environment=${String(meta.environment ?? "")}`,
        `generatedAt=${String(meta.generatedAt ?? "")}`,
      ].join(" ");
    },
  };
}
