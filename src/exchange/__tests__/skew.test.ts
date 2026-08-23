/**
 * 币安操作层单元测试 — 时钟偏差探测
 *
 * @module exchange/__tests__/skew
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { computeClockSkewMs, isClockSkewSignificant, sampleServerClock } from "../skew.js";

describe("computeClockSkewMs", () => {
  test("服务器时间 − 本机时间", () => {
    assert.equal(computeClockSkewMs(2000, 1000), 1000);
    assert.equal(computeClockSkewMs(1000, 2000), -1000);
  });
});

describe("isClockSkewSignificant", () => {
  test("超出阈值判定", () => {
    assert.equal(isClockSkewSignificant(1001), true);
    assert.equal(isClockSkewSignificant(999), false);
    assert.equal(isClockSkewSignificant(-1001), true);
  });
});

describe("sampleServerClock", () => {
  test("采样成功返回偏差", async () => {
    const client = {
      restAPI: {
        checkServerTime: async () => ({ data: async () => ({ serverTime: 2000 }) }),
      },
    };
    const sample = await sampleServerClock(client, 1000);
    assert.deepEqual(sample, { serverTime: 2000, localTime: 1000, offsetMs: 1000 });
  });

  test("字段缺失返回 null", async () => {
    const client = {
      restAPI: {
        checkServerTime: async () => ({ data: async () => ({}) }),
      },
    };
    assert.equal(await sampleServerClock(client, 1000), null);
  });
});
