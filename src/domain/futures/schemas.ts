/**
 * Binance MCP Server — 期货领域 Zod Schema 定义（聚合导出）
 *
 * @module domain/futures/schemas
 * @description
 * 向后兼容的聚合导出。所有 Schema 已按类别拆分到子文件：
 * - schemas/public.ts — 10 个公开工具参数 Schema
 * - schemas/authenticated.ts — 18 个认证工具参数 Schema
 */

export * from './schemas/public.js';
export * from './schemas/authenticated.js';
