/**
 * 配置聚合模块 — 统一导出入口与启动摘要
 *
 * 设计说明：
 * - loadConfig 为惰性单例，首次调用时读取 .env → 组装对象 → zod 校验 →
 *   deep freeze → 缓存，整个进程共享一份不可变配置
 * - 模块加载即执行全量校验，配置不合法直接抛错阻止启动（fail-fast）
 * - 交易所 basePath 按优先级推断：BINANCE_BASE_URL > BINANCE_USE_DEMO > BINANCE_TESTNET
 * - resetConfig 重置缓存，仅供测试隔离使用
 *
 * @module config
 */

import {
  DERIVATIVES_TRADING_USDS_FUTURES_REST_API_DEMO_URL,
  DERIVATIVES_TRADING_USDS_FUTURES_REST_API_PROD_URL,
  DERIVATIVES_TRADING_USDS_FUTURES_REST_API_TESTNET_URL,
} from "@binance/derivatives-trading-usds-futures";
import type { ZodType } from "zod/v4";
import { LOG_LEVEL_VALUES } from "../utils/logger.js";
import { envBool, envEnum, envInt, envStr, redact } from "./env.js";
import { binanceConfigSchema } from "./schema.js";
import type { BinanceConfig, ProxyConfig, ToolDomain } from "./schema.js";

// ============================================================================
//  内部：zod 校验 + 错误格式化
// ============================================================================

/**
 * 用 zod schema 校验数据，失败时把所有 issue 聚合成一条可读错误
 *
 * @param schema - zod schema 实例
 * @param data   - 待校验的原始数据
 * @param label  - 配置块名称，用于错误信息前缀
 * @returns 校验通过的类型化数据
 * @throws 校验失败时抛出包含全部问题的 Error
 */
function parseOrFail<T>(schema: ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const messages = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `[${label}] ${path}: ${issue.message}`;
  });
  throw new Error(
    `配置校验失败，共 ${messages.length} 个问题：\n  - ${messages.join("\n  - ")}`,
  );
}

// ============================================================================
//  内部：代理 URL 解析
// ============================================================================

/**
 * 解析代理 URL 为官方包 proxy 结构
 *
 * 支持格式：http://host:port、http://user:pass@host:port。
 * 空串返回 undefined（不启用代理）。
 *
 * @param raw - BINANCE_PROXY_URL 原始值
 * @returns 官方包 proxy 对象，未配置时返回 undefined
 * @throws 代理 URL 格式非法时抛出
 */
function parseProxyUrl(raw: string | undefined): ProxyConfig | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const hasAuth = url.username.length > 0 || url.password.length > 0;
    const protocol = url.protocol.replace(":", "") as "http" | "https";
    const port = url.port ? Number(url.port) : protocol === "https" ? 443 : 80;
    return {
      host: url.hostname,
      port,
      protocol,
      ...(hasAuth
        ? {
            auth: {
              username: decodeURIComponent(url.username),
              password: decodeURIComponent(url.password),
            },
          }
        : {}),
    };
  } catch {
    throw new Error(`[Config] BINANCE_PROXY_URL 不是有效的 URL: ${raw}`);
  }
}

// ============================================================================
//  内部：工具域解析
// ============================================================================

/**
 * 解析 MCP_TOOL_DOMAINS 为工具域数组
 *
 * 逗号分隔、忽略空白、大小写不敏感（统一转小写）；空串或未配置返回 undefined（由 zod 默认值回退为全部域）。
 * 非法域值交由 zod 校验拦截（fail-fast）。
 *
 * @param raw - MCP_TOOL_DOMAINS 原始值
 * @returns 工具域数组；未配置时返回 undefined
 */
function parseToolDomains(raw: string | undefined): ToolDomain[] | undefined {
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0) as ToolDomain[];
}

// ============================================================================
//  内部：deep freeze
// ============================================================================

/**
 * 深度冻结配置对象及其所有嵌套属性与数组
 *
 * 冻结后严格模式下任何修改尝试抛 TypeError，防止运行时意外篡改全局配置。
 *
 * @param obj - 待冻结的对象
 * @returns 冻结后的只读对象
 */
function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

// ============================================================================
//  单例加载
// ============================================================================

/** 配置缓存（惰性初始化，整个进程共享一份） */
let cache: Readonly<BinanceConfig> | null = null;

/**
 * 加载并校验全部配置（惰性单例）
 *
 * 首次调用时：
 * 1. 读取环境变量原始值
 * 2. 处理需推断的字段（basePath 环境推断、代理 URL 解析）
 * 3. 用 zod schema 校验，失败抛出聚合错误
 * 4. deep freeze 配置对象
 * 5. 打印脱敏启动摘要
 *
 * @returns 不可变的全局配置对象
 * @throws 必填变量缺失、格式非法或跨字段关系不满足时抛出
 */
export function loadConfig(): Readonly<BinanceConfig> {
  if (cache) return cache;

  // ---- Exchange basePath 推断：BINANCE_BASE_URL > USE_DEMO > TESTNET > 主网 ----
  const testnet = envBool("BINANCE_TESTNET", true);
  const demoTrading = envBool("BINANCE_USE_DEMO", false);
  const customBaseUrl = envStr("BINANCE_BASE_URL", "");
  const basePath =
    customBaseUrl ||
    (demoTrading
      ? DERIVATIVES_TRADING_USDS_FUTURES_REST_API_DEMO_URL
      : testnet
        ? DERIVATIVES_TRADING_USDS_FUTURES_REST_API_TESTNET_URL
        : DERIVATIVES_TRADING_USDS_FUTURES_REST_API_PROD_URL);

  // ---- 代理 URL 解析（空串 → undefined）----
  const proxy = parseProxyUrl(envStr("BINANCE_PROXY_URL", ""));

  // ---- 组装原始对象（env 层只做类型转换，校验交给 zod）----
  const config: BinanceConfig = parseOrFail(
    binanceConfigSchema,
    {
      apiKey: envStr("BINANCE_API_KEY", ""),
      apiSecret: envStr("BINANCE_API_SECRET", ""),
      basePath,
      timeout: envInt("BINANCE_TIMEOUT", 10_000),
      retries: envInt("BINANCE_RETRIES", 3),
      backoff: envInt("BINANCE_BACKOFF", 1_000),
      recvWindow: envInt("BINANCE_RECV_WINDOW", 5_000),
      proxy,
      testnet,
      demoTrading,
      serverName: envStr("MCP_SERVER_NAME", "binance-mcp-server"),
      serverVersion: envStr("MCP_SERVER_VERSION", "3.0.0"),
      logLevel: envEnum("LOG_LEVEL", LOG_LEVEL_VALUES, "info"),
      enabledToolDomains: parseToolDomains(envStr("MCP_TOOL_DOMAINS", "")),
    },
    "binance",
  );

  cache = deepFreeze(config);
  printSummary(cache);
  return cache;
}

/**
 * 重置配置缓存（仅供测试使用）
 *
 * 清除缓存的配置对象，使下次 loadConfig 重新读取环境变量。
 */
export function resetConfig(): void {
  cache = null;
}

// ============================================================================
//  启动摘要（敏感字段自动脱敏）
// ============================================================================

/**
 * 打印脱敏后的配置摘要，方便启动时快速排查环境问题
 *
 * 使用 process.stderr 而非 logger：配置加载阶段 logger 尚未初始化，
 * 且日志必须走 stderr（MCP 协议独占 stdout）。
 *
 * @param config - 已校验的全局配置
 */
function printSummary(config: Readonly<BinanceConfig>): void {
  const environment = config.demoTrading
    ? "demo"
    : config.testnet
      ? "testnet"
      : "mainnet";
  const summary = {
    server: `${config.serverName} v${config.serverVersion}`,
    exchange:
      `${environment} | API Key: ${redact(config.apiKey)}` +
      ` | timeout=${config.timeout}ms | retries=${config.retries}`,
    proxy: config.proxy
      ? `${config.proxy.host}:${config.proxy.port} (${config.proxy.protocol})`
      : "未配置",
    domains: config.enabledToolDomains.join(","),
    log: `level=${config.logLevel}`,
  };

  process.stderr.write(
    `\n[Config] 配置加载完成:\n` +
      Object.entries(summary)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n") +
      "\n",
  );
}
