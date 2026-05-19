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

import type { ToolDefinition } from '../../types/common.js';
import { roundValue } from './format.js';
import { wrapHandler } from '../../utils/response.js';
import {
  SharpeInput,
  MaxDrawdownInput,
  CalmarInput,
  WinRateInput,
  VaRInput,
} from './schemas.js';

/**
 * 计算数组算术平均值
 *
 * @param arr - 数值数组
 * @returns 平均值
 */
function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * 计算数组总体标准差
 *
 * @param arr - 数值数组
 * @param avg - 预计算的均值（可选，传入可减少一次遍历）
 * @returns 总体标准差
 */
function stddev(arr: number[], avg?: number): number {
  const m = avg ?? mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

export const riskTools: ToolDefinition[] = [

  {
    name: 'util_sharpe',
    description: '计算夏普比率 (Sharpe Ratio) = (年化收益 - 无风险利率) / 年化波动率',
    schema: SharpeInput,
    handler: wrapHandler((args: { returns: number[]; riskFreeRate: number }) => {
      const avgRet = mean(args.returns);
      const stdRet = stddev(args.returns, avgRet);
      const annualizedReturn = avgRet * 252;
      const annualizedStd = stdRet * Math.sqrt(252);
      const sharpe = stdRet !== 0 ? (annualizedReturn - args.riskFreeRate) / annualizedStd : 0;
      return roundValue({ sharpe, annualizedReturn, annualizedVolatility: annualizedStd, riskFreeRate: args.riskFreeRate });
    }, 'util_sharpe'),
  },

  {
    name: 'util_max_drawdown',
    description: '计算最大回撤 (Max Drawdown) = 净值曲线中最高点到最低点的最大跌幅百分比',
    schema: MaxDrawdownInput,
    handler: wrapHandler((args: { equity: number[] }) => {
      let peak = args.equity[0];
      let maxDD = 0;
      let ddStart = args.equity[0];
      let ddEnd = args.equity[0];
      for (const v of args.equity) {
        if (v > peak) peak = v;
        const dd = (peak - v) / peak;
        if (dd > maxDD) {
          maxDD = dd;
          ddStart = peak;
          ddEnd = v;
        }
      }
      return roundValue({ maxDrawdown: maxDD, peak: ddStart, trough: ddEnd });
    }, 'util_max_drawdown'),
  },

  {
    name: 'util_calmar',
    description: '计算卡尔玛比率 (Calmar Ratio) = 年化收益率 / 最大回撤',
    schema: CalmarInput,
    handler: wrapHandler((args: { returns: number[]; equity: number[]; riskFreeRate: number }) => {
      const avgRet = mean(args.returns);
      const annualizedReturn = avgRet * 252 - args.riskFreeRate;
      let peak = args.equity[0];
      let maxDD = 0;
      for (const v of args.equity) {
        if (v > peak) peak = v;
        const dd = (peak - v) / peak;
        if (dd > maxDD) maxDD = dd;
      }
      const calmar = maxDD > 0 ? annualizedReturn / maxDD : 0;
      return roundValue({ calmar, annualizedReturn, maxDrawdown: maxDD });
    }, 'util_calmar'),
  },

  {
    name: 'util_win_rate',
    description: '计算交易胜率和盈亏比，输入交易记录 [{result:"WIN"|"LOSS", pnl:盈亏金额}]',
    schema: WinRateInput,
    handler: wrapHandler((args: { trades: Array<{ result: 'WIN' | 'LOSS'; pnl: number }> }) => {
      const wins = args.trades.filter((t) => t.result === 'WIN');
      const losses = args.trades.filter((t) => t.result === 'LOSS');
      const winRate = args.trades.length > 0 ? wins.length / args.trades.length : 0;
      const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
      const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
      const avgWin = wins.length > 0 ? totalWin / wins.length : 0;
      const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
      const profitFactor = totalLoss > 0 ? totalWin / totalLoss : (totalWin > 0 ? Infinity : 0);
      return roundValue({ winRate, totalTrades: args.trades.length, wins: wins.length, losses: losses.length, avgWin, avgLoss, profitFactor });
    }, 'util_win_rate'),
  },

  {
    name: 'util_var',
    description: '计算风险价值 (VaR)。在给定置信度下，预计的最大亏损百分比',
    schema: VaRInput,
    handler: wrapHandler((args: { returns: number[]; confidence: number }) => {
      const sorted = [...args.returns].sort((a, b) => a - b);
      const idx = Math.floor(sorted.length * (1 - args.confidence));
      const varValue = sorted[idx];
      const tail = sorted.slice(0, idx + 1);
      const cvar = tail.length > 0 ? -mean(tail) : 0;
      return roundValue({ var: -varValue, cvar, confidence: args.confidence, dataPoints: args.returns.length });
    }, 'util_var'),
  },

];
