/**
 * Binance MCP Server — API 限流重试模块
 *
 * @module utils/rate-limiter
 * @description
 * Binance 期货 API 对请求频率有严格限制（按 IP 和 API Key 分别计数），
 * 频繁调用全量查询接口（klines/exchange_info/prices 等）极易触发限流封禁。
 *
 * 本模块提供指数退避重试机制：
 * - 基础延迟 1 秒，每次重试翻倍（1s → 2s → 4s）
 * - 最多重试 3 次
 * - 仅在遇到 HTTP 429 / 418 / 5xx 等可恢复错误时重试
 */

import { logger } from './logger.js';

/**
 * 指数退避睡眠
 *
 * @param ms - 等待毫秒数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 判断是否为可重试的 HTTP 错误
 *
 * 429 = 请求频率超限
 * 418 = IP 被临时封禁
 * 5xx = Binance 服务端临时故障
 */
function isRetryable(error: unknown): boolean {
  const msg = (error as Error)?.message || '';
  return /429|418|5\d\d|rate.limit|timeout|IP.ban/i.test(msg);
}

/**
 * 带指数退避重试的异步调用
 *
 * @description
 * 对传入的函数做指数退避重试包装，仅针对可恢复的限流/网络错误。
 * Binance 错误和参数校验错误不会重试，直接抛出。
 *
 * @param fn - 要执行的异步函数
 * @param maxRetries - 最大重试次数，默认 3
 * @param baseDelay - 基础延迟（毫秒），默认 1000
 * @returns 函数执行结果
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // 非可重试错误直接抛出
      if (!isRetryable(error)) {
        throw error;
      }
      // 已达最大重试次数
      if (attempt === maxRetries) {
        logger.warn(`API 调用失败，已达最大重试次数 ${maxRetries}`);
        throw error;
      }
      // 指数退避
      const delay = baseDelay * Math.pow(2, attempt);
      logger.info(`API 限流，第 ${attempt + 1}/${maxRetries} 次重试，等待 ${delay}ms`);
      await sleep(delay);
    }
  }
  throw new Error('unreachable');
}
