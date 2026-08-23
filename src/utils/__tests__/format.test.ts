/**
 * 工具层单元测试 — 数值格式化与脱敏
 *
 * @module utils/__tests__/format
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { roundValue, sanitize } from "../format.js";

describe("roundValue", () => {
  test("四舍五入到指定小数位", () => {
    assert.equal(roundValue(1.23456, 2), 1.23);
    assert.equal(roundValue(1.235, 2), 1.24);
    assert.equal(roundValue("1.5", 0), 2);
  });

  test("默认保留 8 位", () => {
    assert.equal(roundValue(1.123456789), 1.12345679);
  });

  test("NaN / Infinity 返回 0", () => {
    assert.equal(roundValue(NaN), 0);
    assert.equal(roundValue(Infinity), 0);
  });
});

describe("sanitize", () => {
  test("脱敏 key=value 敏感字段", () => {
    assert.equal(sanitize("apiKey=sk-secret-token"), "apiKey=[REDACTED]");
    assert.equal(sanitize("api_secret=abc"), "api_secret=[REDACTED]");
    assert.equal(sanitize("signature=xyz"), "signature=[REDACTED]");
  });

  test("脱敏 64 位以上十六进制签名", () => {
    const hex = "a".repeat(64);
    assert.equal(sanitize(`sig=${hex}`), "sig=[REDACTED_SIGNATURE]");
  });

  test("空串原样返回", () => {
    assert.equal(sanitize(""), "");
  });
});
