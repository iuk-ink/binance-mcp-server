/**
 * 币安操作层单元测试 — 账户服务
 *
 * 使用伪造客户端验证响应映射（不触网）。
 *
 * @module exchange/__tests__/account
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { AccountService } from "../account.js";
import { createFakeClient } from "./fake-client.js";

describe("AccountService", () => {
  test("getBalances 映射余额字段", async () => {
    const client = createFakeClient({
      futuresAccountBalanceV3: [
        {
          asset: "USDT",
          balance: "1000",
          availableBalance: "900",
          crossWalletBalance: "1000",
          crossUnPnl: "10",
        },
      ],
    });
    const account = new AccountService(client);
    const result = await account.getBalances();
    assert.deepEqual(result[0], {
      asset: "USDT",
      balance: 1000,
      availableBalance: 900,
      crossWalletBalance: 1000,
      unrealizedProfit: 10,
    });
  });

  test("getAccountInfo 映射汇总字段", async () => {
    const client = createFakeClient({
      accountInformationV3: {
        totalWalletBalance: "1000",
        totalUnrealizedProfit: "10",
        totalMarginBalance: "1010",
        availableBalance: "900",
        totalPositionInitialMargin: "50",
        totalOpenOrderInitialMargin: "10",
      },
    });
    const account = new AccountService(client);
    const result = await account.getAccountInfo();
    assert.equal(result.totalWalletBalance, 1000);
    assert.equal(result.availableBalance, 900);
  });

  test("getPositions 映射持仓字段", async () => {
    const client = createFakeClient({
      positionInformationV3: [
        {
          symbol: "BTCUSDT",
          positionSide: "LONG",
          positionAmt: "0.5",
          entryPrice: "50000",
          markPrice: "51000",
          unRealizedProfit: "500",
          liquidationPrice: "40000",
          marginType: "ISOLATED",
          notional: "25500",
          initialMargin: "1000",
          maintMargin: "500",
          updateTime: 1700000000000,
        },
      ],
    });
    const account = new AccountService(client);
    const result = await account.getPositions("BTCUSDT");
    assert.equal(result[0].positionAmt, 0.5);
    assert.equal(result[0].marginType, "ISOLATED");
    assert.equal(result[0].positionSide, "LONG");
  });

  test("getIncomeHistory 保留 tranId 为字符串", async () => {
    const client = createFakeClient({
      getIncomeHistory: [
        {
          symbol: "BTCUSDT",
          incomeType: "FUNDING_FEE",
          income: "-0.5",
          asset: "USDT",
          time: 1700000000000,
          tranId: 1234567890123456789n,
        },
      ],
    });
    const account = new AccountService(client);
    const result = await account.getIncomeHistory({ symbol: "BTCUSDT" });
    assert.equal(result[0].incomeType, "FUNDING_FEE");
    assert.equal(result[0].income, -0.5);
    assert.equal(result[0].tranId, "1234567890123456789");
  });

  test("getCommissionRate 映射费率", async () => {
    const client = createFakeClient({
      userCommissionRate: {
        symbol: "BTCUSDT",
        makerCommissionRate: "0.0002",
        takerCommissionRate: "0.0004",
      },
    });
    const account = new AccountService(client);
    const result = await account.getCommissionRate("BTCUSDT");
    assert.equal(result.makerCommissionRate, 0.0002);
    assert.equal(result.takerCommissionRate, 0.0004);
  });
});
