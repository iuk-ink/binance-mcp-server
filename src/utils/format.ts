/**
 * 数值格式化与敏感信息脱敏工具
 *
 * @module utils/format
 */

import { ROUND_DEFAULT_DECIMALS } from "../constants/index.js";

// ============================================================================
//  数值规整
// ============================================================================

/**
 * 对数值做保留指定位数的四舍五入（避免浮点溢出）
 *
 * @param value    - 原始数值或字符串数值
 * @param decimals - 保留小数位数，默认 8
 * @returns 规整后的数值；NaN / Infinity 输入返回 0
 */
export function roundValue(value: number | string, decimals = ROUND_DEFAULT_DECIMALS): number {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}

// ============================================================================
//  敏感信息脱敏
// ============================================================================

/** 敏感字段名（query / JSON 中的键名，大小写不敏感、允许 - 与 _ 分隔） */
const SENSITIVE_KEY_PATTERN =
  /(\b(?:api[-_]?key|api[-_]?secret|signature|sign|token|password)\b\s*=\s*)([^\s&,}]+)/gi;

/** 64 位以上十六进制串（HMAC 签名特征） */
const HEX_SIGNATURE_PATTERN = /\b[a-f0-9]{64,}\b/gi;

/**
 * 脱敏敏感信息
 *
 * 规则：
 * - key=value 形式的敏感字段 → 替换 value 为 [REDACTED]
 * - 独立的 64 位以上十六进制串（签名特征）→ [REDACTED_SIGNATURE]
 *
 * @param input - 原始文本（错误消息 / 请求串等）
 * @returns 脱敏后的文本
 */
export function sanitize(input: string): string {
  if (!input) return input;
  return input
    .replace(SENSITIVE_KEY_PATTERN, "$1[REDACTED]")
    .replace(HEX_SIGNATURE_PATTERN, "[REDACTED_SIGNATURE]");
}
