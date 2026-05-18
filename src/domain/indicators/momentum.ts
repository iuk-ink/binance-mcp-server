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
 * - TDS 需要 50+ 数据点，handler 内做了预检查（不使用 wrapHandler）
 */

import { AO, MOM, CCI, MACD, OBV, ROC, RSI, StochasticOscillator, StochasticRSI, TDS, WilliamsR, EMA, DEMA, SMA } from 'trading-signals';
import { logError } from '../../utils/error-handling.js';
import type { ToolDefinition } from '../../types/common.js';
import { roundValue } from './format.js';
import { ok, wrapHandler } from '../../utils/response.js';
import { AOInput, MOMInput, CCIInput, MACDInput, OBVInput, ROCInput, RSIInput, StochInput, StochRSIInput, TDSInput, WilliamsRInput } from './schemas.js';

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
    handler: wrapHandler((args: { candles: { high: number; low: number }[]; shortInterval: number; longInterval: number; smoothingType?: string }) => {
      const i = new AO(args.shortInterval, args.longInterval, (args.smoothingType === 'SMA' ? SMA : undefined) as any);
      const k = i as unknown as { add(v: { high: number; low: number }): number | null };
      let last: number | null = null;
      for (const c of args.candles) last = k.add(c);
      return roundValue({ indicator: 'AO', short: args.shortInterval, long: args.longInterval, last, ...sig(i) });
    }, 'indicator_ao'),
  },
  { name: 'indicator_mom', description: '动量指标 (MOM/MTM)', schema: MOMInput, handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new MOM(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'MOM', interval: args.interval, last: i.getResultOrThrow(), ...sig(i) }); }, 'indicator_mom') },
  {
    name: 'indicator_cci', description: '商品通道指数 (CCI)', schema: CCIInput,
    handler: wrapHandler((args: { candles: { high: number; low: number; close: number }[]; interval: number }) => { const i = new CCI(args.interval); for (const c of args.candles) i.add(c); return roundValue({ indicator: 'CCI', interval: args.interval, last: i.getResultOrThrow(), ...sig(i) }); }, 'indicator_cci'),
  },
  {
    name: 'indicator_macd', description: '指数平滑异同移动平均线 (MACD)', schema: MACDInput,
    handler: wrapHandler((args: { values: number[]; fast: number; slow: number; signal: number; indicatorType?: string }) => { const ct = { EMA, DEMA }; const C = ct[args.indicatorType === 'DEMA' ? 'DEMA' : 'EMA'] || EMA; const i = new MACD(new C(args.fast), new C(args.slow), new C(args.signal)); for (const v of args.values) i.add(v); return roundValue({ indicator: 'MACD', fast: args.fast, slow: args.slow, signal: args.signal, result: i.getResultOrThrow() as { histogram: number; macd: number; signal: number }, ...sig(i) }); }, 'indicator_macd'),
  },
  {
    name: 'indicator_obv', description: '能量潮指标 (OBV)', schema: OBVInput,
    handler: wrapHandler((args: { candles: { open: number; high: number; low: number; close: number; volume: number }[]; interval: number }) => { const i = new OBV(args.interval); for (const c of args.candles) i.add(c); return roundValue({ indicator: 'OBV', interval: args.interval, last: i.getResultOrThrow(), ...sig(i) }); }, 'indicator_obv'),
  },
  { name: 'indicator_roc', description: '变化率指标 (ROC)', schema: ROCInput, handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new ROC(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'ROC', interval: args.interval, last: i.getResultOrThrow(), ...sig(i) }); }, 'indicator_roc') },
  {
    name: 'indicator_rsi', description: '相对强弱指数 (RSI)', schema: RSIInput,
    handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new RSI(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'RSI', interval: args.interval, value: i.getResultOrThrow(), ...sig(i) }); }, 'indicator_rsi'),
  },
  {
    name: 'indicator_stoch', description: '随机振荡器 (Stochastic Oscillator)', schema: StochInput,
    handler: wrapHandler((args: { candles: { high: number; low: number; close: number }[]; n: number; m: number; p: number }) => { const i = new StochasticOscillator(args.n, args.m, args.p); for (const c of args.candles) i.add(c); return roundValue({ indicator: 'Stochastic', n: args.n, m: args.m, p: args.p, result: i.getResultOrThrow() as { stochD: number; stochK: number }, ...sig(i) }); }, 'indicator_stoch'),
  },
  {
    name: 'indicator_stoch_rsi', description: '随机 RSI (Stochastic RSI)', schema: StochRSIInput,
    handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new StochasticRSI(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'StochRSI', interval: args.interval, last: i.getResultOrThrow(), ...sig(i) }); }, 'indicator_stoch_rsi'),
  },
  {
    name: 'indicator_tds', description: "Tom DeMark's Sequential Indicator (TDS)", schema: TDSInput,
    handler: async (a: unknown) => {
      const { values } = a as { values: number[] };
      try {
        if (values.length < 50) {
          return ok({ error: true, message: 'TDS 需要至少 50 个数据点才能完成 Setup(9)+Countdown(13)完整计数' });
        }
        const i = new TDS();
        for (const v of values) i.add(v);
        return ok(roundValue({ indicator: 'TDS', last: i.getResultOrThrow(), ...sig(i) }));
      } catch (e) {
        logError(e as Error, { tool: 'indicator_tds' });
        return ok({ error: true, message: 'TDS 计算失败，需要约 50+ 根 K 线才能完成完整序列' });
      }
    },
  },
  {
    name: 'indicator_williams_r', description: '威廉指标 (Williams %R)', schema: WilliamsRInput,
    handler: wrapHandler((args: { candles: { high: number; low: number; close: number }[]; interval: number }) => { const i = new WilliamsR(args.interval); for (const c of args.candles) i.add(c); return roundValue({ indicator: 'WilliamsR', interval: args.interval, last: i.getResultOrThrow(), ...sig(i) }); }, 'indicator_williams_r'),
  },
];
