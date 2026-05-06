#!/usr/bin/env node

/**
 * Binance MCP Server — 应用入口
 *
 * @module index
 * @description
 * MCP 服务器的 Node.js 入口文件。
 * 通过 npm bin 方式发布后，AI 助手通过 npx binance-mcp-server 启动此文件。
 *
 * 启动流程：
 * 1. 加载 .env 环境变量（config/binance.ts 内 dotenv.config()）
 * 2. 创建 McpServer 实例
 * 3. 根据 API Key 配置条件注册工具
 * 4. 启动 StdioServerTransport（通过 stdin/stdout 与 AI 助手通信）
 *
 * 错误处理：
 * - 启动失败时输出错误日志并以 exit code 1 退出
 * - 运行时的错误由各工具的 handler 内部 try/catch 处理
 *
 * @requires node >= 18
 * @requires binance-api-node (期货 REST API)
 * @requires trading-signals (技术指标计算)
 * @requires @modelcontextprotocol/sdk (MCP 协议框架)
 * @requires zod (输入校验 + JSON Schema 生成)
 * @requires dotenv (环境变量加载)
 */

import { startServer } from './server.js';
import { logger } from './utils/logger.js';

startServer().catch((error) => {
  logger.error('服务器启动失败', error);
  process.exit(1);
});
