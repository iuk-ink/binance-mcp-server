#!/usr/bin/env node
/**
 * Binance MCP Server 入口
 *
 * 按 MCP_TRANSPORT 分发传输层：
 * - stdio（缺省）：serveStdio 启动，工具注册在工厂回调内同步完成（各协议时代各实例化一次）
 * - http：Streamable HTTP 传输（MCP_TRANSPORT=http），见 mcp/http.ts
 *
 * 共同行为：启动即加载配置（非法 fail-fast 退出）；收到终止信号时优雅关闭后退出。
 *
 * @module index
 */

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config/index.js";
import { createHttpMcpServer } from "./mcp/http.js";
import { buildServer } from "./mcp/server.js";
import { createLogger } from "./utils/logger.js";

// 启动即校验配置；调用失败会抛错并阻止服务启动
const config = loadConfig();
const log = createLogger({ name: "main" });

/** 终止信号下优雅关闭（close 幂等），随后显式退出进程 */
function installShutdown(close: () => Promise<void>): void {
  const shutdown = (): void => {
    void close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (config.transport.mode === "http") {
  // Streamable HTTP 模式：每请求轻量 McpServer 实例，重资源层（缓存/交易服务）进程级共享
  const httpServer = createHttpMcpServer();
  await httpServer.start();
  installShutdown(httpServer.close);
} else {
  // stdio 模式：本地进程级接入（npx 直启默认路径）
  const handle = serveStdio(() => {
    log.info("服务器实例创建中");
    return buildServer();
  });
  installShutdown(() => handle.close());
}
