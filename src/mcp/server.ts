/**
 * MCP 装配层 — 服务器装配
 *
 * {@link buildServer} 在 serveStdio 工厂回调内被调用（每个协议时代各一次），
 * 创建服务实例、组装全部工具并返回 McpServer。工具注册必须在工厂回调内同步完成。
 *
 * @module mcp/server
 */

import { McpServer } from "@modelcontextprotocol/server";
import { loadConfig } from "../config/index.js";
import { AccountService } from "../exchange/account.js";
import { getClient } from "../exchange/client.js";
import { MarketService } from "../exchange/market.js";
import { TradeService } from "../exchange/trade.js";
import { createLogger } from "../utils/logger.js";
import { buildToolDefs } from "../tools/index.js";
import { createToolRegistrar } from "./factory.js";

/**
 * 构建 MCP 服务器（工具注册 + 服务装配）
 *
 * - 客户端与服务实例每次装配时重新创建（供多连接隔离）
 * - 交易服务仅在配置币安凭证时创建，未配置时交易域工具不注册
 * - 服务层日志统一以配置的日志级别创建，避免与环境变量口径漂移
 *
 * @returns 已注册全部工具的 McpServer
 */
export function buildServer(): McpServer {
  const config = loadConfig();
  const client = getClient();
  const market = new MarketService(client);
  const exchangeLogger = createLogger({ name: "exchange", level: config.logLevel });

  const hasCredentials = config.apiKey !== "";
  const account = hasCredentials
    ? new AccountService(
        client,
        config.recvWindow,
        exchangeLogger.child({ component: "account" }),
      )
    : undefined;
  const trade = hasCredentials
    ? new TradeService(
        client,
        market,
        config.recvWindow,
        exchangeLogger.child({ component: "trade" }),
      )
    : undefined;

  const server = new McpServer(
    { name: config.serverName, version: config.serverVersion },
    { capabilities: { tools: {} } },
  );

  createToolRegistrar(server, buildToolDefs({ config, market, account, trade }));
  return server;
}
