/**
 * 币安操作层单元测试 — 行情服务
 *
 * 使用伪造客户端验证响应映射与 K 线缓存复用（不触网）。
 *
 * @module exchange/__tests__/market
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MarketService, resetMarketCache } from "../market.js";
import { createFakeClient } from "./fake-client.js";

/** 构造 K 线元组行 */
function klineRow(openTime: number, close: number): (number | string)[] {
  return [
    openTime, "100", "102", "98", String(close), "1000",
    openTime + 59_999, "100000", 120, "500", "50000", "0",
  ];
}

describe("MarketService 响应映射", () => {
  test("getSymbolPrice 返回最新价", async () => {
    const client = createFakeClient({
      symbolPriceTickerV2: { symbol: "BTCUSDT", price: "50000" },
    });
    const market = new MarketService(client);
    const result = await market.getSymbolPrice("BTCUSDT");
    assert.deepEqual(result, { symbol: "BTCUSDT", price: 50000 });
  });

  test("getOrderBook 映射档位为 number", async () => {
    const client = createFakeClient({
      orderBook: {
        lastUpdateId: 1,
        bids: [["100", "2"]],
        asks: [["101", "3"]],
      },
    });
    const market = new MarketService(client);
    const result = await market.getOrderBook("BTCUSDT");
    assert.deepEqual(result.bids, [[100, 2]]);
    assert.deepEqual(result.asks, [[101, 3]]);
  });

  test("getKlines 映射元组为业务对象", async () => {
    const client = createFakeClient({
      klineCandlestickData: [klineRow(1700000000000, 101)],
    });
    const market = new MarketService(client);
    const result = await market.getKlines({ symbol: "BTCUSDT", interval: "1h", limit: 1 });
    assert.equal(result[0].openTime, 1700000000000);
    assert.equal(result[0].close, 101);
    assert.equal(result[0].trades, 120);
  });

  test("getOpenInterest 返回未平仓量", async () => {
    const client = createFakeClient({
      openInterest: { symbol: "BTCUSDT", openInterest: "123.45", time: 1700000000000 },
    });
    const market = new MarketService(client);
    const result = await market.getOpenInterest("BTCUSDT");
    assert.deepEqual(result, {
      symbol: "BTCUSDT",
      openInterest: 123.45,
      time: 1700000000000,
    });
  });

  test("get24hrTicker 映射统计字段", async () => {
    const client = createFakeClient({
      ticker24hrPriceChangeStatistics: {
        symbol: "BTCUSDT",
        lastPrice: "50000",
        priceChangePercent: "3.5",
        highPrice: "51000",
        lowPrice: "49000",
        volume: "1000",
        quoteVolume: "50000000",
        weightedAvgPrice: "50000",
        count: 100,
        openPrice: "48300",
      },
    });
    const market = new MarketService(client);
    const result = await market.get24hrTicker("BTCUSDT");
    assert.equal(result[0].priceChangePercent, 3.5);
    assert.equal(result[0].volume, 1000);
  });

  test("ping 返回 ok", async () => {
    const client = createFakeClient({ testConnectivity: {} });
    const market = new MarketService(client);
    assert.deepEqual(await market.ping(), { ok: true });
  });

  test("getServerTime 解析 bigint 时间戳", async () => {
    const client = createFakeClient({ checkServerTime: { serverTime: 1720000000000n } });
    const market = new MarketService(client);
    const result = await market.getServerTime();
    assert.equal(result.serverTime, 1720000000000);
  });

  test("getBookTicker 映射最优报价", async () => {
    const client = createFakeClient({
      symbolOrderBookTicker: [
        { symbol: "BTCUSDT", bidPrice: "49900", bidQty: "1", askPrice: "50100", askQty: "2" },
      ],
    });
    const market = new MarketService(client);
    const result = await market.getBookTicker("BTCUSDT");
    assert.equal(result[0].bidPrice, 49900);
    assert.equal(result[0].askPrice, 50100);
    assert.equal(result[0].bidQty, 1);
    assert.equal(result[0].askQty, 2);
  });

  test("getMarkPrice 映射标记价与资金费率字段", async () => {
    const client = createFakeClient({
      markPrice: [
        {
          symbol: "BTCUSDT",
          markPrice: "50000",
          lastFundingRate: "0.0001",
          nextFundingTime: 1720000000000n,
          indexPrice: "49950",
        },
      ],
    });
    const market = new MarketService(client);
    const result = await market.getMarkPrice("BTCUSDT");
    assert.equal(result[0].markPrice, 50000);
    assert.equal(result[0].fundingRate, 0.0001);
    assert.equal(result[0].nextFundingTime, 1720000000000);
    assert.equal(result[0].indexPrice, 49950);
  });

  test("getFundingRateInfo 映射费率上下限", async () => {
    const client = createFakeClient({
      getFundingRateInfo: [
        { symbol: "BTCUSDT", fundingIntervalHours: 8n, adjustedFundingRateCap: "0.003" },
      ],
    });
    const market = new MarketService(client);
    const result = await market.getFundingRateInfo();
    assert.equal(result[0].fundingIntervalHours, 8);
    assert.equal(result[0].adjustedFundingRateCap, 0.003);
  });

  test("getFundingRateHistory 映射历史费率", async () => {
    const client = createFakeClient({
      getFundingRateHistory: [
        { symbol: "BTCUSDT", fundingRate: "0.0001", fundingTime: 1720000000000n, markPrice: "50000" },
      ],
    });
    const market = new MarketService(client);
    const result = await market.getFundingRateHistory("BTCUSDT");
    assert.equal(result[0].fundingRate, 0.0001);
    assert.equal(result[0].fundingTime, 1720000000000);
  });

  test("getOpenInterestHist 映射历史 OI 统计", async () => {
    const client = createFakeClient({
      openInterestStatistics: [
        {
          symbol: "BTCUSDT",
          sumOpenInterest: "10000",
          sumOpenInterestValue: "500000000",
          timestamp: 1720000000000n,
        },
      ],
    });
    const market = new MarketService(client);
    const result = await market.getOpenInterestHist("BTCUSDT", "1h");
    assert.equal(result[0].sumOpenInterest, 10000);
    assert.equal(result[0].sumOpenInterestValue, 500000000);
    assert.equal(result[0].timestamp, 1720000000000);
  });

  test("getLongShortRatio 映射多空比", async () => {
    const client = createFakeClient({
      longShortRatio: [
        { symbol: "BTCUSDT", longShortRatio: "1.5", longAccount: "0.6", shortAccount: "0.4", timestamp: 1n },
      ],
    });
    const market = new MarketService(client);
    const result = await market.getLongShortRatio("BTCUSDT", "1h");
    assert.equal(result[0].longShortRatio, 1.5);
    assert.equal(result[0].longAccount, 0.6);
    assert.equal(result[0].shortAccount, 0.4);
  });

  test("getTakerVolume 映射主动买卖量", async () => {
    const client = createFakeClient({
      takerBuySellVolume: [
        { buySellRatio: "1.2", buyVol: "500", sellVol: "400", timestamp: 1n },
      ],
    });
    const market = new MarketService(client);
    const result = await market.getTakerVolume("BTCUSDT", "1h");
    assert.equal(result[0].buySellRatio, 1.2);
    assert.equal(result[0].buyVol, 500);
    assert.equal(result[0].sellVol, 400);
  });

  test("getTopTraderRatio 映射大户持仓比", async () => {
    const client = createFakeClient({
      topTraderLongShortRatioAccounts: [
        { symbol: "BTCUSDT", longShortRatio: "1.2", longAccount: "0.55", shortAccount: "0.45", timestamp: 1n },
      ],
    });
    const market = new MarketService(client);
    const result = await market.getTopTraderRatio("BTCUSDT", "1h");
    assert.equal(result[0].longShortRatio, 1.2);
    assert.equal(result[0].longAccount, 0.55);
    assert.equal(result[0].shortAccount, 0.45);
  });
});

describe("MarketService K 线缓存", () => {
  test("同 symbol+interval 短 TTL 内复用缓存", async () => {
    resetMarketCache();
    let fetchCount = 0;
    const client = createFakeClient({
      klineCandlestickData: () => {
        fetchCount += 1;
        return { data: async () => [klineRow(1700000000000, 101)] };
      },
    });
    const market = new MarketService(client);
    await market.getKlines({ symbol: "BTCUSDT", interval: "1h", limit: 1 });
    await market.getKlines({ symbol: "BTCUSDT", interval: "1h", limit: 1 });
    assert.equal(fetchCount, 1, "短 TTL 内应复用缓存");
    resetMarketCache();
  });

  test("带时间范围查询不缓存", async () => {
    resetMarketCache();
    let fetchCount = 0;
    const client = createFakeClient({
      klineCandlestickData: () => {
        fetchCount += 1;
        return { data: async () => [klineRow(1700000000000, 101)] };
      },
    });
    const market = new MarketService(client);
    await market.getKlines({ symbol: "BTCUSDT", interval: "1h", limit: 1, startTime: 1 });
    await market.getKlines({ symbol: "BTCUSDT", interval: "1h", limit: 1, startTime: 1 });
    assert.equal(fetchCount, 2, "带时间范围应每次拉取");
    resetMarketCache();
  });

  test("同 key+limit 并发拉取去重为一次", async () => {
    resetMarketCache();
    let fetchCount = 0;
    const client = createFakeClient({
      klineCandlestickData: (args: { limit?: number }) => {
        fetchCount += 1;
        const limit = args.limit ?? 1;
        return {
          data: async () =>
            Array.from({ length: limit }, (_, i) => klineRow(1700000000000 + i, 100 + i)),
        };
      },
    });
    const market = new MarketService(client);
    const [a, b] = await Promise.all([
      market.getKlines({ symbol: "BTCUSDT", interval: "15m", limit: 100 }),
      market.getKlines({ symbol: "BTCUSDT", interval: "15m", limit: 100 }),
    ]);
    assert.equal(fetchCount, 1, "并发同参请求应去重为一次拉取");
    assert.equal(a.length, 100);
    assert.equal(b.length, 100);
    resetMarketCache();
  });

  test("缓存不足更大 limit 时重新拉取", async () => {
    resetMarketCache();
    let fetchCount = 0;
    const client = createFakeClient({
      klineCandlestickData: (args: { limit?: number }) => {
        fetchCount += 1;
        const limit = args.limit ?? 1;
        return {
          data: async () =>
            Array.from({ length: limit }, (_, i) => klineRow(1700000000000 + i, 100 + i)),
        };
      },
    });
    const market = new MarketService(client);
    await market.getKlines({ symbol: "BTCUSDT", interval: "30m", limit: 100 });
    const more = await market.getKlines({ symbol: "BTCUSDT", interval: "30m", limit: 300 });
    assert.equal(fetchCount, 2, "更大 limit 应重新拉取而非复用不足缓存");
    assert.equal(more.length, 300);
    resetMarketCache();
  });
});

describe("MarketService 交易规则提取", () => {
  const exchangeInfo = {
    symbols: [
      {
        symbol: "BTCUSDT",
        status: "TRADING",
        filters: [
          { filterType: "PRICE_FILTER", tickSize: "0.01" },
          { filterType: "LOT_SIZE", stepSize: "0.001" },
          { filterType: "MIN_NOTIONAL", notional: "5" },
        ],
      },
    ],
  };

  test("从 exchangeInfo 过滤器提取精度规格并命中缓存", async () => {
    resetMarketCache();
    let fetchCount = 0;
    const client = createFakeClient({
      exchangeInformation: () => {
        fetchCount += 1;
        return { data: async () => exchangeInfo };
      },
    });
    const market = new MarketService(client);
    const spec1 = await market.getSymbolSpec("BTCUSDT");
    assert.equal(spec1.pricePrecision, 2);
    assert.equal(spec1.quantityPrecision, 3);
    assert.equal(spec1.tickSize, 0.01);
    assert.equal(spec1.stepSize, 0.001);
    assert.equal(spec1.minNotional, 5);
    assert.equal(spec1.status, "TRADING");
    // 二次读取命中缓存，不再触发 exchangeInformation
    const spec2 = await market.getSymbolSpec("BTCUSDT");
    assert.equal(spec2.pricePrecision, 2);
    assert.equal(fetchCount, 1);
    resetMarketCache();
  });

  test("symbol 不存在抛出 NOT_FOUND", async () => {
    resetMarketCache();
    const client = createFakeClient({ exchangeInformation: { symbols: [] } });
    const market = new MarketService(client);
    await assert.rejects(() => market.getSymbolSpec("NONEXISTENT"), /不存在/);
    resetMarketCache();
  });

  test("非 TRADING 状态被拒绝", async () => {
    resetMarketCache();
    const client = createFakeClient({
      exchangeInformation: {
        symbols: [
          {
            symbol: "BREAKUSDT",
            status: "BREAK",
            filters: [
              { filterType: "PRICE_FILTER", tickSize: "0.01" },
              { filterType: "LOT_SIZE", stepSize: "0.001" },
              { filterType: "MIN_NOTIONAL", notional: "5" },
            ],
          },
        ],
      },
    });
    const market = new MarketService(client);
    await assert.rejects(() => market.getSymbolSpec("BREAKUSDT"), /非 TRADING/);
    resetMarketCache();
  });
});
