/**
 * 日志模块 — stderr 结构化日志
 *
 * 设计目标：
 * - MCP 协议独占 stdout，所有日志必须输出到 stderr，避免污染协议消息流
 * - 自定义 Logger 接口，调用方不直接依赖底层实现
 * - 工厂函数 createLogger + Logger.child 支持模块化命名与上下文继承
 * - 消息 + 可选 meta 的结构化输出（bigint 安全序列化）
 * - error() 重载：传入 Error 自动记录 message + stack
 *
 * @module utils/logger
 */

import type { Writable } from "node:stream";

// ============================================================================
//  类型定义
// ============================================================================

/** 日志级别（低 → 高） */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 日志级别枚举值（config 层复用，保证单一定义源） */
export const LOG_LEVEL_VALUES: readonly LogLevel[] = ["debug", "info", "warn", "error"];

/** 日志业务元数据（任意键值对） */
export type LogMeta = Record<string, unknown>;

/** child logger 绑定信息：可选组件名 + 任意继承元数据 */
export interface ChildBindings {
  /** 子组件名（如 market / account），缺省时继承上游 */
  component?: string;
  /** 其余字段作为元数据随所有日志输出 */
  [key: string]: unknown;
}

/** 统一日志接口 */
export interface Logger {
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
  /** 传入 Error 自动记录 message + stack，传入对象作为元数据 */
  error(message: string, errorOrMeta?: Error | LogMeta): void;
  /** 创建子 logger，继承 name 前缀并合并上下文 meta */
  child(bindings: ChildBindings): Logger;
}

// ============================================================================
//  级别与序列化辅助
// ============================================================================

/** 级别优先级映射（数值越大越重要） */
const LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 默认日志级别（未显式指定且 LOG_LEVEL 无效时兜底） */
const DEFAULT_LEVEL: LogLevel = "info";

/** JSON replacer：bigint → number，避免 JSON.stringify 抛错 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  return value;
}

/** 将 meta 序列化为一行 JSON（bigint 安全），空 meta 返回空串 */
function stringifyMeta(meta: LogMeta): string {
  if (Object.keys(meta).length === 0) return "";
  try {
    const text = JSON.stringify(meta, jsonReplacer);
    return text === undefined ? "" : ` ${text}`;
  } catch {
    return " [meta 序列化失败]";
  }
}

/** 将 Error 展开为可序列化的结构化字段 */
function toErrorMeta(error: Error): LogMeta {
  return {
    error: error.message,
    ...(error.stack !== undefined ? { stack: error.stack } : {}),
  };
}

// ============================================================================
//  实现
// ============================================================================

/** 基于流输出的 Logger 实现（默认 stderr，可注入流便于测试） */
class StreamLogger implements Logger {
  /** 模块名前缀（child 后形如 exchange.market） */
  private readonly name: string;
  /** 继承自父 logger 的上下文元数据 */
  private readonly baseMeta: LogMeta;
  private readonly level: LogLevel;
  private readonly stream: Writable;

  constructor(options: {
    name: string;
    level: LogLevel;
    stream: Writable;
    baseMeta?: LogMeta;
  }) {
    this.name = options.name;
    this.level = options.level;
    this.stream = options.stream;
    this.baseMeta = options.baseMeta ?? {};
  }

  /** 判断该级别是否被当前级别过滤 */
  private enabled(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  /** 合并上下文并输出一行日志 */
  private emit(level: LogLevel, message: string, meta: LogMeta): void {
    if (!this.enabled(level)) return;
    const merged = { ...this.baseMeta, ...meta };
    const line =
      `[${new Date().toISOString()}] [${level.toUpperCase()}] [${this.name}] ` +
      `${message}${stringifyMeta(merged)}\n`;
    this.stream.write(line);
  }

  info(message: string, meta?: LogMeta): void {
    this.emit("info", message, meta ?? {});
  }

  warn(message: string, meta?: LogMeta): void {
    this.emit("warn", message, meta ?? {});
  }

  debug(message: string, meta?: LogMeta): void {
    this.emit("debug", message, meta ?? {});
  }

  error(message: string, errorOrMeta?: Error | LogMeta): void {
    if (errorOrMeta instanceof Error) {
      this.emit("error", message, toErrorMeta(errorOrMeta));
    } else {
      this.emit("error", message, errorOrMeta ?? {});
    }
  }

  child(bindings: ChildBindings): Logger {
    const { component, ...restMeta } = bindings;
    const childName = component ? `${this.name}.${component}` : this.name;
    return new StreamLogger({
      name: childName,
      level: this.level,
      stream: this.stream,
      baseMeta: { ...this.baseMeta, ...restMeta },
    });
  }
}

// ============================================================================
//  工厂
// ============================================================================

/** 日志级别解析缓存（进程内首次读取 LOG_LEVEL 后复用） */
let cachedDefaultLevel: LogLevel | null = null;

/** 从 LOG_LEVEL 环境变量惰性读取默认级别，非法值回退 info */
function defaultLevelFromEnv(): LogLevel {
  if (cachedDefaultLevel !== null) return cachedDefaultLevel;
  const raw = process.env["LOG_LEVEL"]?.trim().toLowerCase();
  cachedDefaultLevel = LOG_LEVEL_VALUES.includes(raw as LogLevel)
    ? (raw as LogLevel)
    : DEFAULT_LEVEL;
  return cachedDefaultLevel;
}

/** 创建日志器参数 */
export interface CreateLoggerOptions {
  /** 模块名，作为日志前缀 */
  name: string;
  /** 显式级别；缺省从 LOG_LEVEL 环境变量惰性读取 */
  level?: LogLevel;
  /** 输出流；默认 stderr（MCP 独占 stdout，日志不得污染协议流） */
  stream?: Writable;
}

/**
 * 创建日志记录器
 *
 * @example
 * ```ts
 * const logger = createLogger({ name: "exchange" });
 * logger.info("客户端创建完成", { env: "testnet" });
 * logger.error("订单失败", new Error("timeout"));
 *
 * const market = logger.child({ component: "market", roundId: 3 });
 * market.debug("获取价格", { symbol: "BTCUSDT" });
 * ```
 *
 * @param options - 模块名 / 级别 / 输出流
 * @returns 符合 Logger 接口的记录器
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  return new StreamLogger({
    name: options.name,
    level: options.level ?? defaultLevelFromEnv(),
    stream: options.stream ?? process.stderr,
  });
}
