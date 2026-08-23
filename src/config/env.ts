/**
 * 环境变量读取器 — 类型安全的配置原始值加载层
 *
 * 设计原则：
 * - 统一 dotenv 加载入口（模块首次导入时执行一次，后续 import 复用已注入的 process.env）
 * - 每个读取函数只负责「字符串 → JS 值」的类型转换，并提供默认值
 * - 必填变量缺失或格式非法时 fail-fast 抛错，杜绝静默回退
 * - 跨字段关系校验交给 zod schema，本层只做单值解析
 * - 布尔值统一支持 true/false/1/0/yes/no/on/off，大小写不敏感
 *
 * @module config/env
 */

import dotenv from "dotenv";

// 模块首次导入时加载 .env（quiet: true 抑制 stdout 日志，避免污染 MCP 协议流）
dotenv.config({ quiet: true });

// ============================================================================
//  基础读取器
// ============================================================================

/**
 * 读取字符串环境变量
 *
 * @param key      - 环境变量名
 * @param fallback - 可选默认值；未提供且变量缺失时抛错
 * @returns 环境变量值（空串视为未设置，回退默认值）或 fallback
 * @throws 变量为空且未提供 fallback 时抛出
 */
export function envStr(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== "") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`[Config] 缺少必填环境变量: ${key}`);
}

/**
 * 读取整数环境变量
 *
 * @param key      - 环境变量名
 * @param fallback - 可选默认值
 * @returns 解析后的整数
 * @throws 值存在但无法解析为整数、或缺失且无 fallback 时抛出
 */
export function envInt(key: string, fallback?: number): number {
  const raw = process.env[key];
  const trimmed = raw?.trim();
  if (trimmed !== undefined && trimmed !== "") {
    const n = Number(trimmed);
    if (Number.isInteger(n)) return n;
    throw new Error(`[Config] 环境变量 ${key} 不是有效的整数: ${raw}`);
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`[Config] 缺少必填环境变量: ${key}`);
}

/**
 * 读取布尔值环境变量
 *
 * 支持的字面量（大小写不敏感）：
 * - 真：true / 1 / yes / on
 * - 假：false / 0 / no / off
 *
 * @param key      - 环境变量名
 * @param fallback - 可选默认值
 * @throws 值存在但不匹配上述字面量、或缺失且无 fallback 时抛出
 */
export function envBool(key: string, fallback?: boolean): boolean {
  const raw = process.env[key];
  if (raw !== undefined && raw !== "") {
    const lower = raw.trim().toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes" || lower === "on") return true;
    if (lower === "false" || lower === "0" || lower === "no" || lower === "off") return false;
    throw new Error(
      `[Config] 环境变量 ${key} 不是有效的布尔值 (true/false/1/0/yes/no/on/off): ${raw}`,
    );
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`[Config] 缺少必填环境变量: ${key}`);
}

/**
 * 读取枚举环境变量（值必须在白名单内）
 *
 * @param key      - 环境变量名
 * @param allowed  - 允许的枚举值（使用 as const 可保留字面量类型）
 * @param fallback - 可选默认值
 * @returns 命中白名单的值
 * @throws 值不在白名单、或缺失且无 fallback 时抛出
 */
export function envEnum<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback?: T,
): T {
  const raw = process.env[key];
  const value = raw !== undefined && raw !== "" ? raw : fallback;
  if (value === undefined) {
    throw new Error(`[Config] 缺少必填环境变量: ${key}`);
  }
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(
    `[Config] 环境变量 ${key} 的值 "${value}" 无效，允许值: ${allowed.join(", ")}`,
  );
}

/**
 * 敏感信息脱敏（用于启动摘要打印，避免泄露密钥）
 *
 * 规则：长度 ≤ 8 全替换为 `****`；否则保留前 4 + 后 4，中间替换。
 */
export function redact(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
