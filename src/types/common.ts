/**
 * Binance MCP Server — 统一类型定义
 *
 * @module types/common
 * @description
 * 定义项目中使用的公共 TypeScript 类型和接口。
 * ToolDefinition 是所有 MCP 工具的泛型基类，贯穿整个工具注册链路。
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

/**
 * MCP 工具定义泛型接口
 *
 * @description
 * 每个 MCP 工具由三个核心要素组成：
 * - name: 工具的唯一名称（用于 LLM 调用识别）
 * - description: 工具功能的中文描述
 * - schema: Zod Schema，McpServer.registerTool() 会自动转为 JSON Schema
 * - handler: 工具执行函数，接收 Zod 校验后的参数，返回 MCP 标准响应
 *
 * 该接口使用泛型 Args 参数化输入类型，但由于 MCP SDK v1 的 registerTool
 * 内部已经做了 Zod 校验和类型推导，外部使用时 Args 可设为 unknown。
 *
 * @template Args - 工具输入参数类型，默认 unknown
 */
export interface ToolDefinition<Args = unknown> {
  /** 工具唯一名称，如 `futures_klines` */
  name: string;
  /** 工具功能的中文描述 */
  description: string;
  /** Zod Schema 定义，用于输入校验和 JSON Schema 自动生成 */
  schema: z.ZodTypeAny;
  /** 工具执行函数，接收校验后的参数，返回标准 MCP 调用结果 */
  handler: (args: Args) => Promise<CallToolResult>;
}

/**
 * Binance API 客户端动态类型
 *
 * @description
 * binance-api-node 是 CJS 模块，通过 createRequire 动态加载。
 * 其返回的方法无法在编译期获取精确类型，因此使用此动态类型标注。
 * 避免在多处重复书写 Record<string, (...args: unknown[]) => unknown>。
 */
export type BinanceClient = Record<string, (...args: unknown[]) => unknown>;
