/**
 * Binance MCP Server v2.0 — 期货领域模块导出
 *
 * @module domain/futures
 * @description
 * 聚合导出期货公开和认证工具的工厂函数，供 server.ts 统一注册。
 *
 * 架构设计说明：
 * - public.ts 提供公开 API 工具（无需认证）
 * - authenticated.ts 提供认证 API 工具（需要 API Key）
 * - 两个模块独立维护、独立测试，互不依赖
 */

export { createFuturesPublicTools } from './public.js';
export { createFuturesAuthenticatedTools } from './authenticated.js';
