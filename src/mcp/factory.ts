/**
 * MCP 装配层 — 工具注册工厂
 *
 * 统一处理每个工具的注册与包装：
 * - safeCall：try/catch 包装，异常归一为可读错误并脱敏
 * - 双通道输出：`content` 文本摘要 + `structuredContent` 类型化数据
 * - JSON 安全序列化（bigint → number）
 * - 可选 outputSchema 透传，由 SDK 对 structuredContent 做校验
 *
 * @module mcp/factory
 */

import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod/v4";
import { sanitize } from "../utils/format.js";
import type { ToolDef } from "./types.js";

/**
 * 将业务结果包装为全 object 的 structuredContent
 *
 * v2 协议要求 `structuredContent` 根必须为 object：
 * - 对象 → 原样返回
 * - 数组 → 包装为 `{ data: [...] }`
 * - 原始值 / null → 包装为 `{ value }`
 *
 * @param result - 业务结果
 * @returns 恒为 object 的结构化数据
 */
function toStructured(result: unknown): Record<string, unknown> {
  if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  if (Array.isArray(result)) return { data: result };
  return { value: result };
}

/**
 * 生成 content 的紧凑文本摘要（缺省实现）
 *
 * 避免与 structuredContent 携带相同全量数据，控制 AI 上下文体积：
 * - 数组 → 条数；对象 → 顶层标量字段 `k=v`；其余 → 字符串化
 *
 * @param result - 业务结果（已归一化，undefined 均先转为 { ok: true }）
 * @returns 紧凑可读摘要
 */
export function defaultSummarize(result: unknown): string {
  if (result === null) return "无数据";
  if (Array.isArray(result)) return `共 ${result.length} 条记录`;
  if (typeof result === "object") {
    const parts = Object.entries(result as Record<string, unknown>).map(([key, value]) => {
      if (value === null || value === undefined) return `${key}=null`;
      if (Array.isArray(value)) return `${key}=[${value.length}项]`;
      if (typeof value === "object") return `${key}={...}`;
      return `${key}=${String(value)}`;
    });
    return parts.length > 0 ? parts.join(", ") : "空对象";
  }
  return String(result);
}

/**
 * 将业务结果包装为 MCP 工具返回体（双通道）
 *
 * - `content` 为紧凑人类可读摘要（可由工具自定义 {@link ToolDef.summarize}）
 * - `structuredContent` 承载结构化全量数据
 *
 * @param result    - 业务结果
 * @param summarize - 内容摘要函数（缺省用通用摘要）
 * @returns content 文本摘要 + structuredContent 结构化数据
 */
function toToolResult(
  result: unknown,
  summarize: (result: unknown) => string = defaultSummarize,
): {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
} {
  // void 操作（如撤销/改保证金）无数据返回，归一为显式成功标记，避免 content 文本为 undefined
  const safe = result === undefined ? { ok: true } : result;
  return {
    // content 为紧凑摘要，结构化数据由 structuredContent 承载
    content: [{ type: "text", text: summarize(safe) }],
    structuredContent: toStructured(safe),
  };
}

/**
 * 将工具执行异常归一为可读 Error（脱敏后重抛）
 *
 * @param name - 工具名，用于错误前缀
 * @param err  - 捕获的原始异常
 * @returns 脱敏后的 Error，由 registerTool 转为 isError 结果
 */
function toToolError(name: string, err: unknown): Error {
  // 统一取 message（ExchangeError 亦继承 Error），sanitize 脱敏敏感字段
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: number }).code;
  let hint = "";
  // 收敛 ExchangeError.retryable 的语义：作为“可重试”信号挂到错误文本，供客户端决策
  if ((err as { retryable?: boolean }).retryable) {
    hint = "（瞬时性错误，可安全重试）";
  } else if (code === -1021) {
    // -1021 为非可重试错误，另给出时钟偏差 / recvWindow 指引
    hint = "（本机与币安时钟偏差或 BINANCE_RECV_WINDOW 过小）";
  } else if (code === -4061) {
    // -4061 持仓模式不匹配：给出 positionSide 传参与模式查询指引
    hint = "（持仓模式与 positionSide 不匹配：双向模式必须传 positionSide=LONG/SHORT，单向模式须省略；可用 trading_position_mode 查询当前模式）";
  }
  return new Error(`[${name}] ${sanitize(message)}${hint}`);
}

/**
 * 批量注册工具到 McpServer
 *
 * @param server - McpServer 实例
 * @param defs   - 工具定义列表
 */
export function createToolRegistrar(server: McpServer, defs: ToolDef[]): void {
  for (const def of defs) {
    // 显式指定泛型：未声明 outputSchema 时由 SDK 推断会落入弃用的 raw-shape 重载
    server.registerTool<z.ZodTypeAny, z.ZodTypeAny>(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.schema,
        ...(def.outputSchema ? { outputSchema: def.outputSchema } : {}),
        ...(def.annotations ? { annotations: def.annotations } : {}),
      },
      async (args) => {
        try {
          const result = await def.handler(args as Record<string, unknown>);
          return toToolResult(result, def.summarize);
        } catch (err) {
          throw toToolError(def.name, err);
        }
      },
    );
  }
}
