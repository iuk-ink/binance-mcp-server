/**
 * 配置 Schema — 基于 zod 的声明式校验层
 *
 * 职责：只定义「配置长什么样」（字段形状 + 范围 + 跨字段关系）。
 * 原始值读取由 env.ts 完成，对象组装与校验由 index.ts 完成。
 * 类型通过 z.infer 自动推导，与运行时校验同源，杜绝「类型与实际不符」。
 *
 * @module config/schema
 */

import { z } from "zod/v4";
import { LOG_LEVEL_VALUES } from "../utils/logger.js";

// ============================================================================
//  工具域 — 通过环境变量 MCP_TOOL_DOMAINS 控制注册范围
// ============================================================================

/** 全部工具域（用于 MCP_TOOL_DOMAINS 校验与默认值） */
export const TOOL_DOMAIN_VALUES = ["market", "trading", "indicator", "analysis"] as const;

/** 工具域类型 */
export type ToolDomain = (typeof TOOL_DOMAIN_VALUES)[number];

// ============================================================================
//  Proxy — 交易所代理
// ============================================================================

/** 交易所代理配置 */
export const proxySchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["http", "https"]),
  auth: z
    .object({
      username: z.string().min(1),
      password: z.string(),
    })
    .optional(),
});

// ============================================================================
//  Binance — 币安 USD-M 合约凭证、环境与客户端参数
// ============================================================================

export const binanceConfigSchema = z
  .object({
    apiKey: z.string(),
    apiSecret: z.string(),
    basePath: z.url(),
    timeout: z.number().int().min(1000).max(60000),
    retries: z.number().int().min(0).max(10),
    backoff: z.number().int().min(100).max(30000),
    recvWindow: z.number().int().min(1000).max(60000),
    proxy: proxySchema.optional(),
    testnet: z.boolean(),
    demoTrading: z.boolean(),
    serverName: z.string().min(1),
    serverVersion: z.string().min(1),
    logLevel: z.enum(LOG_LEVEL_VALUES),
    enabledToolDomains: z
      .array(z.enum(TOOL_DOMAIN_VALUES))
      .default([...TOOL_DOMAIN_VALUES]),
  })
  .superRefine((value, ctx) => {
    // testnet 与 demoTrading 互斥：同时启用会指向不同环境，造成混乱
    if (value.testnet && value.demoTrading) {
      ctx.addIssue({
        code: "custom",
        message:
          "testnet 与 demoTrading 不能同时为 true，请二选一（使用 demo 需将 BINANCE_TESTNET 设为 false）",
        path: ["demoTrading"],
      });
    }
    // 币安凭证必须成对：只配置其一视为配置错误
    const hasApiKey = value.apiKey !== "";
    const hasApiSecret = value.apiSecret !== "";
    if (hasApiKey !== hasApiSecret) {
      ctx.addIssue({
        code: "custom",
        message: "BINANCE_API_KEY 与 BINANCE_API_SECRET 必须成对配置，不能只配置其一",
        path: ["apiKey"],
      });
    }
  });

/** 校验后的最终配置类型 */
export type BinanceConfig = z.infer<typeof binanceConfigSchema>;

/** 代理配置类型 */
export type ProxyConfig = z.infer<typeof proxySchema>;
