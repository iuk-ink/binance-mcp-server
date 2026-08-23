/**
 * 币安操作层单元测试 — 错误归一化
 *
 * @module exchange/__tests__/errors
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  BadRequestError,
  NetworkError,
  ServerError,
  UnauthorizedError,
} from "@binance/derivatives-trading-usds-futures";
import { BINANCE_ERROR_CODE_BACKEND_TIMEOUT } from "../../constants/index.js";
import {
  fromConnectorError,
  isExchangeError,
  makeExchangeError,
} from "../errors.js";

describe("ExchangeError", () => {
  test("构造并推导 retryable", () => {
    const err = makeExchangeError("限频", "RATE_LIMITED");
    assert.equal(err.retryable, true);
    assert.equal(err.kind, "RATE_LIMITED");
    const invalid = makeExchangeError("参数非法");
    assert.equal(invalid.retryable, false);
    assert.equal(invalid.kind, "INVALID_PARAMS");
  });

  test("isExchangeError 判断", () => {
    assert.equal(isExchangeError(makeExchangeError("x")), true);
    assert.equal(isExchangeError(new Error("x")), false);
  });
});

describe("fromConnectorError", () => {
  test("已是 ExchangeError 幂等返回", () => {
    const err = makeExchangeError("x");
    assert.equal(fromConnectorError(err), err);
  });

  test("instanceof 分类", () => {
    assert.equal(fromConnectorError(new BadRequestError("bad")).kind, "INVALID_PARAMS");
    assert.equal(fromConnectorError(new UnauthorizedError("unauth")).kind, "UNAUTHORIZED");
    assert.equal(fromConnectorError(new ServerError("5xx")).kind, "SERVER_ERROR");
    assert.equal(fromConnectorError(new NetworkError("net")).kind, "NETWORK");
  });

  test("-1007 归为 SERVER_ERROR（可重试）", () => {
    const err = new Error("Send status unknown") as Error & { code?: number };
    err.code = BINANCE_ERROR_CODE_BACKEND_TIMEOUT;
    const normalized = fromConnectorError(err);
    assert.equal(normalized.kind, "SERVER_ERROR");
    assert.equal(normalized.retryable, true);
    assert.equal(normalized.code, BINANCE_ERROR_CODE_BACKEND_TIMEOUT);
  });

  test("非 Error 兜底 UNKNOWN", () => {
    assert.equal(fromConnectorError("oops").kind, "UNKNOWN");
  });
});
