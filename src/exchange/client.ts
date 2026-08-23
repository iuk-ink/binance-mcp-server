/**
 * 币安操作模块 — 官方包客户端创建与单例持有
 *
 * 职责：
 * - 从 config 模块读取配置，构造官方包客户端
 * - 客户端实例由模块级单例持有，进程内只创建一次
 * - 创建失败时归一化为 ExchangeError 上抛
 *
 * @module exchange/client
 */

import { DerivativesTradingUsdsFutures } from "@binance/derivatives-trading-usds-futures";
import { CLOCK_SKEW_REPROBE_INTERVAL_MS } from "../constants/index.js";
import { loadConfig } from "../config/index.js";
import { createLogger } from "../utils/logger.js";
import { fromConnectorError } from "./errors.js";
import { isClockSkewSignificant, sampleServerClock } from "./skew.js";

/** 共享客户端实例（惰性创建） */
let sharedClient: DerivativesTradingUsdsFutures | null = null;

/**
 * 获取官方包客户端单例
 *
 * 首次调用时用 loadConfig 构造：
 * - apiKey / apiSecret 凭证（空串时公开端点不签名）
 * - basePath 由 config 按环境推断（测试网 / Demo / 主网）
 * - timeout 覆盖官方默认 1000ms
 * - retries / backoff 重试策略
 * - proxy 可选代理
 *
 * @returns 官方包客户端实例
 * @throws {ExchangeError} 构造失败时抛出
 */
export function getClient(): DerivativesTradingUsdsFutures {
  if (sharedClient) return sharedClient;

  const config = loadConfig();
  const logger = createLogger({ name: "exchange", level: config.logLevel }).child({
    component: "client",
  });

  try {
    sharedClient = new DerivativesTradingUsdsFutures({
      configurationRestAPI: {
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        basePath: config.basePath,
        timeout: config.timeout,
        retries: config.retries,
        backoff: config.backoff,
        ...(config.proxy ? { proxy: config.proxy } : {}),
      },
    });
    logger.info("币安客户端创建完成", {
      env: config.demoTrading ? "demo" : config.testnet ? "testnet" : "mainnet",
      basePath: config.basePath,
      timeout: config.timeout,
    });

    // 配置凭证时探测一次时钟偏差；偏差显著则在 stderr 告警（签名可能报 -1021）。
    // 探测为后台任务，失败不阻塞启动。
    if (config.apiKey !== "") {
      void probeClockSkewAndWarn(sharedClient, logger);
    }
  } catch (err) {
    // 构造失败（如代理配置非法）归一化后上抛
    throw fromConnectorError(err);
  }

  return sharedClient;
}

/**
 * 后台探测并告警时钟偏差，随后按低频定时器持续复测
 *
 * 采样失败或字段缺失不告警、不抛错（探测仅用于提示，不应影响服务启动）；
 * 定时器使用 unref，不阻止进程随标准输入关闭而退出。
 *
 * @param client - 官方包客户端
 * @param logger - 日志记录器
 */
async function probeClockSkewAndWarn(
  client: DerivativesTradingUsdsFutures,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  await probeClockSkewOnce(client, logger);
  // 覆盖运行中 NTP 校准等导致的偏差变化
  const timer = setInterval(() => {
    void probeClockSkewOnce(client, logger);
  }, CLOCK_SKEW_REPROBE_INTERVAL_MS);
  timer.unref();
}

/**
 * 单次探测并告警时钟偏差
 *
 * 采样失败或字段缺失不告警、不抛错。
 *
 * @param client - 官方包客户端
 * @param logger - 日志记录器
 */
async function probeClockSkewOnce(
  client: DerivativesTradingUsdsFutures,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  try {
    const sample = await sampleServerClock(client);
    if (!sample) return;
    if (isClockSkewSignificant(sample.offsetMs)) {
      logger.warn("检测到本机与币安服务器存在时钟偏差，签名请求可能报 -1021", {
        offsetMs: sample.offsetMs,
        serverTime: sample.serverTime,
      });
    } else {
      logger.debug("时钟偏差在安全范围内", { offsetMs: sample.offsetMs });
    }
  } catch {
    // 探测失败不阻塞启动（如网络不可达）
  }
}
