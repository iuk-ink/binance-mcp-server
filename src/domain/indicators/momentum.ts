/**
 * Binance MCP Server — 动量类技术指标工具 (11 个)
 *
 * @module domain/indicators/momentum
 * @description
 * 基于 trading-signals 库的动量/速度类指标封装。
 * 多数指标通过 sig() 辅助函数提取 getSignal() 的交叉/超买超卖状态。
 *
 * 各指标取值方式与趋势类基本一致：
 * - AO/PSAR 等通过 add() 返回值累积取 last
 * - RSI/MACD/CCI 等通过 getResultOrThrow() 确保非空
 * - TDS 需要 50+ 数据点，handler 内做了预检查
 */
import { AO, MOM, CCI, MACD, OBV, ROC, RSI, StochasticOscillator, StochasticRSI, TDS, WilliamsR, EMA, DEMA, SMA } from 'trading-signals';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logError } from '../../utils/error-handling.js';
import type { ToolDefinition } from '../../types/common.js';
import { roundValue } from './format.js';
import { AOInput, MOMInput, CCIInput, MACDInput, OBVInput, ROCInput, RSIInput, StochInput, StochRSIInput, TDSInput, WilliamsRInput } from './schemas.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(roundValue(data), null, 2) }] };
}

/**
 * 从指标实例提取 trading-signals 库的交易信号
 *
 * @description
 * 部分指标（RSI、MACD、CCI 等）提供 getSignal() 方法，
 * 返回交叉/超买超卖等状态判断。
 * 通过可选链安全调用，不支持信号的指标返回空对象（展开后无影响）。
 */
function sig(ind: unknown) { const s = (ind as { getSignal?: () => { state: string; hasChanged: boolean } }).getSignal?.(); return s ? { signal: s } : {}; }

export const momentumTools: ToolDefinition[] = [
  {
    name: 'indicator_ao', description: 'Awesome Oscillator (AO)', schema: AOInput,
    handler: async (a: unknown) => { const { candles, shortInterval, longInterval, smoothingType } = a as { candles: { high: number; low: number }[]; shortInterval: number; longInterval: number; smoothingType?: string }; try { const i = new AO(shortInterval, longInterval, (smoothingType === 'SMA' ? SMA : undefined) as any); const k = i as unknown as { add(v: { high: number; low: number }): number | null }; let last: number | null = null; for (const c of candles) last = k.add(c); return ok({ indicator: 'AO', short: shortInterval, long: longInterval, last, ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  { name: 'indicator_mom', description: '动量指标 (MOM/MTM)', schema: MOMInput, handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new MOM(interval); for (const v of values) i.add(v); return ok({ indicator: 'MOM', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  {
    name: 'indicator_cci', description: '商品通道指数 (CCI)', schema: CCIInput,
    handler: async (a: unknown) => { const { candles, interval } = a as { candles: { high: number; low: number; close: number }[]; interval: number }; try { const i = new CCI(interval); for (const c of candles) i.add(c); return ok({ indicator: 'CCI', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_macd', description: '指数平滑异同移动平均线 (MACD)', schema: MACDInput,
    handler: async (a: unknown) => { const { values, fast, slow, signal: sigNum, indicatorType } = a as { values: number[]; fast: number; slow: number; signal: number; indicatorType?: string }; try { const ct = { EMA, DEMA }; const C = ct[indicatorType === 'DEMA' ? 'DEMA' : 'EMA'] || EMA; const i = new MACD(new C(fast), new C(slow), new C(sigNum)); for (const v of values) i.add(v); return ok({ indicator: 'MACD', fast, slow, signal: sigNum, result: i.getResultOrThrow() as { histogram: number; macd: number; signal: number }, ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_obv', description: '能量潮指标 (OBV)', schema: OBVInput,
    handler: async (a: unknown) => { const { candles, interval } = a as { candles: { open: number; high: number; low: number; close: number; volume: number }[]; interval: number }; try { const i = new OBV(interval); for (const c of candles) i.add(c); return ok({ indicator: 'OBV', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  { name: 'indicator_roc', description: '变化率指标 (ROC)', schema: ROCInput, handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new ROC(interval); for (const v of values) i.add(v); return ok({ indicator: 'ROC', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  {
    name: 'indicator_rsi', description: '相对强弱指数 (RSI)', schema: RSIInput,
    handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new RSI(interval); for (const v of values) i.add(v); return ok({ indicator: 'RSI', interval, value: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_stoch', description: '随机振荡器 (Stochastic Oscillator)', schema: StochInput,
    handler: async (a: unknown) => { const { candles, n, m, p } = a as { candles: { high: number; low: number; close: number }[]; n: number; m: number; p: number }; try { const i = new StochasticOscillator(n, m, p); for (const c of candles) i.add(c); return ok({ indicator: 'Stochastic', n, m, p, result: i.getResultOrThrow() as { stochD: number; stochK: number }, ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_stoch_rsi', description: '随机 RSI (Stochastic RSI)', schema: StochRSIInput,
    handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new StochasticRSI(interval); for (const v of values) i.add(v); return ok({ indicator: 'StochRSI', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_tds', description: "Tom DeMark's Sequential Indicator (TDS)", schema: TDSInput,
    handler: async (a: unknown) => {
      const { values } = a as { values: number[] };
      try {
        // TDS 实际需要约 50+ 根 K 线才能完成完整计数，预检查避免误导性报错
        if (values.length < 50) {
          return ok({ error: true, message: 'TDS 需要至少 50 个数据点才能完成 Setup(9)+Countdown(13)完整计数' });
        }
        const i = new TDS();
        for (const v of values) i.add(v);
        return ok({ indicator: 'TDS', last: i.getResultOrThrow(), ...sig(i) });
      } catch (e) {
        logError(e as Error);
        // 翻译 trading-signals 库的误导性报错 "minimum of 9 inputs"
        return ok({ error: true, message: 'TDS 计算失败，需要约 50+ 根 K 线才能完成完整序列' });
      }
    },
  },
  {
    name: 'indicator_williams_r', description: '威廉指标 (Williams %R)', schema: WilliamsRInput,
    handler: async (a: unknown) => { const { candles, interval } = a as { candles: { high: number; low: number; close: number }[]; interval: number }; try { const i = new WilliamsR(interval); for (const c of candles) i.add(c); return ok({ indicator: 'WilliamsR', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
];
