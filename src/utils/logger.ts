/**
 * Binance MCP Server v2.0 — 结构化日志模块
 *
 * @module utils/logger
 * @description
 * 基于日志级别的结构化日志输出。日志统一输出到 stderr（stdio 模式下 stdout 被 MCP 协议占用）。
 * 支持 4 个级别（debug < info < warn < error），级别由 LOG_LEVEL 环境变量控制。
 * 默认级别为 info，debug 模式下还会输出错误堆栈。
 */

/** 日志级别类型 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志级别对应的数值权重
 * 数值越大优先级越高（debug 最低，error 最高）
 */
const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * 获取当前日志级别
 * 从 LOG_LEVEL 环境变量读取，非法值回退为 'info'
 */
function getLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL || 'info';
  return LEVELS.hasOwnProperty(raw) ? (raw as LogLevel) : 'info';
}

/**
 * 判断指定级别的日志是否应该输出
 * 只有当日志级别的权重大于等于当前设置级别时才输出
 */
function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[getLevel()];
}

/**
 * 格式化日志消息
 *
 * @param level - 日志级别
 * @param message - 日志消息正文
 * @param data - 可选的附加数据（会被 JSON 序列化）
 * @returns 格式化的日志字符串，格式: `[ISO时间戳] [级别] 消息 {附加数据}`
 */
function format(level: LogLevel, message: string, data?: unknown): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${message}`;
  return data !== undefined ? `${base} ${JSON.stringify(data)}` : base;
}

/**
 * 日志记录器
 *
 * @description
 * 对外暴露的统一日志接口。使用 console.error 输出以确保在 stdio MCP 模式下
 * 日志不会污染 stdout（stdout 专用于 MCP 协议通信）。
 *
 * @example
 * ```typescript
 * logger.info('服务器已启动', { port: 8080 });
 * logger.error('API 调用失败', { code: -1003 });
 * ```
 */
export const logger = {
  debug(message: string, data?: unknown): void {
    if (shouldLog('debug')) console.error(format('debug', message, data));
  },
  info(message: string, data?: unknown): void {
    if (shouldLog('info')) console.error(format('info', message, data));
  },
  warn(message: string, data?: unknown): void {
    if (shouldLog('warn')) console.error(format('warn', message, data));
  },
  error(message: string, data?: unknown): void {
    if (shouldLog('error')) console.error(format('error', message, data));
  },
};
