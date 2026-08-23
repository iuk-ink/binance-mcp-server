/**
 * 币安操作模块 — 请求参数公共工具
 *
 * @module exchange/request
 */

import { fromConnectorError } from "./errors.js";

/** 官方包 RestApiResponse 的最小结构（本层仅需 data() 解包） */
export interface RestResponse<T = unknown> {
  data(): Promise<T>;
}

/**
 * 执行 REST 调用并统一解包 `.data()`，异常归一为 {@link ExchangeError}
 *
 * 供 account / trade 签名服务复用，消除各方法重复的 `await resp.data()` 与
 * `fromConnectorError` 脚手架（与 MarketService.call 口径一致）。
 *
 * @param fn - 返回 RestApiResponse 的调用
 * @returns 解包后的业务数据
 * @throws {ExchangeError} 网络 / 服务端异常
 */
export async function safeCall<T>(fn: () => Promise<RestResponse<T>>): Promise<T> {
  try {
    const resp = await fn();
    return await resp.data();
  } catch (err) {
    throw fromConnectorError(err);
  }
}

/**
 * 注入 recvWindow 到请求参数（未配置时原样返回）
 *
 * account / trade 两个签名服务均需在每次请求中注入 recvWindow（防重放窗口），
 * 统一由本函数实现，避免两处重复。
 *
 * @param params     - 请求参数
 * @param recvWindow - 请求窗口 ms（未配置为 undefined，此时原样返回）
 * @returns 带 recvWindow 的参数对象（若配置了窗口）
 */
export function withRecvWindow<T extends object>(
  params: T,
  recvWindow?: number,
): T & { recvWindow?: number } {
  return recvWindow ? { ...params, recvWindow } : params;
}
