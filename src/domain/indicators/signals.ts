/**
 * Binance MCP Server v2.0 — 组合信号工具 (4 个)
 *
 * @module domain/indicators/signals
 * @description
 * 将多个独立指标组合为结构化交易信号，减少 LLM 的工具调用次数。
 *
 * 设计原则：
 * - 每个工具内置指标计算 + 信号判断逻辑，一次调用即可获得结论
 * - 输出统一的 { signal: "bullish"|"bearish"|"neutral" } 格式
 * - 基于 trading-signals 库，与现有指标工具共享底层计算
 */

import { EMA, MACD, RSI, SMA, BollingerBands } from 'trading-signals';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logError } from '../../utils/error-handling.js';
import type { ToolDefinition } from '../../types/common.js';
import { roundValue } from './format.js';
import {
  SignalEmaCrossInput,
  SignalMacdRsiInput,
  SignalBbRsiInput,
  SignalMACrossInput,
} from './schemas.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(roundValue(data), null, 2) }] };
}

/** 推断信号方向 */
function bias(v: number, bullish: boolean): string {
  if (v === 0) return 'neutral';
  return bullish ? (v > 0 ? 'bullish' : 'bearish') : (v < 0 ? 'bullish' : 'bearish');
}

export const signalTools: ToolDefinition[] = [

  // ---- EMA 快慢线交叉 ----
  {
    name: 'signal_ema_cross',
    description: 'EMA 快慢线交叉信号。对比当前值与上一根值判断是否刚发生金叉/死叉，需至少 fast+slow+2 个数据点',
    schema: SignalEmaCrossInput,
    handler: async (a: unknown) => {
      const { values, fast, slow } = a as { values: number[]; fast: number; slow: number };
      try {
        const minLen = Math.max(fast, slow) + 1;
        if (values.length < minLen + 1) {
          return ok({ error: true, message: `数据不足，EMA 交叉最少需要 ${minLen + 1} 个数据点（当前 ${values.length}）` });
        }
        // 计算所有值（含最后一根）和去掉最后一根（前一根）的 EMA
        const currFast = new EMA(fast); const currSlow = new EMA(slow);
        const prevFast = new EMA(fast); const prevSlow = new EMA(slow);
        for (let i = 0; i < values.length; i++) {
          currFast.add(values[i]);
          currSlow.add(values[i]);
          if (i < values.length - 1) {
            prevFast.add(values[i]);
            prevSlow.add(values[i]);
          }
        }
        const cf = currFast.getResultOrThrow(), cs = currSlow.getResultOrThrow();
        const pf = prevFast.getResultOrThrow(), ps = prevSlow.getResultOrThrow();
        const cross = (pf < ps && cf > cs) ? 'golden_cross' : (pf > ps && cf < cs) ? 'death_cross' : 'none';
        return ok({
          signal: bias(cf - cs, true),
          fast: { current: cf, previous: pf },
          slow: { current: cs, previous: ps },
          cross,
        });
      } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
    },
  },

  // ---- MACD + RSI 组合 ----
  {
    name: 'signal_macd_rsi',
    description: 'MACD + RSI 组合信号。综合判断趋势方向和超买超卖，需至少 fast+slow+max(signal,rsiInterval) 个数据点',
    schema: SignalMacdRsiInput,
    handler: async (a: unknown) => {
      const { values, fast, slow, signal, rsiInterval } = a as { values: number[]; fast: number; slow: number; signal: number; rsiInterval: number };
      try {
        const minLen = Math.max(fast + signal, slow + signal, rsiInterval) + 1;
        if (values.length < minLen) {
          return ok({ error: true, message: `数据不足，MACD+RSI 最少需要 ${minLen} 个数据点（当前 ${values.length}）` });
        }
        const macd = new MACD(new EMA(fast), new EMA(slow), new EMA(signal));
        const rsi = new RSI(rsiInterval);
        for (const v of values) { macd.add(v); rsi.add(v); }
        const m = macd.getResultOrThrow() as { histogram: number; macd: number; signal: number };
        const rv = rsi.getResultOrThrow();
        let direction: string;
        if (m.histogram > 0 && rv < 30) direction = 'bullish_oversold';
        else if (m.histogram > 0 && rv > 70) direction = 'bullish_overbought';
        else if (m.histogram < 0 && rv > 70) direction = 'bearish_overbought';
        else if (m.histogram < 0 && rv < 30) direction = 'bearish_oversold';
        else if (m.histogram > 0) direction = 'bullish';
        else direction = 'bearish';
        return ok({ signal: direction, macd: m, rsi: rv });
      } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
    },
  },

  // ---- 布林带 + RSI 突破信号 ----
  {
    name: 'signal_bb_rsi',
    description: '布林带 + RSI 突破信号。识别价格突破上/下轨+RSI 极端时的交易信号，需至少 interval*2 个数据点',
    schema: SignalBbRsiInput,
    handler: async (a: unknown) => {
      const { values, interval, deviationMultiplier, rsiInterval } = a as { values: number[]; interval: number; deviationMultiplier: number; rsiInterval: number };
      try {
        const minLen = Math.max(interval, rsiInterval) + 1;
        if (values.length < minLen) {
          return ok({ error: true, message: `数据不足，BB+RSI 最少需要 ${minLen} 个数据点（当前 ${values.length}）` });
        }
        const bb = new BollingerBands(interval, deviationMultiplier);
        const rsi = new RSI(rsiInterval);
        let bbResult: { lower: number; middle: number; upper: number } | null = null;
        for (const v of values) { bbResult = bb.add(v); rsi.add(v); }
        if (!bbResult) return ok({ error: true, message: '布林带数据不足' });
        const lastPrice = values[values.length - 1];
        const rv = rsi.getResultOrThrow();
        let signal: string;
        if (lastPrice < bbResult.lower && rv < 30) signal = 'oversold_breakdown';
        else if (lastPrice < bbResult.lower) signal = 'breakdown';
        else if (lastPrice > bbResult.upper && rv > 70) signal = 'overbought_breakout';
        else if (lastPrice > bbResult.upper) signal = 'breakout';
        else if (rv < 30) signal = 'oversold';
        else if (rv > 70) signal = 'overbought';
        else signal = 'neutral';
        return ok({ signal, lastPrice, bollinger: bbResult, rsi: rv });
      } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
    },
  },

  // ---- 短期/长期均线交叉 ----
  {
    name: 'signal_ma_cross',
    description: '短期/长期均线交叉信号（金叉/死叉）。同时计算 current 和 previous 两根 K 线判断交叉方向',
    schema: SignalMACrossInput,
    handler: async (a: unknown) => {
      const { values, short, long } = a as { values: number[]; short: number; long: number };
      try {
        const minLen = long + 2;
        if (values.length < minLen) {
          return ok({ error: true, message: `数据不足，均线交叉最少需要 ${minLen} 个数据点（当前 ${values.length}）` });
        }
        const currShort = new SMA(short); const currLong = new SMA(long);
        const prevShort = new SMA(short); const prevLong = new SMA(long);
        for (let i = 0; i < values.length; i++) {
          currShort.add(values[i]);
          currLong.add(values[i]);
          if (i < values.length - 1) {
            prevShort.add(values[i]);
            prevLong.add(values[i]);
          }
        }
        const cs = currShort.getResult() as number; const cl = currLong.getResult() as number;
        const ps = prevShort.getResult() as number; const pl = prevLong.getResult() as number;
        const cross = (ps < pl && cs > cl) ? 'golden_cross' : (ps > pl && cs < cl) ? 'death_cross' : 'none';
        return ok({
          signal: bias(cs - cl, true),
          shortAvg: { current: cs, previous: ps },
          longAvg: { current: cl, previous: pl },
          cross,
        });
      } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
    },
  },
];
