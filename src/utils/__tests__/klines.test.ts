/**
 * 工具层单元测试 — K 线提取辅助
 *
 * @module utils/__tests__/klines
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Kline } from "../../exchange/types.js";
import {
  fetchClose,
  fetchHLC,
  fetchHLCV,
  fetchOHLCV,
  mapKlineRow,
  toCloses,
  toHlcRows,
  toHlcvRows,
  toOhlcvRows,
} from "../klines.js";

/** 构造合成 K 线 */
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

describe("本地视图提取", () => {
  const klines = makeKlines(3);

  test("toCloses 提取收盘价", () => {
    assert.deepEqual(toCloses(klines), [100, 101, 102]);
  });

  test("toHlcRows 提取 HLC", () => {
    assert.deepEqual(toHlcRows(klines), [
      { high: 102, low: 98, close: 100 },
      { high: 103, low: 99, close: 101 },
      { high: 104, low: 100, close: 102 },
    ]);
  });

  test("toHlcvRows 提取 HLCV", () => {
    const rows = toHlcvRows(klines);
    assert.equal(rows[0].volume, 1000);
    assert.equal(rows[2].volume, 1020);
  });

  test("toOhlcvRows 提取 OHLCV", () => {
    const rows = toOhlcvRows(klines);
    assert.equal(rows[0].open, 100);
    assert.equal(rows[0].close, 100);
  });
});

describe("拉取 + 提取组合", () => {
  test("fetchClose 委托 fetcher 并提取收盘价", async () => {
    let called = 0;
    const result = await fetchClose(
      async ({ symbol, interval, limit }) => {
        called += 1;
        assert.equal(symbol, "BTCUSDT");
        assert.equal(interval, "1h");
        assert.equal(limit, 100);
        return makeKlines(limit);
      },
      "BTCUSDT",
      "1h",
      100,
    );
    assert.equal(called, 1);
    assert.equal(result.length, 100);
    assert.equal(result[0], 100);
  });

  test("fetchHLC / fetchHLCV / fetchOHLCV 提取对应视图", async () => {
    const fetcher = async ({ limit }: { limit: number }) => makeKlines(limit);
    const hlc = await fetchHLC(fetcher, "BTCUSDT", "1h", 3);
    assert.equal(hlc[0].high, 102);
    const hlCV = await fetchHLCV(fetcher, "BTCUSDT", "1h", 3);
    assert.equal(hlCV[0].volume, 1000);
    const ohlcv = await fetchOHLCV(fetcher, "BTCUSDT", "1h", 3);
    assert.equal(ohlcv[0].open, 100);
  });
});

describe("mapKlineRow", () => {
  test("将扁平元组映射为业务 Kline", () => {
    const row = [
      1700000000000, "100", "102", "98", "101", "1000",
      1700000059999, "100000", 120, "500", "50000", "0",
    ];
    const k = mapKlineRow(row);
    assert.equal(k.openTime, 1700000000000);
    assert.equal(k.open, 100);
    assert.equal(k.high, 102);
    assert.equal(k.low, 98);
    assert.equal(k.close, 101);
    assert.equal(k.volume, 1000);
    assert.equal(k.closeTime, 1700000059999);
    assert.equal(k.quoteVolume, 100000);
    assert.equal(k.trades, 120);
    assert.equal(k.takerBuyVolume, 500);
    assert.equal(k.takerQuoteVolume, 50000);
  });
});
