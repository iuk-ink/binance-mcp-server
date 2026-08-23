/**
 * 币安操作层单元测试 — 精度工具
 *
 * @module exchange/__tests__/format
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  countDecimals,
  isAboveMinNotional,
  roundDownToStep,
  roundPrice,
  roundQuantity,
} from "../format.js";

describe("countDecimals", () => {
  test("普通小数按位数推导", () => {
    assert.equal(countDecimals(0.01), 2);
    assert.equal(countDecimals(0.001), 3);
    assert.equal(countDecimals(1), 0);
  });

  test("科学计数法取指数", () => {
    assert.equal(countDecimals(1e-7), 7);
    assert.equal(countDecimals(1e-8), 8);
  });

  test("非有限值 / 非正数返回 0", () => {
    assert.equal(countDecimals(NaN), 0);
    assert.equal(countDecimals(0), 0);
    assert.equal(countDecimals(-1), 0);
  });
});

describe("roundDownToStep", () => {
  test("向下取整到步进整数倍", () => {
    assert.equal(roundDownToStep(1.2345, 0.01), 1.23);
    assert.equal(roundDownToStep(0.1234, 0.001), 0.123);
  });

  test("消除浮点除法误差", () => {
    assert.equal(roundDownToStep(0.0046, 0.0001), 0.0046);
  });

  test("step 非法时原值返回", () => {
    assert.equal(roundDownToStep(1.5, 0), 1.5);
    assert.equal(roundDownToStep(1.5, NaN), 1.5);
  });
});

describe("roundPrice / roundQuantity", () => {
  test("价格与数量规整", () => {
    assert.equal(roundPrice(50000.123, 0.01), 50000.12);
    assert.equal(roundQuantity(1.2345, 0.001), 1.234);
  });
});

describe("isAboveMinNotional", () => {
  test("名义价值校验", () => {
    assert.equal(isAboveMinNotional(100, 5, 500), true);
    assert.equal(isAboveMinNotional(100, 4, 500), false);
  });
});
