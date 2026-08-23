/**
 * 常量层单元测试
 *
 * 验证全局常量的取值正确性与离散集合完整性。
 *
 * @module constants/__tests__/constants
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  BINANCE_ERROR_CODE_BACKEND_TIMEOUT,
  CALLBACK_RATE_MAX,
  CALLBACK_RATE_MIN,
  CLIENT_ORDER_ID_MAX_LENGTH,
  CLIENT_ORDER_ID_PATTERN,
  CLOCK_SKEW_REPROBE_INTERVAL_MS,
  CLOCK_SKEW_WARN_THRESHOLD_MS,
  CONFIDENCE_DEFAULT,
  CONFIDENCE_MAX,
  CONFIDENCE_MIN,
  CONTINUOUS_KLINE_DEFAULT_LIMIT,
  EXCHANGE_INFO_TTL_MS,
  FORCE_ORDERS_DEFAULT_LIMIT,
  FORCE_ORDERS_MAX_LIMIT,
  FUNDING_HISTORY_DEFAULT_LIMIT,
  FUNDING_HISTORY_MAX_LIMIT,
  GOOD_TILL_DATE_MAX,
  INCOME_HISTORY_DEFAULT_LIMIT,
  INCOME_HISTORY_MAX_LIMIT,
  KLINE_CACHE_MAX_ENTRIES,
  KLINE_CACHE_TTL_MS,
  KLINE_DEFAULT_LIMIT,
  KLINE_MAX_LIMIT,
  MARKET_KLINE_DEFAULT_LIMIT,
  MAX_LEVERAGE,
  MINUTES_PER_INTERVAL,
  MINUTES_PER_YEAR,
  ORDERBOOK_DEFAULT_LIMIT,
  ORDERBOOK_VALID_LIMITS,
  ORDER_HISTORY_DEFAULT_LIMIT,
  ORDER_HISTORY_MAX_LIMIT,
  PERIODS_PER_YEAR_DECIMALS,
  PERIODS_PER_YEAR_MAX,
  RISK_FREE_RATE_DEFAULT,
  RISK_MIN_KLINES,
  SENTIMENT_DEFAULT_LIMIT,
  SENTIMENT_MAX_LIMIT,
  SYMBOL_MAX_LENGTH,
  SYMBOL_MIN_LENGTH,
  TRADES_DEFAULT_LIMIT,
  TRADES_MAX_LIMIT,
} from "../index.js";

describe("币安 API 边界常量", () => {
  test("K 线 limit 边界", () => {
    assert.equal(KLINE_MAX_LIMIT, 1500);
    assert.equal(KLINE_DEFAULT_LIMIT, 200);
    assert.equal(MARKET_KLINE_DEFAULT_LIMIT, 100);
  });

  test("订单簿档位为官方离散集合", () => {
    assert.deepEqual(ORDERBOOK_VALID_LIMITS, [5, 10, 20, 50, 100, 500, 1000]);
    assert.equal(ORDERBOOK_DEFAULT_LIMIT, 20);
  });

  test("情绪 / 资金 / 订单 / 成交 limit 边界", () => {
    assert.equal(SENTIMENT_DEFAULT_LIMIT, 30);
    assert.equal(SENTIMENT_MAX_LIMIT, 500);
    assert.equal(FUNDING_HISTORY_DEFAULT_LIMIT, 100);
    assert.equal(FUNDING_HISTORY_MAX_LIMIT, 1000);
    assert.equal(CONTINUOUS_KLINE_DEFAULT_LIMIT, 500);
    assert.equal(INCOME_HISTORY_DEFAULT_LIMIT, 100);
    assert.equal(INCOME_HISTORY_MAX_LIMIT, 1000);
    assert.equal(ORDER_HISTORY_DEFAULT_LIMIT, 100);
    assert.equal(ORDER_HISTORY_MAX_LIMIT, 1000);
    assert.equal(FORCE_ORDERS_DEFAULT_LIMIT, 50);
    assert.equal(FORCE_ORDERS_MAX_LIMIT, 100);
    assert.equal(TRADES_DEFAULT_LIMIT, 100);
    assert.equal(TRADES_MAX_LIMIT, 1000);
  });

  test("缓存与订单号 / 杠杆边界", () => {
    assert.equal(EXCHANGE_INFO_TTL_MS, 5 * 60 * 1000);
    assert.equal(KLINE_CACHE_TTL_MS, 3000);
    assert.equal(KLINE_CACHE_MAX_ENTRIES, 100);
    assert.equal(CLIENT_ORDER_ID_MAX_LENGTH, 36);
    // 官方 GTD 上界：253402300799000（UTC 9999-12-31 23:59:59 毫秒时间戳）
    assert.equal(GOOD_TILL_DATE_MAX, 253402300799000);
    assert.equal(MAX_LEVERAGE, 125);
    // 官方追踪止损回撤率约束：0.1% ~ 10%
    assert.equal(CALLBACK_RATE_MIN, 0.1);
    assert.equal(CALLBACK_RATE_MAX, 10);
  });

  test("订单号官方字符集正则行为", () => {
    // 合法：字母、数字、点、冒号、斜杠、下划线、连字符（含边界长度 1 与 36）
    assert.ok(CLIENT_ORDER_ID_PATTERN.test("a"));
    assert.ok(CLIENT_ORDER_ID_PATTERN.test("a".repeat(36)));
    assert.ok(CLIENT_ORDER_ID_PATTERN.test("my.Order:1/x_a-b"));
    // 非法：空串、超长、空格、中文、特殊符号
    assert.ok(!CLIENT_ORDER_ID_PATTERN.test(""));
    assert.ok(!CLIENT_ORDER_ID_PATTERN.test("a".repeat(37)));
    assert.ok(!CLIENT_ORDER_ID_PATTERN.test("bad id"));
    assert.ok(!CLIENT_ORDER_ID_PATTERN.test("订单号"));
    assert.ok(!CLIENT_ORDER_ID_PATTERN.test("id$1"));
  });

  test("错误码与时钟偏差常量", () => {
    assert.equal(BINANCE_ERROR_CODE_BACKEND_TIMEOUT, -1007);
    assert.equal(CLOCK_SKEW_WARN_THRESHOLD_MS, 1000);
    assert.equal(CLOCK_SKEW_REPROBE_INTERVAL_MS, 60 * 60 * 1000);
  });

  test("交易对符号长度边界", () => {
    assert.equal(SYMBOL_MIN_LENGTH, 5);
    assert.equal(SYMBOL_MAX_LENGTH, 20);
  });
});

describe("风险绩效（analysis 域）常量", () => {
  test("年化换算：每年分钟数与各周期单根时长", () => {
    assert.equal(MINUTES_PER_YEAR, 365 * 24 * 60);
    // 覆盖最短 / 中间 / 最长周期与 KlineInterval 值集基数
    assert.equal(Object.keys(MINUTES_PER_INTERVAL).length, 15);
    assert.equal(MINUTES_PER_INTERVAL["1m"], 1);
    assert.equal(MINUTES_PER_INTERVAL["1h"], 60);
    assert.equal(MINUTES_PER_INTERVAL["1d"], 1440);
    assert.equal(MINUTES_PER_INTERVAL["1M"], 43200);
    // 年化系数口径抽查：1h → 8760、1M → 12.17（非旧版注释误写的 8.76）
    assert.equal(Math.round(MINUTES_PER_YEAR / MINUTES_PER_INTERVAL["1h"]), 8760);
    assert.ok(
      Math.abs(MINUTES_PER_YEAR / MINUTES_PER_INTERVAL["1M"] - 12.17) < 0.005,
      "1M 年化系数应约 12.17",
    );
  });

  test("置信度与无风险利率边界", () => {
    assert.equal(CONFIDENCE_MIN, 0.5);
    assert.equal(CONFIDENCE_MAX, 0.99);
    assert.equal(CONFIDENCE_DEFAULT, 0.95);
    assert.equal(RISK_FREE_RATE_DEFAULT, 0);
  });

  test("入参与换算精度边界", () => {
    // 覆盖 1m 周期年化系数 525600，留足余量
    assert.equal(PERIODS_PER_YEAR_MAX, 1_000_000);
    assert.equal(PERIODS_PER_YEAR_DECIMALS, 2);
    // 最小 K 线数：3 根产生 2 个收益率样本
    assert.equal(RISK_MIN_KLINES, 3);
  });
});
