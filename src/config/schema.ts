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
//  Transport — 传输模式（stdio / Streamable HTTP）
// ============================================================================

/** 传输模式合法值 */
export const TRANSPORT_MODE_VALUES = ["stdio", "http"] as const;

/** localhost 系监听地址（仅本机绑定，不强制令牌认证）——判定逻辑私有，勿外部引用 */
const LOCALHOST_BIND_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]", "::1"];

/** 通配绑定地址（监听全部网卡，须显式 Host 白名单）——判定逻辑私有，勿外部引用 */
const WILDCARD_BIND_HOSTS: readonly string[] = ["0.0.0.0", "::", ""];

/** HTTP 绑定地址是否属于 localhost 系（仅本机，无需强制令牌认证） */
export function isLocalhostBind(host: string): boolean {
  return LOCALHOST_BIND_HOSTS.includes(host.toLowerCase());
}

/** HTTP 绑定地址是否为通配绑定（监听全部网卡，须显式 Host 白名单） */
export function isWildcardBind(host: string): boolean {
  return WILDCARD_BIND_HOSTS.includes(host.toLowerCase());
}

/**
 * 传输配置 schema
 *
 * 安全约束（superRefine，fail-fast）：
 * - 非 localhost 系绑定必须设置 MCP_HTTP_TOKEN（HTTP 暴露 = 任何人可用服务端凭证交易）
 * - 通配绑定必须显式设置 MCP_HTTP_ALLOWED_HOSTS（特定 IP / 主机名绑定缺省白名单 = [绑定地址]，
 *   由 index.ts 组装时推导；通配绑定无法推导，必须人工声明）
 */
export const transportConfigSchema = z
  .object({
    mode: z.enum(TRANSPORT_MODE_VALUES),
    http: z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      allowedHosts: z.array(z.string().min(1)),
      token: z.string(),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.mode !== "http") return;
    if (!isLocalhostBind(value.http.host) && value.http.token === "") {
      ctx.addIssue({
        code: "custom",
        message:
          "MCP_HTTP_HOST 绑定非本机地址时必须设置 MCP_HTTP_TOKEN（Bearer 令牌认证）",
        path: ["http", "token"],
      });
    }
    if (isWildcardBind(value.http.host) && value.http.allowedHosts.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "MCP_HTTP_HOST 为通配绑定（0.0.0.0 / ::）时必须设置 MCP_HTTP_ALLOWED_HOSTS（Host 白名单，逗号分隔）",
        path: ["http", "allowedHosts"],
      });
    }
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
    transport: transportConfigSchema,
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

/** 传输配置类型 */
export type TransportConfig = z.infer<typeof transportConfigSchema>;
