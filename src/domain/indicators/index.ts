/**
 * Binance MCP Server v2.0 — 技术指标领域模块导出
 *
 * @module domain/indicators
 * @description
 * 聚合导出所有技术指标和工具函数的 MCP 工具定义。
 * createIndicatorTools() 将六大类指标合并为一个统一的 ToolDefinition 数组。
 *
 * 指标分类说明：
 * - trendTools: 趋势类（移动平均线、ADX 等）—— 衡量方向 (12)
 * - momentumTools: 动量类（RSI、MACD 等）—— 衡量速度 (11)
 * - volatilityTools: 波动率类（布林带、ATR 等）—— 衡量振幅 (5)
 * - utilityTools: 工具函数（统计、网格等）—— 通用计算 (9)
 * - signalTools: 组合信号（EMA交叉、MACD+RSI等）—— 综合判断 (4)
 * - riskTools: 风险/绩效（夏普比率、最大回撤等）—— 量化分析 (5)
 */

import { trendTools } from './trend.js';
import { momentumTools } from './momentum.js';
import { volatilityTools } from './volatility.js';
import { utilityTools } from './utility.js';
import { signalTools } from './signals.js';
import { riskTools } from './risk.js';
import type { ToolDefinition } from '../../types/common.js';

/**
 * 创建完整的指标工具集合
 *
 * @description
 * 将趋势、动量、波动率、工具函数、组合信号、风险绩效六大类合并为一个数组。
 * 该函数在 server.ts 的启动流程中调用，由 registerAll 统一注册到 McpServer。
 *
 * @returns 包含所有指标工具的 ToolDefinition 数组
 */
export function createIndicatorTools(): ToolDefinition[] {
  return [...trendTools, ...momentumTools, ...volatilityTools, ...utilityTools, ...signalTools, ...riskTools];
}

// 按类别单独导出，便于按需引用
export { trendTools, momentumTools, volatilityTools, utilityTools, signalTools, riskTools };
