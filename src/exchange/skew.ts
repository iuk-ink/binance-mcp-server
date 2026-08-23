/**
 * 币安操作模块 — 时钟偏差探测
 *
 * 签名请求的 timestamp 恒由官方包按本机 `Date.now()` 生成（无法注入偏移），
 * 当本机与币安服务器时间偏差超过 recvWindow 时会报 -1021。本模块提供
 * 纯函数判定与一次性的服务器时间采样，供启动阶段主动探测并告警。
 *
 * @module exchange/skew
 */

import { CLOCK_SKEW_WARN_THRESHOLD_MS } from "../constants/index.js";

/** 一次时钟采样：服务器时间 / 本机时间 / 两者之差（服务器 − 本机） */
export interface ClockSkewSample {
  serverTime: number;
  localTime: number;
  offsetMs: number;
}

/** 提供 checkServerTime 的最小客户端接口（便于测试注入） */
interface ServerTimeClient {
  restAPI: {
    checkServerTime(): Promise<{ data(): Promise<{ serverTime?: unknown }> }>;
  };
}

/**
 * 计算时钟偏差（服务器时间 − 本机时间）
 *
 * @param serverTime - 币安服务器时间（毫秒）
 * @param localTime  - 本机当前时间（毫秒）
 * @returns 偏差毫秒数；正数表示本机时间落后于服务器
 */
export function computeClockSkewMs(serverTime: number, localTime: number): number {
  return serverTime - localTime;
}

/**
 * 判断时钟偏差是否显著到需要告警
 *
 * @param offsetMs    - 时钟偏差毫秒数
 * @param thresholdMs - 告警阈值，缺省用集中常量
 * @returns true 表示超出阈值
 */
export function isClockSkewSignificant(
  offsetMs: number,
  thresholdMs = CLOCK_SKEW_WARN_THRESHOLD_MS,
): boolean {
  return Math.abs(offsetMs) > thresholdMs;
}

/**
 * 采样一次币安服务器时间并换算本机偏差
 *
 * 采样失败（网络异常 / 字段缺失）返回 null，不视为偏差，由调用方决定告警策略。
 *
 * @param client - 提供 checkServerTime 的客户端
 * @param now    - 采样时刻的本机时间（缺省 Date.now()，便于测试固定）
 * @returns 时钟采样；失败返回 null
 */
export async function sampleServerClock(
  client: ServerTimeClient,
  now = Date.now(),
): Promise<ClockSkewSample | null> {
  const data = await client.restAPI.checkServerTime().then((resp) => resp.data());
  const serverTime = Number(data?.serverTime ?? 0);
  if (!serverTime) return null;
  return { serverTime, localTime: now, offsetMs: computeClockSkewMs(serverTime, now) };
}
