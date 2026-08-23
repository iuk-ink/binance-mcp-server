/**
 * MCP 共享 schema 片段单元测试
 *
 * 覆盖 symbolSchema 归一与拒绝、limitSchema 边界与默认、枚举片段非法值拦截。
 *
 * @module mcp/__tests__/schema
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  contractTypeSchema,
  klineIntervalSchema,
  limitSchema,
  statsPeriodSchema,
  symbolSchema,
} from "../schema.js";

describe("symbolSchema", () => {
  test("小写与首尾空格归一为大写", () => {
    assert.equal(symbolSchema.parse(" btcusdt "), "BTCUSDT");
    assert.equal(symbolSchema.parse("btcusdt"), "BTCUSDT");
    assert.equal(symbolSchema.parse("BTCUSDT"), "BTCUSDT");
  });

  test("拒绝非法字符", () => {
    assert.throws(() => symbolSchema.parse("btc$usdt"), /交易对格式/);
    assert.throws(() => symbolSchema.parse("BTC-USDT"), /交易对格式/);
  });

  test("拒绝超出长度范围", () => {
    assert.throws(() => symbolSchema.parse("ab1"), /交易对格式/);
    assert.throws(() => symbolSchema.parse("A".repeat(21)), /交易对格式/);
  });
});

describe("limitSchema", () => {
  test("缺省填充默认值", () => {
    const schema = limitSchema(100, 1, 1000);
    assert.equal(schema.parse(undefined), 100);
  });

  test("越界值被拒绝", () => {
    const schema = limitSchema(100, 1, 1000);
    assert.throws(() => schema.parse(0));
    assert.throws(() => schema.parse(1001));
    assert.equal(schema.parse(1000), 1000);
  });
});

describe("枚举片段", () => {
  test("klineIntervalSchema 拒绝非法周期", () => {
    assert.equal(klineIntervalSchema.parse("1h"), "1h");
    assert.throws(() => klineIntervalSchema.parse("2m"));
  });

  test("statsPeriodSchema 拒绝非法统计周期", () => {
    assert.equal(statsPeriodSchema.parse("4h"), "4h");
    assert.throws(() => statsPeriodSchema.parse("3m"));
  });

  test("contractTypeSchema 拒绝非法合约类型", () => {
    assert.equal(contractTypeSchema.parse("PERPETUAL"), "PERPETUAL");
    assert.throws(() => contractTypeSchema.parse("NEXT_NEXT_QUARTER"));
  });
});
