/**
 * Binance MCP Server — 错误处理模块
 *
 * @module utils/error-handling
 * @description
 * 提供 Binance API 错误的统一处理流程：
 * 1. 错误码映射 — 将 Binance 原生错误码转换为中文友好描述
 * 2. 敏感信息脱敏 — 移除日志中的 API Key、Secret、Signature 等敏感字段
 * 3. 结构化的错误日志 — 使用 logger 模块输出格式化日志
 *
 * 所有 MCP 工具的 handler 在 catch 块中调用 logError 记录错误，
 * 确保敏感信息不会泄露到日志输出中。
 */

import { logger } from './logger.js';

/**
 * Binance 业务错误类
 *
 * @description
 * 封装 Binance API 返回的业务错误，携带错误码和原始错误信息。
 * 与标准 Error 的区别在于包含 Binance 特有的错误码字段。
 */
export class BinanceError extends Error {
  constructor(
    message: string,
    /** Binance API 错误码（如 -1003 表示速率限制） */
    public code?: string | number,
    /** 原始异常对象，用于堆栈追踪 */
    public originalError?: Error,
  ) {
    super(message);
    this.name = 'BinanceError';
  }
}

/**
 * 统一处理 Binance API 错误并抛出 BinanceError
 *
 * @description
 * 根据 Binance 错误码映射为中文错误消息。
 * 支持的错误码包括：
 * - -1000: 未知错误
 * - -1001: 内部错误
 * - -1002: 无权限
 * - -1003: 速率限制
 * - -1021: 时间戳超时
 * - -1022: 签名无效
 * - -2010: 订单被拒
 * - -2011: 取消被拒
 *
 * @param error - 原始错误对象
 * @throws {BinanceError} 始终抛出，永不返回
 */
export function handleBinanceError(error: unknown): never {
  const err = error as Record<string, unknown>;
  if (typeof err?.code === 'number') {
    // Binance API 标准错误码映射
    const messages: Record<number, string> = {
      [-1000]: '未知错误',
      [-1001]: '内部错误，无法处理请求',
      [-1002]: '无权执行此请求',
      [-1003]: '请求过多，超过速率限制',
      [-1021]: '请求时间戳超出 recvWindow',
      [-1022]: '签名无效',
      [-2010]: '新订单被拒绝',
      [-2011]: '取消订单被拒绝',
    };
    throw new BinanceError(
      messages[err.code] || (err.msg as string) || 'Binance API 错误',
      err.code,
    );
  }
  if (err instanceof Error) {
    throw new BinanceError(err.message, undefined, err);
  }
  throw new BinanceError('未知 Binance API 错误');
}

/**
 * 对错误消息进行敏感信息脱敏处理
 *
 * @description
 * 将可能包含 API 密钥、签名等敏感信息的错误消息进行脱敏替换。
 * 确保这些信息不会出现在 MCP 返回的错误消息中。
 * 脱敏规则：
 * - `api_key` / `apikey` → `[API_KEY]`
 * - `secret` → `[SECRET]`
 * - `signature` → `[SIGNATURE]`
 *
 * @param message - 原始错误消息
 * @returns 脱敏后的安全消息
 */
export function sanitizeError(message: string): string {
  return message
    .replace(/api[_ ]?key/gi, '[API_KEY]')
    .replace(/secret/gi, '[SECRET]')
    .replace(/signature/gi, '[SIGNATURE]');
}

/**
 * 记录错误到日志（自动脱敏）
 *
 * @description
 * 先将错误消息脱敏，再通过 logger 输出。
 * 在 debug 级别下会额外输出完整堆栈信息。
 *
 * @param error - 待记录的错误对象
 */
export function logError(error: Error): void {
  logger.error(`${error.name}: ${sanitizeError(error.message)}`);
  if (process.env.LOG_LEVEL === 'debug' && error.stack) {
    console.error(error.stack);
  }
}
