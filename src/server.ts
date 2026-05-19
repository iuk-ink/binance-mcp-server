/**
 * Binance MCP Server — MCP 服务器核心
 *
 * @module server
 * @description
 * 这是整个应用的"组装车间"。
 *
 * 核心职责：
 * 1. 初始化 McpServer (MCP SDK v1.29) — 使用 @modelcontextprotocol/sdk 的 McpServer 类
 * 2. 创建 Binance 客户端 — 基于配置文件中的期货端点
 * 3. 条件注册工具 — API Key 存在时激活认证工具
 * 4. 启动 StdioServerTransport — 通过标准输入/输出与 AI 助手通信
 *
 * 工具注册策略：
 * ```
 * 公开期货工具 + 技术指标工具  → 始终注册
 * 认证期货工具             → 仅当 BINANCE_API_KEY + BINANCE_API_SECRET 存在时注册
 * ```
 *
 * MCP SDK v1 关键 API：
 * - McpServer: 高级 MCP 服务器封装，提供 registerTool() 方法
 * - StdioServerTransport: 标准输入/输出通信层
 * - registerTool(name, config, callback): 注册工具，Zod Schema 自动转 JSON Schema
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'node:module';

// binance-api-node 仅发布 CJS 产物，ESM 项目通过 createRequire 桥接加载
const requireBinance = createRequire(import.meta.url);
const Binance = requireBinance('binance-api-node').default as (
  options?: Record<string, unknown>,
) => BinanceClient;

import { getBinanceConfig, hasApiCredentials, getServerInfo } from './config/binance.js';
import { logger } from './utils/logger.js';
import { createFuturesPublicTools } from './domain/futures/public.js';
import { createFuturesAuthenticatedTools } from './domain/futures/authenticated.js';
import { createIndicatorTools } from './domain/indicators/index.js';
import type { ToolDefinition, BinanceClient } from './types/common.js';

/**
 * 批量注册工具到 McpServer
 *
 * @description
 * 遍历 ToolDefinition 数组，将每个工具通过 McpServer.registerTool() 注册。
 * MCP SDK 会自动将 Zod Schema 转为 JSON Schema 供 AI 助手理解参数结构。
 *
 * 注册时工具的信息流：
 * 1. tool.name → 工具的 MCP 唯一标识
 * 2. tool.description → AI 可见的功能描述
 * 3. tool.schema → 自动转为 JSON Schema（输入参数定义）
 * 4. tool.handler → 工具被 AI 调用时的执行函数
 *
 * @param server - McpServer 实例
 * @param tools - 待注册的工具定义数组
 */
function registerAll(server: McpServer, tools: ToolDefinition[]): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
      },
      async (args) => tool.handler(args),
    );
  }
}

/**
 * 创建并配置 MCP 服务器
 *
 * @description
 * 此函数是应用的配置入口，负责：
 * 1. 读取环境变量配置
 * 2. 创建 McpServer 实例
 * 3. 初始化 Binance 客户端（含期货端点配置）
 * 4. 执行条件工具注册
 *
 * @returns 配置完成的 McpServer 实例
 */
export async function createServer(): Promise<McpServer> {
  // 读取配置
  const config = getBinanceConfig();
  const serverInfo = getServerInfo();
  const hasAuth = hasApiCredentials();

  // 创建 McpServer — 使用 MCP SDK v1 的高级封装
  const server = new McpServer({
    name: serverInfo.name,
    version: serverInfo.version,
  });

  // 初始化 Binance 客户端
  // 即使没有 API Key 也可以创建 client，公开 API 无需认证
  // proxy 为可选参数，用于企业内网等需要代理访问 API 的场景
  const client = Binance({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    httpFutures: config.httpFutures,
    ...(config.proxy ? { proxy: config.proxy } : {}),
  });

  // ===== 始终注册：公开工具 + 技术指标 =====
  const publicTools = createFuturesPublicTools(client);
  const indicatorTools = createIndicatorTools();
  registerAll(server, publicTools);
  registerAll(server, indicatorTools);
  logger.info(`已注册公开期货工具: ${publicTools.length} 个, 技术指标工具: ${indicatorTools.length} 个`);

  // ===== 条件注册：认证工具仅在配置 API Key 时生效 =====
  if (hasAuth) {
    const authTools = createFuturesAuthenticatedTools(client);
    registerAll(server, authTools);
    logger.info(`已注册认证期货工具: ${authTools.length} 个（检测到 API Key）`);
  } else {
    logger.info(`未检测到 API Key，跳过认证工具注册`);
  }

  return server;
}

/**
 * 启动 MCP 服务器
 *
 * @description
 * 创建标准输入/输出传输层并连接服务器。
 * 该函数被 src/index.ts 调用，作为应用的启动入口。
 *
 * Stdio 模式说明：
 * MCP 协议通过标准输入/输出（stdin/stdout）与 AI 助手通信。
 * 所有日志输出统一使用 console.error（stderr），确保不污染 MCP 数据流。
 */
export async function startServer(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Binance MCP Server v2.0.1 已启动');
}
