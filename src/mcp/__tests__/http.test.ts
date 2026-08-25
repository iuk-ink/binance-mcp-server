/**
 * Streamable HTTP 装配层单元测试
 *
 * 真实监听随机端口 + 原生 fetch 断言。v2 官方 createMcpHandler 架构下
 * 响应为单 JSON（responseMode auto），无 SSE 挂起问题。
 *
 * 覆盖：/health 探活、路径 404、Host 守卫（DNS rebinding 防护）、
 * Bearer 认证、initialize / tools/list 协议交换。
 *
 * @module mcp/__tests__/http
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHttpMcpServer } from "../http.js";
import { resetConfig } from "../../config/index.js";

/** 受测环境变量集合（withHttpServer 统一保存/恢复） */
const ENV_KEYS = [
  "MCP_TRANSPORT",
  "MCP_HTTP_HOST",
  "MCP_HTTP_PORT",
  "MCP_HTTP_TOKEN",
  "MCP_HTTP_ALLOWED_HOSTS",
] as const;

/**
 * 启动受测 HTTP 服务器并执行回调（自动清理）
 *
 * @param envOverrides - 环境变量覆盖（MCP_TRANSPORT 固定为 http）
 * @param fn           - 回调（入参为服务基址）
 */
async function withHttpServer(
  envOverrides: Record<string, string> = {},
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]] as const);
  process.env.MCP_TRANSPORT = "http";
  process.env.MCP_HTTP_HOST = "127.0.0.1";
  for (const [key, value] of Object.entries(envOverrides)) {
    process.env[key] = value;
  }
  resetConfig();
  const server = createHttpMcpServer({ port: 0 });
  try {
    await server.start();
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await server.close();
    resetConfig();
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** 构造 JSON-RPC 请求体 */
function rpc(method: string, id: number | null, params?: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

/** initialize 请求参数 */
const INIT_PARAMS = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test", version: "1.0.0" },
};

/**
 * 解析 MCP 响应体为 JSON-RPC 消息
 *
 * 兼容两种格式：纯 JSON（现代协议 responseMode auto）与
 * SSE data 帧（legacy 2025 流量 stateless 服务）。
 *
 * @param resp - fetch 响应
 * @returns 解析后的 JSON-RPC 消息对象
 */
async function readRpc(resp: Response): Promise<{ result?: unknown }> {
  const text = await resp.text();
  if (text.startsWith("{")) return JSON.parse(text) as { result?: unknown };
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  assert.ok(dataLine, `响应应为 JSON 或 SSE data 帧: ${text.slice(0, 80)}`);
  return JSON.parse(dataLine.slice("data: ".length)) as { result?: unknown };
}

describe("Streamable HTTP 装配层", () => {
  test("/health 返回运行状态且无需认证", async () => {
    await withHttpServer({}, async (baseUrl) => {
      const resp = await fetch(`${baseUrl}/health`);
      assert.equal(resp.status, 200);
      const body = (await resp.json()) as { ok: boolean; uptime: number };
      assert.equal(body.ok, true);
      assert.equal(typeof body.uptime, "number");
    });
  });

  test("未知路径返回 404", async () => {
    await withHttpServer({}, async (baseUrl) => {
      const resp = await fetch(`${baseUrl}/unknown`);
      assert.equal(resp.status, 404);
    });
  });

  test("Host 头不在白名单被 403 拦截（DNS rebinding 防护）", async () => {
    await withHttpServer({}, async (baseUrl) => {
      const { port } = new URL(baseUrl);
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port: Number(port),
            path: "/health",
            headers: { host: "evil.example.com" },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on("error", reject);
        req.end();
      });
      assert.equal(status, 403);
    });
  });

  test("initialize 请求返回 JSON-RPC 结果", async () => {
    await withHttpServer({}, async (baseUrl) => {
      const resp = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: rpc("initialize", 1, INIT_PARAMS),
      });
      assert.equal(resp.status, 200);
      const body = (await readRpc(resp)) as {
        result?: { serverInfo?: { name?: string }; tools?: unknown };
      };
      assert.ok(body.result, "应返回 result");
      assert.equal(body.result.serverInfo?.name, "binance-mcp-server");
    });
  });

  test("tools/list 返回全部注册工具", async () => {
    await withHttpServer({}, async (baseUrl) => {
      const headers = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      // stateless 服务：initialize 与后续请求均为独立交换
      const initResp = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers,
        body: rpc("initialize", 1, INIT_PARAMS),
      });
      assert.equal(initResp.status, 200);
      await readRpc(initResp);

      const listResp = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers,
        body: rpc("tools/list", 2),
      });
      assert.equal(listResp.status, 200);
      const body = (await readRpc(listResp)) as {
        result?: { tools?: { name: string }[] };
      };
      const names = body.result?.tools?.map((t) => t.name) ?? [];
      assert.ok(names.includes("market_ping"), "应包含 market_ping");
      assert.ok(names.includes("market_price"), "应包含 market_price");
    });
  });

  test("Bearer 认证：缺失 / 错误令牌 401，正确令牌放行", async () => {
    await withHttpServer({ MCP_HTTP_TOKEN: "secret-token" }, async (baseUrl) => {
      const headers = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      const noAuth = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers,
        body: rpc("initialize", 1, INIT_PARAMS),
      });
      assert.equal(noAuth.status, 401, "缺失令牌应 401");

      const wrongAuth = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { ...headers, authorization: "Bearer wrong-token" },
        body: rpc("initialize", 1, INIT_PARAMS),
      });
      assert.equal(wrongAuth.status, 401, "错误令牌应 401");

      const okAuth = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { ...headers, authorization: "Bearer secret-token" },
        body: rpc("initialize", 1, INIT_PARAMS),
      });
      assert.equal(okAuth.status, 200, "正确令牌应放行");

      // /health 不受认证保护
      const health = await fetch(`${baseUrl}/health`);
      assert.equal(health.status, 200);
    });
  });

  test("Bearer 认证：认证方案前缀大小写不敏感（RFC 6750/7235）", async () => {
    await withHttpServer({ MCP_HTTP_TOKEN: "secret-token" }, async (baseUrl) => {
      const headers = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      for (const scheme of ["Bearer", "bearer", "BEARER", "BeArEr"]) {
        const resp = await fetch(`${baseUrl}/mcp`, {
          method: "POST",
          headers: { ...headers, authorization: `${scheme} secret-token` },
          body: rpc("initialize", 1, INIT_PARAMS),
        });
        assert.equal(resp.status, 200, `${scheme} 前缀应与标准 Bearer 等价放行`);
      }

      // 大小写不敏感仅限方案前缀，令牌本体仍须精确匹配
      const wrongToken = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { ...headers, authorization: "bearer SECRET-TOKEN" },
        body: rpc("initialize", 1, INIT_PARAMS),
      });
      assert.equal(wrongToken.status, 401, "令牌本体仍区分大小写");

      // 前缀缺失 / 单独前缀无令牌同样 401
      const bare = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { ...headers, authorization: "Bearer " },
        body: rpc("initialize", 1, INIT_PARAMS),
      });
      assert.equal(bare.status, 401, "仅有前缀无令牌应 401");
    });
  });
});
