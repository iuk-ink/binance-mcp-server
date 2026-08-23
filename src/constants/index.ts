/**
 * 全局常量集中定义
 *
 * 单一事实来源：所有跨模块共享 / 可统一调参的数值集中于此，
 * 供 exchange / mcp / tools / utils 各层引用。
 *
 * 设计约定：
 * - 按域分区，命名与分区对应（如币安 API 边界、精度换算）
 * - 来源标注：币安官方文档约束 / 业务调参值
 * - 配置层（config/*）的校验边界与默认值不在此重复（已在 config 单源定义）
 *
 * @module constants
 */

// ============================================================================
//  币安 API 边界（来源：币安 USD-M 期货官方文档）
// ============================================================================

/** K 线单次请求上限（默认 500，最大 1500） */
export const KLINE_MAX_LIMIT = 1500;
/** 直连工具（快照 / 指标 / 风险绩效）默认 K 线数量 */
export const KLINE_DEFAULT_LIMIT = 200;
/** 原始 K 线工具（market_klines）默认返回条数 */
export const MARKET_KLINE_DEFAULT_LIMIT = 100;
/** 订单簿默认档位数（合法值 5/10/20/50/100/500/1000） */
export const ORDERBOOK_DEFAULT_LIMIT = 20;
/** 订单簿全部合法档位数（官方端点仅接受离散值） */
export const ORDERBOOK_VALID_LIMITS: readonly number[] = [5, 10, 20, 50, 100, 500, 1000];
/** 情绪类端点（历史 OI / 多空比 / 主动买卖 / 大户持仓）默认返回条数 */
export const SENTIMENT_DEFAULT_LIMIT = 30;
/** 情绪类端点最大返回条数 */
export const SENTIMENT_MAX_LIMIT = 500;
/** 历史资金费率默认返回条数 */
export const FUNDING_HISTORY_DEFAULT_LIMIT = 100;
/** 历史资金费率最大返回条数 */
export const FUNDING_HISTORY_MAX_LIMIT = 1000;
/** 连续合约 K 线默认返回条数 */
export const CONTINUOUS_KLINE_DEFAULT_LIMIT = 500;
/** 收支流水（income）默认 / 最大返回条数 */
export const INCOME_HISTORY_DEFAULT_LIMIT = 100;
export const INCOME_HISTORY_MAX_LIMIT = 1000;
/** 历史订单默认 / 最大返回条数 */
export const ORDER_HISTORY_DEFAULT_LIMIT = 100;
export const ORDER_HISTORY_MAX_LIMIT = 1000;
/** 强平订单默认 / 最大返回条数 */
export const FORCE_ORDERS_DEFAULT_LIMIT = 50;
export const FORCE_ORDERS_MAX_LIMIT = 100;
/** 成交记录默认 / 最大返回条数 */
export const TRADES_DEFAULT_LIMIT = 100;
export const TRADES_MAX_LIMIT = 1000;
/** exchangeInfo 缓存有效期（5 分钟） */
export const EXCHANGE_INFO_TTL_MS = 5 * 60 * 1000;
/** 历史 K 线缓存有效期（毫秒）：只读行情高频调用时复用同 symbol+interval 的短缓存 */
export const KLINE_CACHE_TTL_MS = 3000;
/** 历史 K 线缓存最大条目数（防 Map 无限增长，超出后按插入序淘汰最旧） */
export const KLINE_CACHE_MAX_ENTRIES = 100;
/** 自定义订单号最大长度（币安 clientOrderId 上限） */
export const CLIENT_ORDER_ID_MAX_LENGTH = 36;
/**
 * 自定义订单号合法字符集（官方约束，tools 前置校验与 exchange 兜底校验共用）
 *
 * 官方正则：`^[\.A-Z\:/a-z0-9_-]{1,36}$`（字符集 + 长度一体，长度上限引用常量单源）。
 */
export const CLIENT_ORDER_ID_PATTERN = new RegExp(
  `^[\\.A-Z\\:/a-z0-9_-]{1,${CLIENT_ORDER_ID_MAX_LENGTH}}$`,
);
/**
 * GTD 订单自动撤销时间上界（毫秒时间戳，官方约束）
 *
 * 官方要求 goodTillDate 早于 253402300799000（UTC 9999-12-31 23:59:59）；
 * 下界（当前时间 + 600 秒）为动态约束，交由交易所层校验以保证 schema 确定性。
 */
export const GOOD_TILL_DATE_MAX = 253_402_300_799_000;
/** 交易对最大杠杆倍数（视交易对而定） */
export const MAX_LEVERAGE = 125;
/** 追踪止损回撤百分比合法下界（官方 TRAILING_STOP_MARKET 约束，min 0.1%） */
export const CALLBACK_RATE_MIN = 0.1;
/** 追踪止损回撤百分比合法上界（官方 TRAILING_STOP_MARKET 约束，max 10%） */
export const CALLBACK_RATE_MAX = 10;
/**
 * 币安错误码：后端超时（官方文档 -1007 TIMEOUT）
 *
 * 该错误经 HTTP 400 返回但语义为撮合引擎超时（"Send status unknown; execution
 * status unknown"），需按服务端故障处理；下单类请求应先查证成交状态再重试。
 */
export const BINANCE_ERROR_CODE_BACKEND_TIMEOUT = -1007;
/**
 * 时钟偏差告警阈值（毫秒）
 *
 * 本机与币安服务器时间偏差超过该值时，签名请求可能报 -1021（timestamp out of
 * window）。SDK 内部恒用本机 `Date.now()` 生成签名时间戳且无法注入偏移，
 * 故超出阈值时的最优处理是主动探测并在启动时显著告警，指引校准时钟或调大 recvWindow。
 */
export const CLOCK_SKEW_WARN_THRESHOLD_MS = 1000;
/**
 * 时钟偏差定时重测间隔（毫秒，默认 1 小时）
 *
 * 覆盖进程运行中系统时钟被 NTP 校准导致偏差变化后，签名 -1021 复发的情况；
 * 使用 unref 定时器，不阻止进程退出。
 */
export const CLOCK_SKEW_REPROBE_INTERVAL_MS = 60 * 60 * 1000;

// ============================================================================
//  行情快照（market_overview）调参值
// ============================================================================

/** 快照工具 limit 下界（需足够 K 线计算派生量）与上界（控制响应体积） */
export const MARKET_OVERVIEW_LIMIT_MIN = 30;
export const MARKET_OVERVIEW_LIMIT_MAX = 500;
/** 快照工具情绪 / 资金历史端点统一统计周期 */
export const MARKET_OVERVIEW_SENTIMENT_PERIOD = "4h";
/** 快照工具历史资金费率保留条数 */
export const MARKET_OVERVIEW_HISTORY_N = 12;
/** 快照工具指标层保留最近稳定值个数 */
export const MARKET_OVERVIEW_RECENT_N = 6;
/** 快照工具盘口展示档数（拉取与裁剪一致） */
export const MARKET_OVERVIEW_BOOK_DEPTH = 5;
/** 快照工具默认 K 线周期 */
export const MARKET_OVERVIEW_DEFAULT_INTERVAL = "1h";

// ============================================================================
//  指标周期 / 倍数范围（schema 校验统一口径）
// ============================================================================

/** 指标周期最小合法值 */
export const PERIOD_MIN = 2;
/** 指标直连工具 K 线数量下界（与指标周期语义无关） */
export const INDICATOR_KLINE_LIMIT_MIN = 2;
/** 长周期指标（SMA / EMA）最大周期 */
export const PERIOD_MAX_LONG = 500;
/** 中周期指标（RSI / MACD / BBands）最大周期 */
export const PERIOD_MAX_MEDIUM = 250;
/** 短周期指标（ATR / ADX / CCI / MFI / Stoch 等）最大周期 */
export const PERIOD_MAX_SHORT = 100;
/** 通道 / 标准差倍数最小合法值 */
export const MULTIPLIER_MIN = 0.1;
/** 通道 / 标准差倍数最大合法值 */
export const MULTIPLIER_MAX = 100;

// ============================================================================
//  指标默认参数（来源：trading-signals 惯例与行业通用值）
// ============================================================================

/** 移动平均（SMA / EMA）默认周期 */
export const MOVING_AVERAGE_PERIOD = 20;
/** RSI 默认周期 */
export const RSI_PERIOD = 14;
/** ATR 默认周期 */
export const ATR_PERIOD = 14;
/** ADX 默认周期 */
export const ADX_PERIOD = 14;
/** CCI 默认周期 */
export const CCI_PERIOD = 20;
/** MFI 默认周期 */
export const MFI_PERIOD = 14;
/** MACD 快线 / 慢线 / 信号线默认周期 */
export const MACD_FAST = 12;
export const MACD_SLOW = 26;
export const MACD_SIGNAL = 9;
/** 布林带默认周期与标准差倍数 */
export const BOLLINGER_PERIOD = 20;
export const BOLLINGER_MULTIPLIER = 2;
/** 布林带标准差倍数最大合法值 */
export const BOLLINGER_MULTIPLIER_MAX = 10;
/** SuperTrend 默认 ATR 周期与通道倍数 */
export const SUPER_TREND_PERIOD = 10;
export const SUPER_TREND_MULTIPLIER = 3;
/** Stochastic 默认 K / D 周期与 K 线平滑周期 */
export const STOCH_K_PERIOD = 14;
export const STOCH_D_PERIOD = 3;
export const STOCH_K_SLOWING = 3;
/**
 * OBV 默认预热周期（trading-signals 特有语义）
 *
 * 该包的 OBV 将 interval 用作预热长度：跳过前 interval−1 根后，
 * 从第 interval 根起输出自 0 起累计的 OBV（结果仍为累计量，非窗口均值）。
 */
export const OBV_PERIOD = 30;

// ============================================================================
//  组合信号参数（业务调参值）
// ============================================================================

/** 均线交叉默认快 / 慢线周期 */
export const MA_CROSS_FAST = 12;
export const MA_CROSS_SLOW = 26;
/** RSI 背离检测默认分析窗口大小 */
export const DIVERGENCE_LOOKBACK = 20;
/** RSI 背离检测分析窗口下界 */
export const DIVERGENCE_LOOKBACK_MIN = 10;
/** 波动率状态分类默认历史比较窗口 */
export const VOLATILITY_LOOKBACK = 50;
/** 波动率分类历史窗口下界 */
export const VOLATILITY_LOOKBACK_MIN = 20;
/** RSI 背离 / 波动率分类的分析窗口上界 */
export const LOOKBACK_MAX = 200;
/** 波动率分档阈值（带宽百分位，5 等分） */
export const VOLATILITY_QUANTILE_LOW = 20;
export const VOLATILITY_QUANTILE_MID_LOW = 40;
export const VOLATILITY_QUANTILE_MID_HIGH = 60;
export const VOLATILITY_QUANTILE_HIGH = 80;

// ============================================================================
//  风险绩效（analysis 域）参数
// ============================================================================

/** K 线周期字面量联合（本地定义，值集与 exchange 层 KlineInterval 严格一致——避免 constants 反向依赖 exchange） */
type KlineIntervalKey =
  | "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h"
  | "12h" | "1d" | "3d" | "1w" | "1M";
/** 每年分钟数（365 天 × 24h，加密市场 7×24 交易，非 252 交易日历） */
export const MINUTES_PER_YEAR = 365 * 24 * 60;
/** 各 K 线周期单根时长（分钟），年化系数 = MINUTES_PER_YEAR / 单根分钟数（1h→8760、1M→12.17） */
export const MINUTES_PER_INTERVAL: Readonly<Record<KlineIntervalKey, number>> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "12h": 720,
  "1d": 1440,
  "3d": 4320,
  "1w": 10080,
  "1M": 43200,
};
/** 年化换算系数（periodPerYear）入参上界（覆盖 1m 周期的 525600） */
export const PERIODS_PER_YEAR_MAX = 1_000_000;
/** 年化换算系数保留小数位（1w→52.14、1M→12.17、3d→121.67） */
export const PERIODS_PER_YEAR_DECIMALS = 2;
/** VaR / CVaR 置信度下界 */
export const CONFIDENCE_MIN = 0.5;
/** VaR / CVaR 置信度上界 */
export const CONFIDENCE_MAX = 0.99;
/** VaR / CVaR 默认置信度 */
export const CONFIDENCE_DEFAULT = 0.95;
/** 夏普无风险利率默认值（单周期小数口径） */
export const RISK_FREE_RATE_DEFAULT = 0;
/** 风险工具最小 K 线数（3 根产生 2 个收益率样本） */
export const RISK_MIN_KLINES = 3;

// ============================================================================
//  精度 / 换算（utils 层）
// ============================================================================

/** 浮点除法误差消除 epsilon（step 最小约 1e-8，取小一个数量级） */
export const FLOATING_POINT_EPSILON = 1e-9;
/** 小数转百分比换算系数 */
export const PERCENT_SCALE = 100;
/** 流动性点差保留小数位 */
export const SPREAD_PRECISION = 6;
/** roundValue 默认保留小数位 */
export const ROUND_DEFAULT_DECIMALS = 8;
/** 布林带上下轨重合时 %B 的兜底值 */
export const PERCENTB_FALLBACK = 50;

// ============================================================================
//  通用校验边界（schema 层）
// ============================================================================

/** 交易对符号长度范围 */
export const SYMBOL_MIN_LENGTH = 5;
export const SYMBOL_MAX_LENGTH = 20;
