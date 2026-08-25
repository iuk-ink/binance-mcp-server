/**
 * MCP 装配层 — 服务器装配
 *
 * 拆分为两层，供不同传输模式复用：
 * - {@link buildServices}：重资源层（交易所客户端 / 行情缓存 / 交易服务），
 *   stdio 每进程一套；HTTP 模式进程级共享（缓存跨请求存活）
 * - {@link buildServer}：轻量实例层（McpServer + 工具注册），
 *   stdio 在 serveStdio 工厂回调内创建；HTTP 模式每请求创建（createMcpHandler 工厂）
 *
 * @module mcp/server
 */

import { McpServer } from "@modelcontextprotocol/server";
import { loadConfig } from "../config/index.js";
import { AccountService } from "../exchange/account.js";
import { getClient } from "../exchange/client.js";
import { MarketService } from "../exchange/market.js";
import { TradeService } from "../exchange/trade.js";
import type { BinanceConfig } from "../config/schema.js";
import { createLogger } from "../utils/logger.js";
import { buildToolDefs } from "../tools/index.js";
import { createToolRegistrar } from "./factory.js";

/** 共享服务上下文（重资源层：客户端 / 缓存 / 交易服务） */
export interface ServiceContext {
  config: Readonly<BinanceConfig>;
  market: MarketService;
  account: AccountService | undefined;
  trade: TradeService | undefined;
}

/**
 * 构建共享服务上下文（重资源层）
 *
 * - 交易所客户端与两级行情缓存随此上下文生命周期存活
 * - 交易服务仅在配置币安凭证时创建，未配置时交易域工具不注册
 *
 * @returns 共享服务上下文
 */
export function buildServices(): ServiceContext {
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

  return { config, market, account, trade };
}

/**
 * 构建 MCP 服务器实例（轻量层：McpServer + 工具注册）
 *
 * - 缺省 services 时自建（stdio 单进程模式，与既有行为一致）
 * - HTTP 模式传入共享 services：每请求仅重建 McpServer 壳，行情缓存跨请求复用
 *
 * @param services - 可选共享服务上下文
 * @returns 已注册全部工具的 McpServer
 */
export function buildServer(services: ServiceContext = buildServices()): McpServer {
  const { config } = services;
  const server = new McpServer(
    { name: config.serverName, version: config.serverVersion },
    { capabilities: { tools: {} } },
  );

  createToolRegistrar(server, buildToolDefs(services));
  return server;
}
