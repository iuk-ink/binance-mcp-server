/**
 * 入参解析辅助函数
 *
 * 供工具层兜底解析数值入参：MCP 正常路径由 SDK 按入参 schema 填充默认值，
 * 此处兜底防御绕过 schema 校验的直接调用（如测试直调 handler）。
 *
 * @module utils/args
 */

/**
 * 取数值入参（缺省时回退默认值）
 *
 * @param value    - 原始入参
 * @param fallback - 默认值
 * @returns 数值
 */
export const numberParam = (value: unknown, fallback: number): number => Number(value ?? fallback);
