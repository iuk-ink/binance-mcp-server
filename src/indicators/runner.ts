/**
 * 指标计算层 — 流式指标运行适配器
 *
 * trading-signals 指标均为流式类（add/update/updates），预热期返回 null。
 * 本模块将其统一封装为「输入完整序列 → 输出稳定序列 + 预热需求」的调用方式：
 * - {@link runSeries} 喂入全部输入、过滤预热期 null，并携带预热需求元信息
 * - {@link assertStable} 将空稳定序列转为含精确预热需求与当前 limit 的可读错误
 * - {@link latestOf} 取稳定序列最新值（供信号 / 批量工具消费）
 *
 * 错误消息不带工具名前缀：MCP 工厂统一以 `[工具名]` 前缀包装异常。
 *
 * @module indicators/runner
 */

/** 流式指标的最小结构契约（方法参数双变，具体指标类可结构化匹配） */
export interface StreamIndicator<R> {
  updates(inputs: readonly unknown[], replace?: boolean): (R | null)[];
  getRequiredInputs(): number;
}

/** 运行结果：稳定序列 + 预热需求（供上层生成精确错误） */
export interface SeriesResult<R> {
  /** 预热期之后的稳定结果序列（时间升序） */
  series: R[];
  /** 产出首个稳定结果所需的输入数量 */
  requiredInputs: number;
}

/**
 * 运行一个流式指标并收集全部稳定结果
 *
 * @param create - 返回已配置好参数的指标实例
 * @param inputs - 输入序列（价格或 K 线对象）
 * @returns 稳定序列与预热需求；输入为空时序列为空但不抛错
 */
export function runSeries<R>(
  create: () => StreamIndicator<R>,
  inputs: readonly unknown[],
): SeriesResult<R> {
  const indicator = create();
  const requiredInputs = indicator.getRequiredInputs();
  if (inputs.length === 0) {
    return { series: [], requiredInputs };
  }
  const series = indicator.updates(inputs).filter((value): value is R => value !== null);
  return { series, requiredInputs };
}

/**
 * 断言稳定序列非空，否则抛出含精确预热需求的错误
 *
 * @param result - {@link runSeries} 的运行结果
 * @param limit  - 本次拉取的 K 线数量（用于错误指引）
 * @returns 稳定序列
 * @throws 稳定序列为空时抛出可读错误（由 MCP 工厂加工具名前缀后转为 isError）
 */
export function assertStable<R>(result: SeriesResult<R>, limit: number): R[] {
  if (result.series.length === 0) {
    throw new Error(
      `K 线数量不足以产出稳定值（指标预热需 ${result.requiredInputs} 个输入，当前 limit=${limit}），请增大 limit`,
    );
  }
  return result.series;
}

/**
 * 取稳定序列最新值
 *
 * @param result - {@link runSeries} 的运行结果
 * @returns 最新值；序列为空时返回 null
 */
export function latestOf<R>(result: SeriesResult<R>): R | null {
  return result.series.length > 0 ? result.series[result.series.length - 1] : null;
}
