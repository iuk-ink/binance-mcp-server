/**
 * 配置层单元测试
 *
 * 覆盖 env 读取器、schema 跨字段校验与 loadConfig 单例行为。
 *
 * @module config/__tests__/config
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { envBool, envEnum, envInt, envStr, redact } from "../env.js";
import {
  binanceConfigSchema,
  isLocalhostBind,
  isWildcardBind,
  transportConfigSchema,
} from "../schema.js";

describe("env 读取器", () => {
  test("envStr 读取并回退默认值", () => {
    const prev = process.env.TEST_STR;
    process.env.TEST_STR = "abc";
    assert.equal(envStr("TEST_STR", "d"), "abc");
    delete process.env.TEST_STR;
    assert.equal(envStr("TEST_STR", "d"), "d");
    if (prev === undefined) delete process.env.TEST_STR;
    else process.env.TEST_STR = prev;
  });

  test("envInt 解析整数并拒绝非法值", () => {
    const prev = process.env.TEST_INT;
    process.env.TEST_INT = "42";
    assert.equal(envInt("TEST_INT", 0), 42);
    process.env.TEST_INT = "abc";
    assert.throws(() => envInt("TEST_INT", 0), /不是有效的整数/);
    if (prev === undefined) delete process.env.TEST_INT;
    else process.env.TEST_INT = prev;
  });

  test("envBool 支持多种字面量", () => {
    const prev = process.env.TEST_BOOL;
    for (const [raw, expected] of [
      ["true", true], ["1", true], ["yes", true], ["on", true],
      ["false", false], ["0", false], ["no", false], ["off", false],
      ["TRUE", true],
    ] as const) {
      process.env.TEST_BOOL = raw;
      assert.equal(envBool("TEST_BOOL", false), expected, `raw=${raw}`);
    }
    process.env.TEST_BOOL = "maybe";
    assert.throws(() => envBool("TEST_BOOL", false), /不是有效的布尔值/);
    if (prev === undefined) delete process.env.TEST_BOOL;
    else process.env.TEST_BOOL = prev;
  });

  test("envEnum 校验白名单", () => {
    const prev = process.env.TEST_ENUM;
    process.env.TEST_ENUM = "info";
    assert.equal(envEnum("TEST_ENUM", ["debug", "info"] as const, "info"), "info");
    process.env.TEST_ENUM = "verbose";
    assert.throws(() => envEnum("TEST_ENUM", ["debug", "info"] as const, "info"), /无效/);
    if (prev === undefined) delete process.env.TEST_ENUM;
    else process.env.TEST_ENUM = prev;
  });

  test("redact 脱敏规则", () => {
    assert.equal(redact("short"), "****");
    assert.equal(redact("abcdefghijkl"), "abcd****ijkl");
  });
});

describe("binanceConfigSchema 跨字段校验", () => {
  const base = {
    apiKey: "",
    apiSecret: "",
    basePath: "https://example.com",
    timeout: 10000,
    retries: 3,
    backoff: 1000,
    recvWindow: 5000,
    testnet: true,
    demoTrading: false,
    serverName: "s",
    serverVersion: "1.0.0",
    logLevel: "info",
    enabledToolDomains: ["market", "trading"],
    transport: { mode: "stdio", http: { host: "127.0.0.1", port: 3100, allowedHosts: [], token: "" } },
  };

  test("合法配置通过", () => {
    const result = binanceConfigSchema.safeParse(base);
    assert.equal(result.success, true);
  });

  test("testnet 与 demoTrading 互斥", () => {
    const result = binanceConfigSchema.safeParse({ ...base, testnet: true, demoTrading: true });
    assert.equal(result.success, false);
    assert.match(JSON.stringify(result.error?.issues ?? []), /不能同时为 true/);
  });

  test("凭证必须成对", () => {
    const result = binanceConfigSchema.safeParse({ ...base, apiKey: "key", apiSecret: "" });
    assert.equal(result.success, false);
    assert.match(JSON.stringify(result.error?.issues ?? []), /必须成对配置/);
  });

  test("非法工具域 fail-fast", () => {
    const result = binanceConfigSchema.safeParse({
      ...base,
      enabledToolDomains: ["market", "invalid"],
    });
    assert.equal(result.success, false);
  });
});

describe("transportConfigSchema 传输配置", () => {
  const httpBase = {
    mode: "http",
    http: { host: "127.0.0.1", port: 3100, allowedHosts: ["127.0.0.1"], token: "" },
  } as const;

  test("localhost 绑定无令牌可通过", () => {
    const result = transportConfigSchema.safeParse(httpBase);
    assert.equal(result.success, true);
  });

  test("非 localhost 绑定缺令牌被拦截", () => {
    const result = transportConfigSchema.safeParse({
      ...httpBase,
      http: { ...httpBase.http, host: "192.168.1.10" },
    });
    assert.equal(result.success, false);
    assert.match(JSON.stringify(result.error?.issues ?? []), /MCP_HTTP_TOKEN/);
  });

  test("非 localhost 绑定配置令牌后通过", () => {
    const result = transportConfigSchema.safeParse({
      ...httpBase,
      http: { ...httpBase.http, host: "192.168.1.10", token: "secret-token" },
    });
    assert.equal(result.success, true);
  });

  test("通配绑定缺 Host 白名单被拦截", () => {
    const result = transportConfigSchema.safeParse({
      ...httpBase,
      http: { ...httpBase.http, host: "0.0.0.0", token: "secret-token", allowedHosts: [] },
    });
    assert.equal(result.success, false);
    assert.match(JSON.stringify(result.error?.issues ?? []), /MCP_HTTP_ALLOWED_HOSTS/);
  });

  test("通配绑定配置白名单后通过", () => {
    const result = transportConfigSchema.safeParse({
      ...httpBase,
      http: { ...httpBase.http, host: "0.0.0.0", token: "t", allowedHosts: ["example.com"] },
    });
    assert.equal(result.success, true);
  });

  test("非法传输模式被拦截", () => {
    const result = transportConfigSchema.safeParse({ ...httpBase, mode: "ws" });
    assert.equal(result.success, false);
  });

  test("端口越界被拦截", () => {
    const result = transportConfigSchema.safeParse({
      ...httpBase,
      http: { ...httpBase.http, port: 70000 },
    });
    assert.equal(result.success, false);
  });

  test("stdio 模式不校验 HTTP 安全约束", () => {
    // stdio 下 http 块仅是占位配置，即使 host 通配且无令牌也应放行
    const result = transportConfigSchema.safeParse({
      mode: "stdio",
      http: { host: "0.0.0.0", port: 3100, allowedHosts: [], token: "" },
    });
    assert.equal(result.success, true);
  });

  test("localhost 系绑定判定覆盖 IPv6", () => {
    assert.equal(isLocalhostBind("::1"), true);
    assert.equal(isLocalhostBind("[::1]"), true);
    assert.equal(isLocalhostBind("LocalHost"), true);
    assert.equal(isLocalhostBind("192.168.1.10"), false);
  });

  test("通配绑定判定覆盖 IPv6 与空串", () => {
    assert.equal(isWildcardBind("0.0.0.0"), true);
    assert.equal(isWildcardBind("::"), true);
    assert.equal(isWildcardBind(""), true);
    assert.equal(isWildcardBind("127.0.0.1"), false);
  });
});
