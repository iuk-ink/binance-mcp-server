/**
 * MCP 装配层 — 共享 zod schema 片段
 *
 * 供多个工具复用的入参片段与输出 schema；单工具专属的 outputSchema
 * 随各工具文件内联定义（如 trading 的账户 / analysis 的风险指标），
 * 避免本文件成为全量契约堆积点。
 *
 * @module mcp/schema
 */

import { z } from "zod/v4";
import {
  MULTIPLIER_MAX,
  MULTIPLIER_MIN,
  PERIOD_MIN,
  SYMBOL_MAX_LENGTH,
  SYMBOL_MIN_LENGTH,
} from "../constants/index.js";

/** K 线周期（与 exchange 层 KlineInterval 一致） */
export const klineIntervalSchema = z.enum([
  "1m", "3m", "5m", "15m", "30m", "1h",
  "2h", "4h", "6h", "8h", "12h", "1d",
  "3d", "1w", "1M",
]);

/** 数据统计周期（情绪/结构类端点） */
export const statsPeriodSchema = z.enum([
  "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d",
]);

/** 连续合约类型（与官方枚举一致） */
export const contractTypeSchema = z.enum([
  "PERPETUAL", "CURRENT_QUARTER", "NEXT_QUARTER", "TRADIFI_PERPETUAL",
]);

/** 交易对（BTCUSDT 等），入参大小写不敏感，统一归一为大写 */
export const symbolSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(
    z.string().regex(
      new RegExp(`^[A-Z0-9]{${SYMBOL_MIN_LENGTH},${SYMBOL_MAX_LENGTH}}$`),
      "交易对格式应为大写字母+数字，如 BTCUSDT",
    ),
  );

/**
 * 可选 limit 参数（带默认值与范围约束）
 *
 * @param defaultValue - 默认值
 * @param min          - 最小值
 * @param max          - 最大值
 * @returns 带约束与默认值的 limit schema
 */
export const limitSchema = (defaultValue: number, min: number, max: number) =>
  z.number().int().min(min).max(max).default(defaultValue);

/**
 * 指标周期参数（正整数，统一最小值为 PERIOD_MIN）
 *
 * @param defaultValue - 默认周期
 * @param max          - 最大周期（按指标类别取 PERIOD_MAX_*）
 * @returns 带约束与默认值的周期 schema
 */
export const periodSchema = (defaultValue: number, max: number) =>
  z.number().int().min(PERIOD_MIN).max(max).default(defaultValue);

/**
 * 通道 / 标准差倍数参数（正数，统一上下界）
 *
 * @param defaultValue - 默认倍数
 * @param max          - 最大倍数（缺省 MULTIPLIER_MAX）
 * @returns 带约束与默认值的倍数 schema
 */
export const multiplierSchema = (defaultValue: number, max = MULTIPLIER_MAX) =>
  z.number().min(MULTIPLIER_MIN).max(max).default(defaultValue);

// ============================================================================
//  多工具共享的输出 schema（与工厂 `{ data: [...] }` 包装形状一致）
// ============================================================================

/** 数值序列（SMA / EMA / RSI / ATR 等 10 个数值序列指标工具共用）输出 schema */
export const seriesOutputSchema = z.object({ data: z.array(z.number()) });
