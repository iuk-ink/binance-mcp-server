/**
 * 工具层单元测试
 *
 * 覆盖各域工具数量、域过滤聚合，以及直连工具 handler（使用伪造行情服务，不触网）。
 *
 * @module tools/__tests__/tools
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { BinanceConfig } from "../../config/schema.js";
import type { Kline } from "../../exchange/types.js";
import type { AccountService } from "../../exchange/account.js";
import type { MarketService } from "../../exchange/market.js";
import type { TradeService } from "../../exchange/trade.js";
import { buildAnalysisToolDefs } from "../analysis.tools.js";
import { buildIndicatorToolDefs } from "../indicator.tools.js";
import { buildMarketOverviewToolDef } from "../market.overview.tools.js";
import { buildMarketToolDefs } from "../market.tools.js";
import { buildTradingToolDefs } from "../trading.tools.js";
import { buildToolDefs } from "../index.js";
import type { ToolContext } from "../index.js";

/** 生成合成 K 线（单调上升，高/低于收盘波动） */
function makeKlines(count: number): Kline[] {
  return Array.from({ length: count }, (_, i) => ({
    openTime: i * 60_000,
    open: 100 + i,
    high: 100 + i + 2,
    low: 100 + i - 2,
    close: 100 + i,
    volume: 1000 + i * 10,
    closeTime: i * 60_000 + 59_999,
    quoteVolume: 100_000 + i * 1_000,
    trades: 100 + i,
    takerBuyVolume: 500 + i * 5,
    takerQuoteVolume: 50_000 + i * 500,
  }));
}

/**
 * 构造工具上下文（伪造行情服务）
 *
 * @param overrides - 部分覆盖字段（如 testnet / enabledToolDomains）
 * @returns 工具上下文
 */
function fakeContext(overrides?: Partial<ToolContext>): ToolContext {
  const config = {
    testnet: true,
    demoTrading: false,
    enabledToolDomains: ["market", "trading", "indicator", "analysis"],
  } as unknown as BinanceConfig;
  const market = {
    getKlines: async ({ limit }: { limit: number }): Promise<Kline[]> => makeKlines(limit),
  } as unknown as MarketService;
  return { config, market, ...overrides };
}

/** 从上下文构造完整配置（覆盖 testnet） */
function contextWithTestnet(testnet: boolean): ToolContext {
  return fakeContext({
    config: {
      testnet,
      demoTrading: false,
      enabledToolDomains: ["market", "trading", "indicator", "analysis"],
    } as unknown as BinanceConfig,
  });
}

/** 构造主网上下文（供 market_overview 情绪分支测试） */
function mainnetContext(market: MarketService): ToolContext {
  return {
    config: {
      testnet: false,
      demoTrading: false,
      enabledToolDomains: ["market", "trading"],
    } as unknown as BinanceConfig,
    market,
  };
}

/** 构造全端点伪造行情服务（覆盖 market_overview 全部拉取端点） */
function fakeFullMarket(): MarketService {
  return {
    getKlines: async ({ limit }: { limit: number }) => makeKlines(limit),
    get24hrTicker: async () => [
      {
        symbol: "BTCUSDT",
        lastPrice: 100,
        priceChangePercent: 1,
        highPrice: 110,
        lowPrice: 90,
        volume: 10,
        quoteVolume: 1000,
        weightedAvgPrice: 100,
        count: 5,
        openPrice: 99,
      },
    ],
    getMarkPrice: async () => [
      { symbol: "BTCUSDT", markPrice: 100, fundingRate: 0.0001, indexPrice: 100 },
    ],
    getOpenInterest: async () => ({ symbol: "BTCUSDT", openInterest: 500, time: 1 }),
    getBookTicker: async () => [
      { symbol: "BTCUSDT", bidPrice: 99.9, bidQty: 1, askPrice: 100.1, askQty: 2 },
    ],
    getOrderBook: async () => ({ lastUpdateId: 1, bids: [[99.9, 1]], asks: [[100.1, 2]] }),
    getFundingRateHistory: async () => [
      { symbol: "BTCUSDT", fundingRate: 0.0001, fundingTime: 1, markPrice: 100 },
    ],
    getLongShortRatio: async () => [
      { symbol: "BTCUSDT", longShortRatio: 1.2, longAccount: 0.545, shortAccount: 0.455, timestamp: 1 },
    ],
    getTakerVolume: async () => [
      { symbol: "BTCUSDT", buySellRatio: 1.1, buyVol: 11, sellVol: 10, timestamp: 1 },
    ],
    getTopTraderRatio: async () => [
      { symbol: "BTCUSDT", longShortRatio: 1.3, longAccount: 0.565, shortAccount: 0.435, timestamp: 1 },
    ],
    getOpenInterestHist: async () => [
      { symbol: "BTCUSDT", sumOpenInterest: 500, sumOpenInterestValue: 50000, timestamp: 1 },
    ],
  } as unknown as MarketService;
}

describe("工具数量", () => {
  test("market 域：测试网 13 个（跳过 4 个情绪端点）", () => {
    const names = buildMarketToolDefs(contextWithTestnet(true)).map((d) => d.name);
    assert.equal(names.length, 13);
    assert.ok(!names.includes("market_open_interest_hist"));
    assert.ok(!names.includes("market_long_short_ratio"));
    assert.ok(!names.includes("market_taker_volume"));
    assert.ok(!names.includes("market_top_trader_ratio"));
    assert.ok(names.includes("market_ping"));
  });

  test("market 域：主网 17 个（含情绪端点）", () => {
    const names = buildMarketToolDefs(contextWithTestnet(false)).map((d) => d.name);
    assert.equal(names.length, 17);
    assert.ok(names.includes("market_open_interest_hist"));
    assert.ok(names.includes("market_long_short_ratio"));
  });

  test("market 域：demo 环境 13 个（跳过 4 个情绪端点）", () => {
    const ctx = fakeContext({
      config: {
        testnet: false,
        demoTrading: true,
        enabledToolDomains: ["market", "trading"],
      } as unknown as BinanceConfig,
    });
    const names = buildMarketToolDefs(ctx).map((d) => d.name);
    assert.equal(names.length, 13);
    assert.ok(!names.includes("market_open_interest_hist"));
    assert.ok(!names.includes("market_long_short_ratio"));
    assert.ok(!names.includes("market_taker_volume"));
    assert.ok(!names.includes("market_top_trader_ratio"));
  });

  test("market_overview 为独立快照工具", () => {
    const def = buildMarketOverviewToolDef(fakeContext());
    assert.equal(def.name, "market_overview");
    assert.ok(def.annotations?.readOnlyHint);
  });

  test("indicator 域：19 个（裁剪 4 个不注册）", () => {
    const names = buildIndicatorToolDefs(fakeContext()).map((d) => d.name);
    assert.equal(names.length, 19);
    for (const absent of [
      "indicator_keltner",
      "indicator_stoch_rsi",
      "indicator_psar",
      "indicator_ichimoku",
    ]) {
      assert.ok(!names.includes(absent), `不应包含 ${absent}`);
    }
    for (const expected of [
      "indicator_sma",
      "indicator_rsi",
      "indicator_macd",
      "indicator_stoch",
      "indicator_super_trend",
      "indicator_divergence",
      "indicator_volatility_regime",
      "indicator_multi",
    ]) {
      assert.ok(names.includes(expected), `应包含 ${expected}`);
    }
  });

  test("trading 域：21 个", () => {
    const names = buildTradingToolDefs(
      fakeContext({
        account: {} as unknown as AccountService,
        trade: {} as unknown as TradeService,
      }),
    ).map((d) => d.name);
    assert.equal(names.length, 21);
    assert.ok(names.includes("trading_place_order"));
    assert.ok(names.includes("trading_cancel_algo"));
  });

  test("trading 域：服务缺失时返回空", () => {
    assert.deepEqual(buildTradingToolDefs(fakeContext()), []);
  });
});

describe("域过滤聚合", () => {
  test("全部域（无凭证，测试网）注册 36 个公开工具", () => {
    const names = buildToolDefs(fakeContext()).map((d) => d.name);
    // 13 market + 1 overview + 19 indicator + 3 analysis
    assert.equal(names.length, 36);
    assert.ok(!names.includes("trading_balance"), "无凭证时不注册交易工具");
  });

  test("仅 trading 域时只注册交易工具（无凭证为空）", () => {
    const ctx = fakeContext({
      config: {
        testnet: true,
        demoTrading: false,
        enabledToolDomains: ["trading"],
      } as unknown as BinanceConfig,
    });
    const names = buildToolDefs(ctx).map((d) => d.name);
    assert.deepEqual(names, [], "无凭证时 trading 域不注册任何工具");
  });

  test("有凭证（测试网）时额外注册 21 个交易工具", () => {
    const ctx = fakeContext({
      account: {} as unknown as AccountService,
      trade: {} as unknown as TradeService,
    });
    const names = buildToolDefs(ctx).map((d) => d.name);
    // 36 公开 + 21 交易
    assert.equal(names.length, 57);
    assert.ok(names.includes("trading_balance"));
  });
});

describe("直连工具 handler（伪造行情，不触网）", () => {
  test("market_klines 返回 K 线数组", async () => {
    const def = buildMarketToolDefs(fakeContext()).find((d) => d.name === "market_klines");
    assert.ok(def);
    const result = (await def.handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 100,
    })) as Kline[];
    assert.ok(Array.isArray(result) && result.length > 0);
    assert.equal(result[0].close, 100);
  });

  test("market_overview 返回分层快照", async () => {
    const def = buildMarketOverviewToolDef(fakeContext());
    assert.ok(def);
    const result = (await def.handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 100,
    })) as {
      meta?: { symbol?: string; environment?: string };
      price?: { lastPrice?: number | null };
      candles?: unknown[];
    };
    assert.equal(result.meta?.symbol, "BTCUSDT");
    assert.equal(result.meta?.environment, "testnet");
    assert.ok(Array.isArray(result.candles) && result.candles.length > 0);
  });

  test("market_overview 主网返回情绪与 OI 历史映射", async () => {
    const def = buildMarketOverviewToolDef(mainnetContext(fakeFullMarket()));
    assert.ok(def);
    const result = (await def.handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 100,
    })) as {
      meta?: { environment?: string; completeness?: { sentiment?: boolean } };
      sentiment?: {
        longShortRatio?: { longAccount?: number }[];
        takerVolume?: { buySellRatio?: number }[];
        topTraderRatio?: { longShortRatio?: number }[];
      } | null;
      capital?: { oiHist?: { sumOpenInterest?: number }[] | null };
    };
    assert.equal(result.meta?.environment, "mainnet");
    assert.equal(result.meta?.completeness?.sentiment, true);
    assert.equal(result.sentiment?.longShortRatio?.[0]?.longAccount, 0.545);
    assert.equal(result.sentiment?.takerVolume?.[0]?.buySellRatio, 1.1);
    assert.equal(result.sentiment?.topTraderRatio?.[0]?.longShortRatio, 1.3);
    assert.equal(result.capital?.oiHist?.[0]?.sumOpenInterest, 500);
  });

  test("market_overview 非主网情绪为 null", async () => {
    const result = (await buildMarketOverviewToolDef(fakeContext()).handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 100,
    })) as { sentiment?: unknown };
    assert.equal(result.sentiment, null, "非主网不应请求情绪端点");
  });

  test("market_overview 摘要包含 meta 关键字段", async () => {
    const def = buildMarketOverviewToolDef(fakeContext());
    assert.ok(def.summarize);
    const result = await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 100 });
    const summary = def.summarize(result);
    assert.ok(summary.includes("symbol=BTCUSDT"), `摘要应含 symbol：${summary}`);
    assert.ok(summary.includes("interval=1h"), `摘要应含 interval：${summary}`);
    assert.ok(summary.includes("environment=testnet"), `摘要应含 environment：${summary}`);
    assert.ok(!summary.includes("symbol= "), `symbol 不应为空：${summary}`);
  });
});

describe("market_overview 指标层", () => {
  test("T1 六指标 compact 结构与升序不变式", async () => {
    const result = (await buildMarketOverviewToolDef(fakeContext()).handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 100,
    })) as {
      indicators?: {
        rsi?: { latest?: number | null; recent?: number[] };
        atr?: { latest?: number | null; recent?: number[] };
        adx?: { latest?: number | null; recent?: number[] };
        macd?: { latest?: unknown; recent?: unknown[] };
        bollinger?: {
          latest?: unknown;
          recent?: { lower?: number; middle?: number; upper?: number }[];
        };
        superTrend?: { latest?: { trend?: string } | null; recent?: unknown[] };
      };
    };
    const indicators = result.indicators ?? {};
    for (const key of ["rsi", "atr", "adx", "macd", "bollinger", "superTrend"]) {
      assert.ok(key in indicators, `缺少指标键：${key}`);
    }
    assert.equal(indicators.rsi?.latest, 100, "单调上升下 RSI 恒为 100");
    assert.equal(indicators.superTrend?.latest?.trend, "BULLISH", "单调上升下 SuperTrend 应为多头");
    for (const band of indicators.bollinger?.recent ?? []) {
      assert.ok(
        (band.lower ?? 0) <= (band.middle ?? 0) && (band.middle ?? 0) <= (band.upper ?? 0),
        `带序错误：${JSON.stringify(band)}`,
      );
    }
    assert.equal(indicators.rsi?.recent?.length, 6);
    assert.equal(indicators.atr?.recent?.length, 6);
    assert.equal(indicators.adx?.recent?.length, 6);
    assert.equal(indicators.macd?.recent?.length, 6);
    assert.equal(indicators.bollinger?.recent?.length, 6);
    assert.equal(indicators.superTrend?.recent?.length, 6);
    const rsiRecent = indicators.rsi?.recent ?? [];
    assert.equal(rsiRecent[rsiRecent.length - 1], indicators.rsi?.latest, "recent 末位应与 latest 一致");
  });

  test("T2 主网分支指标层与情绪层共存", async () => {
    const result = (await buildMarketOverviewToolDef(mainnetContext(fakeFullMarket())).handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 100,
    })) as {
      meta?: { completeness?: { sentiment?: boolean } };
      indicators?: { rsi?: { latest?: number | null } };
    };
    assert.equal(result.indicators?.rsi?.latest, 100);
    assert.equal(result.meta?.completeness?.sentiment, true);
  });

  test("T3 摘要含 RSI 位", async () => {
    const def = buildMarketOverviewToolDef(fakeContext());
    assert.ok(def.summarize);
    const result = await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 100 });
    const summary = def.summarize(result);
    assert.ok(summary.includes("RSI=100"), `摘要应含 RSI=100：${summary}`);
    assert.ok(summary.includes("environment=testnet"), `摘要应含 environment：${summary}`);
  });

  test("T4 K 线数据不足时逐指标降级", async () => {
    const ctx = fakeContext({
      market: { getKlines: async () => makeKlines(10) } as unknown as MarketService,
    });
    const result = (await buildMarketOverviewToolDef(ctx).handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 100,
    })) as {
      meta?: { symbol?: string };
      indicators?: {
        rsi?: { latest?: number | null; recent?: number[] };
        macd?: { latest?: unknown };
        superTrend?: { latest?: unknown };
      };
    };
    assert.equal(result.indicators?.rsi?.latest, null, "RSI 预热需 15 输入 > 10 根，应降级 null");
    assert.equal(result.indicators?.rsi?.recent?.length, 0);
    assert.equal(result.indicators?.macd?.latest, null, "MACD 预热需 26 输入 > 10 根，应降级 null");
    assert.ok(result.indicators?.superTrend?.latest != null, "SuperTrend 预热需 10 输入恰好可用");
    assert.equal(result.meta?.symbol, "BTCUSDT", "降级不应中断整包");
  });

  test("T5 limit 下界 30 与指标预热兼容", async () => {
    const result = (await buildMarketOverviewToolDef(fakeContext()).handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 30,
    })) as {
      indicators?: {
        rsi?: { latest?: number | null; recent?: number[] };
        atr?: { latest?: number | null; recent?: number[] };
        adx?: { latest?: number | null; recent?: number[] };
        macd?: { latest?: unknown; recent?: unknown[] };
        bollinger?: { latest?: unknown; recent?: unknown[] };
        superTrend?: { latest?: unknown; recent?: unknown[] };
      };
    };
    const indicators = result.indicators ?? {};
    assert.ok(indicators.rsi?.latest != null);
    assert.ok(indicators.atr?.latest != null);
    assert.ok(indicators.adx?.latest != null);
    assert.ok(indicators.macd?.latest != null);
    assert.ok(indicators.bollinger?.latest != null);
    assert.ok(indicators.superTrend?.latest != null);
    assert.equal(indicators.adx?.recent?.length, 4, "ADX@30 仅 4 个稳定值，recent 截短");
    assert.equal(indicators.rsi?.recent?.length, 6, "RSI@30 有 16 个稳定值，recent 取满");
  });

  test("E2 单端点失败时整包容错且 completeness 标记降级", async () => {
    // 让 fundingHistory 端点抛错，其余端点正常：应返回整包、该块降级、其余存活
    const market = fakeFullMarket();
    (market as { getFundingRateHistory?: unknown }).getFundingRateHistory = async () => {
      throw new Error("费率历史接口超时");
    };
    const result = (await buildMarketOverviewToolDef(fakeContext({ market })).handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 100,
    })) as {
      meta?: {
        completeness?: Record<string, boolean>;
        error?: string | null;
      };
      indicators?: { rsi?: { latest?: number | null } };
      price?: unknown;
    };
    // 整包仍成功返回（不抛错）
    assert.ok(result, "单个端点失败不应中断整包");
    // 失败端点的 completeness 标记为 false
    assert.equal(result.meta?.completeness?.fundingHistory, false, "fundingHistory 应标记降级");
    // 正常端点仍存活
    assert.equal(result.meta?.completeness?.klines, true, "klines 端点应仍可用");
    assert.equal(result.meta?.completeness?.ticker, true, "ticker 端点应仍可用");
    // 派生指标层仍计算
    assert.equal(result.indicators?.rsi?.latest, 100, "端点失败不应影响指标层派生");
  });
});

describe("market 工具入参校验", () => {
  function marketDef(name: string) {
    return buildMarketToolDefs(fakeContext()).find((d) => d.name === name);
  }

  test("market_orderbook 拒绝区间内但非法的离散档位", () => {
    const def = marketDef("market_orderbook");
    assert.ok(def);
    assert.throws(
      () => def.schema.parse({ symbol: "BTCUSDT", limit: 25 }),
      /订单簿档位合法值/,
    );
  });

  test("market_orderbook 接受合法离散档位", () => {
    const def = marketDef("market_orderbook");
    assert.ok(def);
    const parsed = def.schema.parse({ symbol: "BTCUSDT", limit: 500 }) as { limit: number };
    assert.equal(parsed.limit, 500);
  });

  test("market_orderbook 缺省档位为 20", () => {
    const def = marketDef("market_orderbook");
    assert.ok(def);
    const parsed = def.schema.parse({ symbol: "BTCUSDT" }) as { limit: number };
    assert.equal(parsed.limit, 20);
  });
});

describe("indicator 直连工具（伪造行情，不触网）", () => {
  function indicatorDef(name: string) {
    return buildIndicatorToolDefs(fakeContext()).find((d) => d.name === name);
  }

  test("indicator_rsi 返回数值序列", async () => {
    const def = indicatorDef("indicator_rsi");
    assert.ok(def);
    const result = (await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 200 })) as unknown;
    assert.ok(Array.isArray(result) && result.length > 0);
    assert.ok((result as number[]).every((v) => typeof v === "number"));
  });

  test("indicator_ma_cross 返回合法枚举", async () => {
    const def = indicatorDef("indicator_ma_cross");
    assert.ok(def);
    const result = (await def.handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 200,
    })) as { cross: string; bias: string };
    assert.ok(["golden_cross", "death_cross", "none"].includes(result.cross));
    assert.ok(["bullish", "bearish", "neutral"].includes(result.bias));
  });

  test("indicator_multi 含可选指标且仅单次拉取 K 线", async () => {
    let fetchCount = 0;
    const ctx = fakeContext({
      market: {
        getKlines: async ({ limit }: { limit: number }): Promise<Kline[]> => {
          fetchCount += 1;
          return makeKlines(limit);
        },
      } as unknown as MarketService,
    });
    const def = buildIndicatorToolDefs(ctx).find((d) => d.name === "indicator_multi");
    assert.ok(def);
    const result = (await def.handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 200,
      includeATR: true,
      includeADX: true,
      includeStoch: true,
    })) as {
      rsi: number;
      atr?: number;
      adx?: number;
      stoch?: { stochK: number };
    };
    assert.equal(fetchCount, 1, "批量工具应单次拉取 K 线");
    assert.equal(typeof result.rsi, "number");
    assert.ok(result.atr !== undefined && typeof result.atr === "number");
    assert.ok(result.adx !== undefined && typeof result.adx === "number");
    assert.ok(result.stoch !== undefined && typeof result.stoch.stochK === "number");
  });

  test("indicator 预热不足时返回含预热需求的错误", async () => {
    const def = indicatorDef("indicator_rsi");
    assert.ok(def);
    // limit=10 < RSI 预热需求（WSMA 预热 14 + 价格对 1 = 15），稳定序列必为空
    await assert.rejects(
      async () => await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 10 }),
      /预热需 15 个输入.*limit=10/,
    );
  });
});

describe("indicator 工具入参校验", () => {
  function indicatorDef(name: string) {
    return buildIndicatorToolDefs(fakeContext()).find((d) => d.name === name);
  }

  test("period 低于下界被拒绝", () => {
    const def = indicatorDef("indicator_rsi");
    assert.ok(def);
    assert.throws(
      () => def.schema.parse({ symbol: "BTCUSDT", interval: "1h", limit: 200, period: 1 }),
      /Too small/,
    );
  });

  test("bbands 倍数超上限被拒绝", () => {
    const def = indicatorDef("indicator_bbands");
    assert.ok(def);
    assert.throws(
      () =>
        def.schema.parse({
          symbol: "BTCUSDT",
          interval: "1h",
          limit: 200,
          deviationMultiplier: 11,
        }),
      /Too big/,
    );
  });

  test("divergence lookback 低于下界被拒绝", () => {
    const def = indicatorDef("indicator_divergence");
    assert.ok(def);
    assert.throws(
      () => def.schema.parse({ symbol: "BTCUSDT", interval: "1h", limit: 200, lookback: 5 }),
      /Too small/,
    );
  });

  test("multiplier 低于下界被拒绝", () => {
    const def = indicatorDef("indicator_super_trend");
    assert.ok(def);
    assert.throws(
      () => def.schema.parse({ symbol: "BTCUSDT", interval: "1h", limit: 200, multiplier: 0 }),
      /Too small/,
    );
  });
});

describe("outputSchema 形状一致性（本地计算工具全量契约化）", () => {
  test("indicator_macd 序列输出匹配 schema（工厂包装 { data }）", async () => {
    const def = buildIndicatorToolDefs(fakeContext()).find((d) => d.name === "indicator_macd");
    const output = def?.outputSchema;
    assert.ok(output, "indicator_macd 应声明 outputSchema");
    const series = await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 100 });
    output.parse({ data: series });
  });

  test("indicator_ma_cross 信号输出匹配 schema", async () => {
    const def = buildIndicatorToolDefs(fakeContext()).find((d) => d.name === "indicator_ma_cross");
    const output = def?.outputSchema;
    assert.ok(output, "indicator_ma_cross 应声明 outputSchema");
    const result = await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 100 });
    output.parse(result);
  });

  test("indicator_multi 批量输出匹配 schema（含可选件）", async () => {
    const def = buildIndicatorToolDefs(fakeContext()).find((d) => d.name === "indicator_multi");
    const output = def?.outputSchema;
    assert.ok(output, "indicator_multi 应声明 outputSchema");
    const result = await def.handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 100,
      includeATR: true,
      includeADX: true,
      includeStoch: true,
    });
    output.parse(result);
  });

  test("market_overview 快照输出匹配 schema（正常与降级形态）", async () => {
    const def = buildMarketOverviewToolDef(fakeContext());
    assert.ok(def.outputSchema, "market_overview 应声明 outputSchema");
    const normal = await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 100 });
    def.outputSchema.parse(normal);
    // K 线不足的降级形态：指标层 latest=null / recent=[]，schema 必须容纳
    const degradedCtx = fakeContext({
      market: { getKlines: async () => makeKlines(10) } as unknown as MarketService,
    });
    const degraded = await buildMarketOverviewToolDef(degradedCtx).handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 100,
    });
    def.outputSchema.parse(degraded);
  });
});

describe("analysis 直连工具（伪造行情，不触网）", () => {
  function analysisDef(name: string) {
    return buildAnalysisToolDefs(fakeContext()).find((d) => d.name === name);
  }

  /** 构造指定收盘价序列的伪造行情上下文 */
  function contextWithCloses(closes: number[]): ToolContext {
    const klines = makeKlines(closes.length).map((k, i) => ({ ...k, close: closes[i] }));
    return fakeContext({
      market: { getKlines: async () => klines } as unknown as MarketService,
    });
  }

  test("A1 analysis 域注册 3 个工具", () => {
    const names = buildAnalysisToolDefs(fakeContext()).map((d) => d.name);
    assert.deepEqual(names, ["analysis_sharpe", "analysis_drawdown", "analysis_var"]);
  });

  test("A2 sharpe 数值与窗口透明度（1h 自动推断 8760）", async () => {
    const def = analysisDef("analysis_sharpe");
    assert.ok(def);
    const result = (await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 200 })) as {
      annualReturn: number;
      annualVolatility: number;
      sharpe: number;
      sortino: number;
      periodPerYear: number;
      sampleCount: number;
    };
    assert.equal(result.periodPerYear, 8760, "1h 应自动推断年化系数 8760");
    assert.equal(result.sampleCount, 199, "200 根 K 线产生 199 个收益率样本");
    assert.ok(result.sharpe > 0, "单调上升序列夏普应为正");
    assert.equal(result.sortino, 0, "全涨序列无下方波动，索提诺兜底 0");
    assert.ok(result.annualVolatility > 0);
  });

  test("A3 sharpe 显式 periodPerYear 覆盖自动推断", async () => {
    const def = analysisDef("analysis_sharpe");
    assert.ok(def);
    const result = (await def.handler({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 200,
      periodPerYear: 252,
    })) as { periodPerYear: number };
    assert.equal(result.periodPerYear, 252, "显式入参应覆盖自动推断");
  });

  test("A4 drawdown 单调上升无回撤", async () => {
    const def = analysisDef("analysis_drawdown");
    assert.ok(def);
    const result = (await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 200 })) as {
      maxDrawdown: number;
      peak: number;
      trough: number;
      sampleCount: number;
    };
    assert.equal(result.maxDrawdown, 0);
    assert.equal(result.peak, 299, "末根 close = 100 + 199");
    assert.equal(result.trough, 299);
    assert.equal(result.sampleCount, 200, "drawdown 的 sampleCount 为 K 线根数");
  });

  test("A5 drawdown 涨跌形态精确断言", async () => {
    const def = buildAnalysisToolDefs(contextWithCloses([100, 110, 90, 95])).find(
      (d) => d.name === "analysis_drawdown",
    );
    assert.ok(def);
    const result = (await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 4 })) as {
      maxDrawdown: number;
      peak: number;
      trough: number;
    };
    assert.ok(Math.abs(result.maxDrawdown - -20 / 110) < 1e-9);
    assert.equal(result.peak, 110);
    assert.equal(result.trough, 90);
  });

  test("A6 var 混合收益与样本数", async () => {
    const def = buildAnalysisToolDefs(contextWithCloses([100, 95, 105, 90, 110, 85])).find(
      (d) => d.name === "analysis_var",
    );
    assert.ok(def);
    const result = (await def.handler({ symbol: "BTCUSDT", interval: "1h", limit: 6 })) as {
      var: number;
      cvar: number;
      confidence: number;
      sampleCount: number;
    };
    assert.ok(result.var < 0, "混合收益序列 VaR 应为负");
    assert.ok(result.cvar <= result.var, "CVaR 不优于 VaR");
    assert.equal(result.confidence, 0.95);
    assert.equal(result.sampleCount, 5, "6 根 K 线产生 5 个收益率样本");
  });

  test("A7 schema 负例与边界", () => {
    const sharpe = analysisDef("analysis_sharpe");
    assert.ok(sharpe);
    assert.throws(() => sharpe.schema.parse({ symbol: "BTCUSDT", interval: "1h", limit: 2 }), />=\s*3|too small/i);
    const varDef = analysisDef("analysis_var");
    assert.ok(varDef);
    assert.throws(
      () => varDef.schema.parse({ symbol: "BTCUSDT", interval: "1h", limit: 100, confidence: 1.0 }),
      /<=\s*0.99|too big/i,
    );
    // 0.5 为置信度合法下界
    assert.ok(varDef.schema.parse({ symbol: "BTCUSDT", interval: "1h", limit: 100, confidence: 0.5 }));
  });
});

describe("trading 工具入参校验", () => {
  function tradingDef(name: string) {
    return buildTradingToolDefs(
      fakeContext({
        account: {} as unknown as AccountService,
        trade: {} as unknown as TradeService,
      }),
    ).find((d) => d.name === name);
  }

  test("trading_place_order 拦截 MARKET 携带 timeInForce", () => {
    const def = tradingDef("trading_place_order");
    assert.ok(def);
    assert.throws(
      () =>
        def.schema.parse({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "MARKET",
          quantity: 0.5,
          timeInForce: "GTC",
        }),
      /MARKET 市价单不支持 timeInForce/,
    );
    // LIMIT 限价单可正常携带 timeInForce
    assert.ok(
      def.schema.parse({
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: 0.5,
        price: 50000,
        timeInForce: "GTC",
      }),
    );
  });

  test("trading_place_order 持仓模式约束：positionSide 枚举与描述提示", () => {
    const def = tradingDef("trading_place_order");
    assert.ok(def);
    // positionSide 仅接受 LONG / SHORT（单向模式的 BOTH 由省略表达）
    assert.throws(
      () =>
        def.schema.parse({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "LIMIT",
          quantity: 0.5,
          price: 50000,
          timeInForce: "GTC",
          positionSide: "BOTH",
        }),
      /Invalid option/,
    );
    assert.ok(
      def.schema.parse({
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: 0.5,
        price: 50000,
        timeInForce: "GTC",
        positionSide: "LONG",
      }),
    );
    // 描述含持仓模式与查询工具指引（-4061 自救路径）
    assert.ok(def.description.includes("持仓模式"), `描述应含持仓模式约束：${def.description}`);
    assert.ok(def.description.includes("trading_position_mode"), "描述应指向模式查询工具");
  });

  test("trading_place_order 拦截 GTD 缺 goodTillDate", () => {
    const def = tradingDef("trading_place_order");
    assert.ok(def);
    assert.throws(
      () =>
        def.schema.parse({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "LIMIT",
          quantity: 0.5,
          price: 50000,
          timeInForce: "GTD",
        }),
      /goodTillDate/,
    );
  });

  test("trading_place_order 拦截 goodTillDate 超出官方上界", () => {
    const def = tradingDef("trading_place_order");
    assert.ok(def);
    const base = {
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.5,
      price: 50000,
      timeInForce: "GTD" as const,
    };
    // 官方上界：253402300799000（UTC 9999-12-31 23:59:59）
    assert.throws(
      () => def.schema.parse({ ...base, goodTillDate: 253402300799000 }),
      /goodTillDate 必须早于/,
    );
    assert.throws(
      () => def.schema.parse({ ...base, goodTillDate: 253402300799001 }),
      /goodTillDate 必须早于/,
    );
    assert.ok(def.schema.parse({ ...base, goodTillDate: 253402300798999 }));
  });

  test("trading_place_order 拦截 newClientOrderId 非法字符集 / 超长", () => {
    const def = tradingDef("trading_place_order");
    assert.ok(def);
    const base = {
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT",
      quantity: 0.5,
      price: 50000,
    };
    // 官方字符集：字母、数字、点、冒号、斜杠、下划线、连字符
    assert.ok(def.schema.parse({ ...base, newClientOrderId: "my.order-1/x:a" }));
    // 空格与中文等字符集外字符被拦截
    assert.throws(() => def.schema.parse({ ...base, newClientOrderId: "bad id" }), /订单号只能包含/);
    assert.throws(() => def.schema.parse({ ...base, newClientOrderId: "订单号" }), /订单号只能包含/);
    // 超过 36 字符被拦截
    assert.throws(
      () => def.schema.parse({ ...base, newClientOrderId: "a".repeat(37) }),
      /订单号只能包含/,
    );
    assert.ok(def.schema.parse({ ...base, newClientOrderId: "a".repeat(36) }));
  });

  test("trading_place_algo 拦截缺 triggerPrice", () => {
    const def = tradingDef("trading_place_algo");
    assert.ok(def);
    assert.throws(
      () =>
        def.schema.parse({
          symbol: "BTCUSDT",
          side: "SELL",
          type: "STOP_MARKET",
          quantity: 1,
        }),
      /triggerPrice/,
    );
  });

  test("trading_place_algo 拦截 closePosition 与 quantity 互斥", () => {
    const def = tradingDef("trading_place_algo");
    assert.ok(def);
    assert.throws(
      () =>
        def.schema.parse({
          symbol: "BTCUSDT",
          side: "SELL",
          type: "STOP_MARKET",
          triggerPrice: 49000,
          closePosition: true,
          quantity: 1,
        }),
      /closePosition=true 时不可传 quantity/,
    );
  });

  test("trading_income 拦截非法 incomeType", () => {
    const def = tradingDef("trading_income");
    assert.ok(def);
    assert.throws(
      () => def.schema.parse({ symbol: "BTCUSDT", incomeType: "INVALID_TYPE" }),
      /Invalid option/,
    );
  });

  test("trading_position_margin 拦截非法 type", () => {
    const def = tradingDef("trading_position_margin");
    assert.ok(def);
    assert.throws(
      () => def.schema.parse({ symbol: "BTCUSDT", amount: 100, type: 3 }),
      /Invalid input/,
    );
  });

  test("trading_place_order 拦截 LIMIT 缺 price", () => {
    const def = tradingDef("trading_place_order");
    assert.ok(def);
    assert.throws(
      () =>
        def.schema.parse({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "LIMIT",
          quantity: 0.5,
        }),
      /LIMIT 限价单必须提供 price/,
    );
    // MARKET 市价单无需 price
    assert.ok(
      def.schema.parse({
        symbol: "BTCUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 0.5,
      }),
    );
  });

  test("trading_place_algo 拦截 callbackRate 超出 0.1~10", () => {
    const def = tradingDef("trading_place_algo");
    assert.ok(def);
    const base = {
      symbol: "BTCUSDT",
      side: "SELL",
      type: "TRAILING_STOP_MARKET",
      quantity: 1,
    };
    // 官方约束：0.1% 为最小回撤率（旧口径 1 会误拦合法的 0.5）
    assert.throws(() => def.schema.parse({ ...base, callbackRate: 0.05 }), /too small|至少|between/i);
    assert.throws(() => def.schema.parse({ ...base, callbackRate: 11 }), /too big|至多|between/i);
    assert.ok(def.schema.parse({ ...base, callbackRate: 0.1 }));
    assert.ok(def.schema.parse({ ...base, callbackRate: 0.5 }));
    assert.ok(def.schema.parse({ ...base, callbackRate: 10 }));
  });

  test("trading_place_algo 拦截 clientAlgoId 非法字符集 / 超长", () => {
    const def = tradingDef("trading_place_algo");
    assert.ok(def);
    const base = {
      symbol: "BTCUSDT",
      side: "SELL",
      type: "STOP_MARKET",
      triggerPrice: 49000,
      quantity: 1,
    };
    assert.ok(def.schema.parse({ ...base, clientAlgoId: "algo.id-1/x:a" }));
    assert.throws(() => def.schema.parse({ ...base, clientAlgoId: "bad id" }), /订单号只能包含/);
    assert.throws(() => def.schema.parse({ ...base, clientAlgoId: "条件单号" }), /订单号只能包含/);
    assert.throws(
      () => def.schema.parse({ ...base, clientAlgoId: "a".repeat(37) }),
      /订单号只能包含/,
    );
    assert.ok(def.schema.parse({ ...base, clientAlgoId: "a".repeat(36) }));
  });

  test("trading_place_algo 拦截 quantity 与 closePosition 皆缺", () => {
    const def = tradingDef("trading_place_algo");
    assert.ok(def);
    assert.throws(
      () =>
        def.schema.parse({
          symbol: "BTCUSDT",
          side: "SELL",
          type: "STOP_MARKET",
          triggerPrice: 49000,
        }),
      /必须提供 quantity 或 closePosition=true/,
    );
    // 仅 closePosition 可通过
    assert.ok(
      def.schema.parse({
        symbol: "BTCUSDT",
        side: "SELL",
        type: "STOP_MARKET",
        triggerPrice: 49000,
        closePosition: true,
      }),
    );
    // 仅 quantity 可通过
    assert.ok(
      def.schema.parse({
        symbol: "BTCUSDT",
        side: "SELL",
        type: "STOP_MARKET",
        triggerPrice: 49000,
        quantity: 1,
      }),
    );
  });
});

describe("trading 工具 handler 行为（spy 注入）", () => {
  /** 记录调用的持仓模式 spy 交易服务 */
  function spyPositionModeTrade(): TradeService & {
    calls: string[];
    mode: { dualSidePosition: boolean };
  } {
    const calls: string[] = [];
    const mode = { dualSidePosition: false };
    return {
      calls,
      mode,
      getPositionMode: async () => ({ ...mode }),
      setPositionMode: async (dual: boolean) => {
        calls.push(`setPositionMode:${dual}`);
        return {};
      },
      // 其余可能被 handler 路径接触的方法置为不可达（双模式仅用上面两个）
    } as unknown as TradeService & { calls: string[]; mode: { dualSidePosition: boolean } };
  }

  /** 按工具名构造含交易服务的工具定义 */
  function tradingDefWith(trade: TradeService, name: string) {
    return buildTradingToolDefs(
      fakeContext({ account: {} as unknown as AccountService, trade }),
    ).find((d) => d.name === name);
  }

  test("trading_position_mode 不传 dual 走查询（不切换）", async () => {
    const trade = spyPositionModeTrade();
    const def = tradingDefWith(trade, "trading_position_mode");
    assert.ok(def);
    const result = await def.handler({});
    assert.deepEqual(result, trade.mode, "应返回查询的持仓模式");
    assert.equal(trade.calls.length, 0, "不传 dual 不应触达 setPositionMode");
  });

  test("trading_position_mode 传 dual=true 走切换并返回目标模式", async () => {
    const trade = spyPositionModeTrade();
    const def = tradingDefWith(trade, "trading_position_mode");
    assert.ok(def);
    const result = await def.handler({ dual: true });
    assert.deepEqual(result, { dualSidePosition: true }, "切换后应返回目标模式");
    assert.deepEqual(trade.calls, ["setPositionMode:true"], "应触发一次双向切换");
  });

  test("trading_position_mode 传 dual=false 走单向切换", async () => {
    const trade = spyPositionModeTrade();
    const def = tradingDefWith(trade, "trading_position_mode");
    assert.ok(def);
    const result = await def.handler({ dual: false });
    assert.deepEqual(result, { dualSidePosition: false });
    assert.deepEqual(trade.calls, ["setPositionMode:false"]);
  });

  test("trading_set_margin_type 校验 marginType 枚举", () => {
    const def = tradingDefWith({} as unknown as TradeService, "trading_set_margin_type");
    assert.ok(def);
    assert.throws(
      () => def.schema.parse({ symbol: "BTCUSDT", marginType: "INVALID" }),
      /Invalid option/,
    );
    assert.ok(def.schema.parse({ symbol: "BTCUSDT", marginType: "ISOLATED" }));
    assert.ok(def.schema.parse({ symbol: "BTCUSDT", marginType: "CROSSED" }));
  });
});
