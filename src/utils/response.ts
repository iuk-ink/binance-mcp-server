/**
 * Binance MCP Server — MCP 标准响应工厂
 *
 * @module utils/response
 * @description
 * 提供统一的 MCP CallToolResult 构造方法，所有工具的 handler 共用。
 * 避免在每个领域模块中重复定义 ok() 函数。
 *
 * 核心函数：
 * - ok(): 将任意数据包装为 MCP 标准响应格式
 * - wrapHandler(): 为指标 handler 统一包装 try/catch 和错误日志
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logError } from './error-handling.js';

/**
 * 构造标准的 MCP 成功响应
 *
 * @description
 * 将传入的数据对象 JSON.stringify(indent=2) 格式化后嵌入 MCP 标准响应。
 * MCP 协议要求返回 { content: [{ type: 'text', text: '...' }] } 格式。
 *
 * @param data - 要返回的数据对象
 * @returns MCP 标准响应格式
 */
export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/**
 * 包装指标 handler，统一 try/catch 和错误日志
 *
 * @description
 * 将所有指标工具的 handler 用统一的异常处理逻辑包装。
 * 捕获异常后自动记录日志（附带工具名上下文）并返回标准错误响应，
 * 避免每个工具重复书写 try/catch 样板代码。
 *
 * 用法：
 * ```typescript
 * handler: wrapHandler((args) => {
 *   const i = new SMA(args.interval);
 *   for (const v of args.values) i.add(v);
 *   return { indicator: 'SMA', interval: args.interval, last: i.getResult() };
 * }, 'indicator_sma'),
 * ```
 *
 * @param fn - 实际的业务逻辑函数，接收校验后的参数，返回数据对象
 * @param toolName - 工具名称，自动附加到错误日志上下文中
 * @returns 包装后的 handler 函数，签名符合 ToolDefinition.handler
 */
export function wrapHandler<T>(
  fn: (args: T) => unknown | Promise<unknown>,
  toolName?: string,
): (args: unknown) => Promise<CallToolResult> {
  return async (args: unknown) => {
    try {
      const data = await fn(args as T);
      return ok(data);
    } catch (e) {
      logError(e as Error, toolName ? { tool: toolName } : undefined);
      return ok({ error: true, message: (e as Error).message });
    }
  };
}
