/**
 * Binance MCP Server — 风险/绩效工具 (5 个)
 *
 * @module domain/indicators/risk
 * @description
 * 量化交易常用风险指标和绩效度量，纯数学计算，无外部 API 依赖。
 *
 * 覆盖指标：
 * - Sharpe Ratio（夏普比率）—— 衡量风险调整后收益
 * - Max Drawdown（最大回撤）—— 衡量最糟糕的亏损幅度
 * - Calmar Ratio（卡尔玛比率）—— 年化收益 / 最大回撤
 * - Win Rate（胜率）—— 统计交易盈亏比例
 * - VaR（风险价值）—— 在给定置信度下的最大可能亏损
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logError } from '../../utils/error-handling.js';
import type { ToolDefinition } from '../../types/common.js';
import { roundValue } from './format.js';
import {
  SharpeInput,
  MaxDrawdownInput,
  CalmarInput,
  WinRateInput,
  VaRInput,
} from './schemas.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(roundValue(data), null, 2) }] };
}

/** 返回数组均值 */
function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** 返回数组标准差（总体） */
function stddev(arr: number[], avg?: number): number {
  const m = avg ?? mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

export const riskTools: ToolDefinition[] = [

  // ---- 夏普比率 ----
  {
    name: 'util_sharpe',
    description: '计算夏普比率 (Sharpe Ratio) = (年化收益 - 无风险利率) / 年化波动率',
    schema: SharpeInput,
    handler: async (a: unknown) => {
      const { returns, riskFreeRate } = a as { returns: number[]; riskFreeRate: number };
      try {
        const avgRet = mean(returns);
        const stdRet = stddev(returns, avgRet);
        // 年化：设 returns 为日收益率，年化乘 252
        const annualizedReturn = avgRet * 252;
        const annualizedStd = stdRet * Math.sqrt(252);
        const sharpe = stdRet !== 0 ? (annualizedReturn - riskFreeRate) / annualizedStd : 0;
        return ok({ sharpe, annualizedReturn, annualizedVolatility: annualizedStd, riskFreeRate });
      } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
    },
  },

  // ---- 最大回撤 ----
  {
    name: 'util_max_drawdown',
    description: '计算最大回撤 (Max Drawdown) = 净值曲线中最高点到最低点的最大跌幅百分比',
    schema: MaxDrawdownInput,
    handler: async (a: unknown) => {
      const { equity } = a as { equity: number[] };
      try {
        let peak = equity[0];
        let maxDD = 0;
        let ddStart = equity[0];
        let ddEnd = equity[0];
        for (const v of equity) {
          if (v > peak) peak = v;
          const dd = (peak - v) / peak;
          if (dd > maxDD) {
            maxDD = dd;
            ddStart = peak;
            ddEnd = v;
          }
        }
        return ok({ maxDrawdown: maxDD, peak: ddStart, trough: ddEnd });
      } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
    },
  },

  // ---- 卡尔玛比率 ----
  {
    name: 'util_calmar',
    description: '计算卡尔玛比率 (Calmar Ratio) = 年化收益率 / 最大回撤',
    schema: CalmarInput,
    handler: async (a: unknown) => {
      const { returns, equity, riskFreeRate } = a as { returns: number[]; equity: number[]; riskFreeRate: number };
      try {
        const avgRet = mean(returns);
        const annualizedReturn = avgRet * 252 - riskFreeRate;
        // 计算最大回撤
        let peak = equity[0];
        let maxDD = 0;
        for (const v of equity) {
          if (v > peak) peak = v;
          const dd = (peak - v) / peak;
          if (dd > maxDD) maxDD = dd;
        }
        const calmar = maxDD > 0 ? annualizedReturn / maxDD : 0;
        return ok({ calmar, annualizedReturn, maxDrawdown: maxDD });
      } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
    },
  },

  // ---- 胜率 / 盈亏比 ----
  {
    name: 'util_win_rate',
    description: '计算交易胜率和盈亏比，输入交易记录 [{result:"WIN"|"LOSS", pnl:盈亏金额}]',
    schema: WinRateInput,
    handler: async (a: unknown) => {
      const { trades } = a as { trades: Array<{ result: 'WIN' | 'LOSS'; pnl: number }> };
      try {
        const wins = trades.filter((t) => t.result === 'WIN');
        const losses = trades.filter((t) => t.result === 'LOSS');
        const winRate = trades.length > 0 ? wins.length / trades.length : 0;
        const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
        const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
        const avgWin = wins.length > 0 ? totalWin / wins.length : 0;
        const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
        const profitFactor = totalLoss > 0 ? totalWin / totalLoss : (totalWin > 0 ? Infinity : 0);
        return ok({ winRate, totalTrades: trades.length, wins: wins.length, losses: losses.length, avgWin, avgLoss, profitFactor });
      } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
    },
  },

  // ---- 风险价值 VaR ----
  {
    name: 'util_var',
    description: '计算风险价值 (VaR)。在给定置信度下，预计的最大亏损百分比',
    schema: VaRInput,
    handler: async (a: unknown) => {
      const { returns, confidence } = a as { returns: number[]; confidence: number };
      try {
        // 历史模拟法：对收益率排序，取第 (1-confidence) 百分位
        const sorted = [...returns].sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * (1 - confidence));
        const varValue = sorted[idx];
        // CVaR (Expected Shortfall): 低于 VaR 的所有收益率的均值
        const tail = sorted.slice(0, idx + 1);
        const cvar = tail.length > 0 ? -mean(tail) : 0;
        return ok({ var: -varValue, cvar, confidence, dataPoints: returns.length });
      } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
    },
  },

];
