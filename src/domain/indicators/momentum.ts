/**
 * Binance MCP Server v2.0 — 动量类技术指标工具 (14 个)
 * @module domain/indicators/momentum
 */
import { AO, AC, MOM, CCI, CG, MACD, OBV, REI, ROC, RSI, StochasticOscillator, StochasticRSI, TDS, WilliamsR, EMA, DEMA, SMA } from 'trading-signals';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logError } from '../../utils/error-handling.js';
import type { ToolDefinition } from '../../types/common.js';
import { roundValue } from './format.js';
import { AOInput, ACInput, MOMInput, CCIInput, CGInput, MACDInput, OBVInput, REIInput, ROCInput, RSIInput, StochInput, StochRSIInput, TDSInput, WilliamsRInput } from './schemas.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(roundValue(data), null, 2) }] };
}

function sig(ind: unknown) { const s = (ind as { getSignal?: () => { state: string; hasChanged: boolean } }).getSignal?.(); return s ? { signal: s } : {}; }

export const momentumTools: ToolDefinition[] = [
  {
    name: 'indicator_ao', description: 'Awesome Oscillator (AO)', schema: AOInput,
    handler: async (a: unknown) => { const { candles, shortInterval, longInterval, smoothingType } = a as { candles: { high: number; low: number }[]; shortInterval: number; longInterval: number; smoothingType?: string }; try { const i = new AO(shortInterval, longInterval, (smoothingType === 'SMA' ? SMA : undefined) as any); const k = i as unknown as { add(v: { high: number; low: number }): number | null }; let last: number | null = null; for (const c of candles) last = k.add(c); return ok({ indicator: 'AO', short: shortInterval, long: longInterval, last, ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_ac', description: 'Accelerator Oscillator (AC)', schema: ACInput,
    handler: async (a: unknown) => { const { candles, shortAO, longAO, signalInterval } = a as { candles: { high: number; low: number }[]; shortAO: number; longAO: number; signalInterval: number }; try { const i = new AC(shortAO, longAO, signalInterval); for (const c of candles) (i as unknown as { add(v: unknown): number | null }).add(c); return ok({ indicator: 'AC', last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  { name: 'indicator_mom', description: '动量指标 (MOM/MTM)', schema: MOMInput, handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new MOM(interval); for (const v of values) i.add(v); return ok({ indicator: 'MOM', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  {
    name: 'indicator_cci', description: '商品通道指数 (CCI)', schema: CCIInput,
    handler: async (a: unknown) => { const { candles, interval } = a as { candles: { high: number; low: number; close: number }[]; interval: number }; try { const i = new CCI(interval); for (const c of candles) i.add(c); return ok({ indicator: 'CCI', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_cg', description: '重心指标 (Center of Gravity)', schema: CGInput,
    handler: async (a: unknown) => { const { values, interval, signalInterval } = a as { values: number[]; interval: number; signalInterval: number }; try { const i = new CG(interval, signalInterval); for (const v of values) i.add(v); return ok({ indicator: 'CG', interval, signalInterval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_macd', description: '指数平滑异同移动平均线 (MACD)', schema: MACDInput,
    handler: async (a: unknown) => { const { values, fast, slow, signal: sigNum, indicatorType } = a as { values: number[]; fast: number; slow: number; signal: number; indicatorType?: string }; try { const ct = { EMA, DEMA }; const C = ct[indicatorType === 'DEMA' ? 'DEMA' : 'EMA'] || EMA; const i = new MACD(new C(fast), new C(slow), new C(sigNum)); for (const v of values) i.add(v); return ok({ indicator: 'MACD', fast, slow, signal: sigNum, result: i.getResultOrThrow() as { histogram: number; macd: number; signal: number }, ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_obv', description: '能量潮指标 (OBV)', schema: OBVInput,
    handler: async (a: unknown) => { const { candles, interval } = a as { candles: { open: number; high: number; low: number; close: number; volume: number }[]; interval: number }; try { const i = new OBV(interval); for (const c of candles) i.add(c); return ok({ indicator: 'OBV', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_rei', description: '范围扩展指数 (REI)', schema: REIInput,
    handler: async (a: unknown) => { const { candles, interval } = a as { candles: { high: number; low: number; close: number }[]; interval: number }; try { const i = new REI(interval); for (const c of candles) i.add(c); return ok({ indicator: 'REI', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
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
    handler: async (a: unknown) => { const { values } = a as { values: number[] }; try { const i = new TDS(); for (const v of values) i.add(v); return ok({ indicator: 'TDS', last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_williams_r', description: '威廉指标 (Williams %R)', schema: WilliamsRInput,
    handler: async (a: unknown) => { const { candles, interval } = a as { candles: { high: number; low: number; close: number }[]; interval: number }; try { const i = new WilliamsR(interval); for (const c of candles) i.add(c); return ok({ indicator: 'WilliamsR', interval, last: i.getResultOrThrow(), ...sig(i) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
];
