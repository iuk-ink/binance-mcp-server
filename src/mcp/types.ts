/**
 * MCP 装配层 — 工具定义类型
 *
 * {@link ToolDef} 是将「服务层方法 + 计算层函数」声明为 MCP 工具的契约，
 * 由 {@link createToolRegistrar} 统一注册到 McpServer。
 *
 * @module mcp/types
 */

import type { ToolAnnotations } from "@modelcontextprotocol/server";
import type { z } from "zod/v4";

/**
 * 工具定义（纯声明，不包含注册逻辑）
 */
export interface ToolDef {
  /** 工具名（`tools/list` 暴露给客户端的标识） */
  name: string;
  /** 人类可读标题，客户端展示用 */
  title?: string;
  /** 工具描述：用途 / 使用场景 / 返回内容 / 错误披露 */
  description: string;
  /** 入参 Standard Schema（z.object），由 registerTool 自动校验 */
  schema: z.ZodTypeAny;
  /**
   * 可选输出 Schema（形状固定且根为 object 时声明）
   *
   * 声明后 SDK 会对 `structuredContent` 做校验，并随 `tools/list` 暴露给客户端。
   * 注意：结构化输出经工厂包装（数组 → `{ data }`、原始值 → `{ value }`），
   * 声明 outputSchema 时须与包装后的形状保持一致。
   */
  outputSchema?: z.ZodTypeAny;
  /** 工具注解：readOnly / destructive / idempotent / openWorld */
  annotations?: ToolAnnotations;
  /**
   * 工具执行逻辑
   *
   * @param args - 已通过 schema 校验并解析的入参对象
   * @returns 业务结果（任意可序列化数据，由工厂 await 后包装为双通道输出）
   * @throws 抛出 Error 会被工厂脱敏后转为 isError 结果
   */
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
  /**
   * 可选的内容摘要函数
   *
   * 用于生成 `content` 文本（compact 人类可读摘要）。缺省时工厂用通用摘要
   * （数组→条数、对象→顶层标量、其他→字符串）。结构化全量数据始终由
   * `structuredContent` 承载，摘要不再重复全量以控制上下文体积。
   *
   * @param result - handler 返回的业务结果
   * @returns 供 content 展示的紧凑文本
   */
  summarize?: (result: unknown) => string;
}
