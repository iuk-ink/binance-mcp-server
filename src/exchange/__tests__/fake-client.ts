/**
 * 测试辅助 — 伪造官方 SDK 客户端
 *
 * 提供可注入响应的 restAPI 桩，供 exchange 层各服务测试使用（不触网）。
 *
 * @module exchange/__tests__/fake-client
 */

import type { DerivativesTradingUsdsFutures } from "@binance/derivatives-trading-usds-futures";

/** 构造一个返回固定数据的 RestApiResponse 桩 */
function resp<T>(data: T): { data(): Promise<T> } {
  return { data: async () => data };
}

/**
 * 创建伪造客户端
 *
 * @param handlers - 各 restAPI 方法名 → 返回数据（或抛错）
 * @returns 伪造的 DerivativesTradingUsdsFutures 实例
 */
export function createFakeClient(
  handlers: Record<string, unknown>,
): DerivativesTradingUsdsFutures {
  const restAPI: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(handlers)) {
    restAPI[name] =
      typeof value === "function"
        ? value
        : () => resp(value);
  }
  return { restAPI } as unknown as DerivativesTradingUsdsFutures;
}

/** 构造一个抛错的 restAPI 方法 */
export function throwError(err: unknown): () => never {
  return () => {
    throw err;
  };
}
