/**
 * MCP 装配层集成测试
 *
 * 用 InMemoryTransport 连接真实 McpServer，裸 JSON-RPC 驱动：
 * initialize → tools/list → tools/call。
 * - 用纯计算示例工具验证 createToolRegistrar 的双通道输出 / 注解 / 错误归一
 * - 用 buildServer 验证种子工具注册、凭证条件与 MCP_TOOL_DOMAINS 域过滤
 *
 * @module mcp/__tests__/server
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InMemoryTransport,
  McpServer,
  type Transport,
} from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { resetConfig } from "../../config/index.js";
import { createToolRegistrar, defaultSummarize } from "../factory.js";
import { buildServer } from "../server.js";

/** 发送 JSON-RPC 请求并等待同 id 的响应 */
function sendRequest(
  transport: Transport,
  id: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    transport.onmessage = (message) => {
      const msg = message as { id?: unknown; result?: unknown; error?: unknown };
      if (msg.id === id) resolve(msg);
    };
    void transport.send({
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    });
  });
}

/** 完成初始化握手（2026 协议时代） */
async function initialize(transport: Transport): Promise<void> {
  const init = await sendRequest(transport, 1, "initialize", {
    protocolVersion: "2026-07-28",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  });
  assert.equal(init.error, undefined, `initialize 应成功：${JSON.stringify(init.error)}`);
}

/** 从 tools/list 响应中提取工具名数组 */
async function listToolNames(
  transport: Transport,
  id: number,
): Promise<{ name: string; annotations?: unknown }[]> {
  const list = await sendRequest(transport, id, "tools/list", {});
  const result = (list.result ?? list) as { tools?: { name: string; annotations?: unknown }[] };
  return result.tools ?? [];
}

// ============================================================================
//  createToolRegistrar — 纯计算示例工具（不触网）
// ============================================================================

test("createToolRegistrar 注册纯计算工具并返回双通道输出", async () => {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  createToolRegistrar(server, [
    {
      name: "math_add",
      title: "加法",
      description: "两个数字相加，返回结构化结果",
      schema: z.object({ a: z.number(), b: z.number() }),
      outputSchema: z.object({ sum: z.number() }),
      annotations: { readOnlyHint: true },
      handler: ({ a, b }) => ({ sum: (a as number) + (b as number) }),
    },
    {
      name: "noop_ok",
      description: "void 操作，应归一为 { ok: true }",
      schema: z.object({}),
      handler: () => undefined,
    },
    {
      name: "fail_tool",
      description: "抛错工具，应转为脱敏 isError 结果",
      schema: z.object({ secret: z.string() }),
      handler: () => {
        throw new Error("请求失败: apiKey=sk-secret-token");
      },
    },
  ]);

  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  void server.connect(serverSide);
  await initialize(client);

  // tools/list：工具集与注解暴露
  const tools = await listToolNames(client, 2);
  const names = tools.map((t) => t.name);
  assert.ok(names.includes("math_add"));
  assert.ok(names.includes("noop_ok"));
  assert.ok(names.includes("fail_tool"));
  const mathTool = tools.find((t) => t.name === "math_add");
  const annotations = (mathTool?.annotations ?? {}) as Record<string, unknown>;
  assert.equal(annotations.readOnlyHint, true);

  // tools/call：structuredContent 双通道 + outputSchema 校验通过
  const call = await sendRequest(client, 3, "tools/call", {
    name: "math_add",
    arguments: { a: 2, b: 3 },
  });
  assert.equal(call.error, undefined, `tools/call 应成功：${JSON.stringify(call.error)}`);
  const result = call.result as {
    structuredContent?: { sum?: number };
    content?: unknown;
    isError?: boolean;
  };
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent?.sum, 5);
  assert.ok(Array.isArray(result.content), "应返回 content 文本摘要");

  // void 结果归一为 { ok: true }
  const okCall = await sendRequest(client, 4, "tools/call", {
    name: "noop_ok",
    arguments: {},
  });
  const okResult = okCall.result as { structuredContent?: Record<string, unknown> };
  assert.deepEqual(okResult.structuredContent, { ok: true });

  // 抛错工具 → isError + 脱敏（密钥不得泄露）
  const failCall = await sendRequest(client, 5, "tools/call", {
    name: "fail_tool",
    arguments: { secret: "x" },
  });
  const failResult = failCall.result as {
    isError?: boolean;
    content?: { text?: string }[];
  };
  assert.equal(failResult.isError, true);
  const text = failResult.content?.[0]?.text ?? "";
  assert.ok(text.includes("[fail_tool]"), "错误应带工具名前缀");
  assert.ok(!text.includes("sk-secret-token"), "错误消息应脱敏敏感字段");

  await server.close();
});

// ============================================================================
//  buildServer — 种子工具注册 / 凭证条件 / 域过滤
// ============================================================================

test("buildServer 无凭证时注册市场种子工具、不注册交易工具", async () => {
  const prevKey = process.env.BINANCE_API_KEY;
  const prevSecret = process.env.BINANCE_API_SECRET;
  process.env.BINANCE_API_KEY = "";
  process.env.BINANCE_API_SECRET = "";
  resetConfig();
  try {
    const server = buildServer();
    const [client, serverSide] = InMemoryTransport.createLinkedPair();
    void server.connect(serverSide);
    await initialize(client);

    const tools = await listToolNames(client, 2);
    const names = tools.map((t) => t.name);
    for (const expected of ["market_ping", "market_time", "market_price"]) {
      assert.ok(names.includes(expected), `应包含工具 ${expected}`);
    }
    assert.ok(!names.includes("trading_balance"), "未配置凭证时不应注册交易工具");

    await server.close();
  } finally {
    if (prevKey === undefined) delete process.env.BINANCE_API_KEY;
    else process.env.BINANCE_API_KEY = prevKey;
    if (prevSecret === undefined) delete process.env.BINANCE_API_SECRET;
    else process.env.BINANCE_API_SECRET = prevSecret;
    resetConfig();
  }
});

test("MCP_TOOL_DOMAINS 过滤工具域", async () => {
  const prev = process.env.MCP_TOOL_DOMAINS;
  process.env.MCP_TOOL_DOMAINS = "trading";
  resetConfig();
  try {
    const server = buildServer();
    const [client, serverSide] = InMemoryTransport.createLinkedPair();
    void server.connect(serverSide);
    await initialize(client);

    const names = (await listToolNames(client, 2)).map((t) => t.name);
    assert.ok(!names.includes("market_ping"), "未启用 market 域时不应注册市场工具");

    await server.close();
  } finally {
    if (prev === undefined) delete process.env.MCP_TOOL_DOMAINS;
    else process.env.MCP_TOOL_DOMAINS = prev;
    resetConfig();
  }
});

test("MCP_TOOL_DOMAINS 大小写不敏感", async () => {
  const prev = process.env.MCP_TOOL_DOMAINS;
  process.env.MCP_TOOL_DOMAINS = "MARKET";
  resetConfig();
  try {
    const server = buildServer();
    const [client, serverSide] = InMemoryTransport.createLinkedPair();
    void server.connect(serverSide);
    await initialize(client);

    const names = (await listToolNames(client, 2)).map((t) => t.name);
    assert.ok(names.includes("market_ping"), "大写 MARKET 应归一化后启用 market 域");

    await server.close();
  } finally {
    if (prev === undefined) delete process.env.MCP_TOOL_DOMAINS;
    else process.env.MCP_TOOL_DOMAINS = prev;
    resetConfig();
  }
});

test("defaultSummarize 生成紧凑摘要而非全量", () => {
  assert.equal(defaultSummarize([1, 2, 3]), "共 3 条记录");
  assert.equal(defaultSummarize(null), "无数据");
  assert.equal(defaultSummarize(42), "42");
  const summary = defaultSummarize({
    symbol: "BTCUSDT",
    price: 50000,
    nested: { a: 1 },
    list: [1, 2],
  });
  assert.ok(summary.includes("symbol=BTCUSDT"));
  assert.ok(summary.includes("price=50000"));
  // 嵌套对象 / 数组只保留缩略占位，避免重复全量
  assert.ok(summary.includes("nested={...}"));
  assert.ok(summary.includes("list=[2项]"));
});

test("工具错误附带可重试与时钟偏差指引", async () => {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  createToolRegistrar(server, [
    {
      name: "retry_fail",
      description: "触发可重试错误",
      schema: z.object({}),
      handler: () => {
        const err = new Error("rate limited") as Error & { retryable?: boolean };
        err.retryable = true;
        throw err;
      },
    },
    {
      name: "skew_fail",
      description: "触发 -1021 时间窗错误",
      schema: z.object({}),
      handler: () => {
        const err = new Error(
          "Timestamp for this request is outside of the recvWindow.",
        ) as Error & { code?: number };
        err.code = -1021;
        throw err;
      },
    },
    {
      name: "hedge_fail",
      description: "触发 -4061 持仓模式错误",
      schema: z.object({}),
      handler: () => {
        const err = new Error(
          "Order's position side does not match user's setting.",
        ) as Error & { code?: number };
        err.code = -4061;
        throw err;
      },
    },
  ]);
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  void server.connect(serverSide);
  await initialize(client);

  const retryCall = await sendRequest(client, 2, "tools/call", {
    name: "retry_fail",
    arguments: {},
  });
  const retryText = ((retryCall.result as { content?: { text?: string }[] }).content?.[0]?.text) ?? "";
  assert.ok(retryText.includes("重试"), `应含可重试提示：${retryText}`);

  const skewCall = await sendRequest(client, 3, "tools/call", {
    name: "skew_fail",
    arguments: {},
  });
  const skewText = ((skewCall.result as { content?: { text?: string }[] }).content?.[0]?.text) ?? "";
  assert.ok(skewText.includes("时钟偏差"), `应含时钟偏差提示：${skewText}`);

  const hedgeCall = await sendRequest(client, 4, "tools/call", {
    name: "hedge_fail",
    arguments: {},
  });
  const hedgeText = ((hedgeCall.result as { content?: { text?: string }[] }).content?.[0]?.text) ?? "";
  assert.ok(hedgeText.includes("持仓模式"), `应含持仓模式提示：${hedgeText}`);
  assert.ok(hedgeText.includes("positionSide"), `应含 positionSide 指引：${hedgeText}`);

  await server.close();
});
