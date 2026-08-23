#!/usr/bin/env node
/**
 * Binance MCP Server 入口
 *
 * 通过 serveStdio 启动 MCP 服务器：
 * - 启动即加载配置，配置非法时 fail-fast 退出
 * - 工具注册在 buildServer 工厂回调内同步完成（serveStdio 会为各协议时代各实例化一次）
 * - 持有服务句柄并在收到终止信号时优雅关闭传输后退出
 *
 * @module index
 */

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config/index.js";
import { createLogger } from "./utils/logger.js";
import { buildServer } from "./mcp/server.js";

// 启动即校验配置；调用失败会抛错并阻止服务启动
loadConfig();
const log = createLogger({ name: "main" });

const handle = serveStdio(() => {
  log.info("服务器实例创建中");
  return buildServer();
});

// 终止信号下优雅关闭传输（close 幂等），随后显式退出进程
const shutdown = (): void => {
  void handle.close().finally(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
