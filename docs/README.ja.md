# Binance MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.29-purple)](https://modelcontextprotocol.io/)

🌐 **Language:** [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [简体中文](../README.md)

Model Context Protocol (MCP) ベースの **Binance 先物 API サーバー** — 76 個のツールで先物相場・注文執行・テクニカル指標の 3 領域をカバーします。

## クイックスタート

- **環境:** Node.js >= 18
- **API Key:** 任意（未設定の場合は相場と指標のみ、設定すれば取引も利用可能）

```bash
npm install
cp .env.example .env
npm run dev   # または: npm run build && npm start
```

## ツール一覧（全 76 個）

### 先物パブリック（11 個、Key 不要）

| ツール | 機能 |
|------|------|
| `futures_ping` | 接続テスト |
| `futures_time` | サーバー時間 |
| `futures_exchange_info` | 取引ルール / 手数料 / 最小注文サイズ |
| `futures_orderbook` | 板情報の深さ |
| `futures_klines` | ローソク足（1m ~ 1M） |
| `futures_agg_trades` | 約定履歴集計（ページング + 時間範囲） |
| `futures_trades` | 最新約定 |
| `futures_daily_stats` | 24 時間統計 |
| `futures_prices` | 全銘柄のリアルタイム価格 |
| `futures_all_book_tickers` | 全銘柄の最良気配 |
| `futures_mark_price` | マーク価格（清算基準） |

### 先物認証（19 個、Key 必要）

| 分類 | ツール | 機能 |
|------|------|------|
| 🏦 アカウント照会 | `futures_account_balance` | 口座残高 |
| | `futures_income` | 収益履歴（資金調達率/損益/手数料） |
| | `futures_user_trades` | 約定履歴 |
| ⚙️ レバレッジと証拠金 | `futures_leverage` | レバレッジ設定 1-125x |
| | `futures_margin_type` | ISOLATED / CROSSED 切替 |
| | `futures_position_margin` | 逐次証拠金の増減 |
| | `futures_margin_history` | 証拠金変更履歴 |
| 📊 レバレッジ階層 | `futures_leverage_bracket` | 想定元本レバレッジ段階表 |
| 📝 注文 | `futures_order` | 注文（7 種類） |
| | `futures_update_order` | 注文修正 |
| | `futures_get_order` | 単一注文照会 |
| | `futures_all_orders` | 全注文（履歴含む） |
| | `futures_batch_orders` | 一括注文（≤5） |
| | `futures_cancel_batch_orders` | 一括取消 |
| ❌ 取消とアクティブ | `futures_cancel_order` | 単一取消（条件付き注文の algoId 対応） |
| | `futures_cancel_all_open_orders` | 全建玉取消（確認必要） |
| | `futures_open_orders` | 現在の有効注文一覧 |
| 🛠️ ユーティリティ | `futures_account_report` | 口座全体レポート（残高+ポジション+注文） |
| | `futures_quick_order` | ワンクリック損切り/利確（％ずらしで自動計算） |

#### 注文タイプ早見表

| type | 用途 | 必須パラメータ | クローズ方法 |
|------|------|------|------|
| `MARKET` | 成行エントリー/決済 | `quantity` | SELL+LONG は自動 reduceOnly |
| `LIMIT` | 指値注文 | `price`, `quantity` | 同上 |
| `STOP_MARKET` | 成行ストップロス | `stopPrice` | `closePosition=true` |
| `TAKE_PROFIT_MARKET` | 成行利確 | `stopPrice` | `closePosition=true` |
| `TRAILING_STOP_MARKET` | トレーリングストップ | `activationPrice`, `callbackRate` | `closePosition=true` |
| `STOP` | 指値ストップロス | `price`, `stopPrice` | `closePosition=true` |

#### 決済早見表

| シナリオ | パラメータ |
|------|------|
| 成行で全建玉決済 | `side=SELL, positionSide=LONG, type=MARKET, quantity=建玉数` |
| ストップロス決済 | `type=STOP_MARKET, closePosition=true, stopPrice=トリガー価格` |
| 利確決済 | `type=TAKE_PROFIT_MARKET, closePosition=true, stopPrice=トリガー価格` |
| トレーリングストップ決済 | `type=TRAILING_STOP_MARKET, closePosition=true, activationPrice=活性化価格, callbackRate="1"` |
| 条件付き注文取消 | `futures_cancel_order(symbol, algoId=xxx)` |

### テクニカル指標（46 個、Key 不要）

| 分類 | 数 | ツール一覧 |
|------|:--:|------|
| **トレンド** | 12 | `indicator_sma`, `indicator_ema`, `indicator_dema`, `indicator_rma`, `indicator_wma`, `indicator_wsma`, `indicator_dma`, `indicator_dx`, `indicator_adx`, `indicator_linreg`, `indicator_psar`, `indicator_vwap` |
| **モメンタム** | 11 | `indicator_ao`, `indicator_mom`, `indicator_cci`, `indicator_macd`, `indicator_obv`, `indicator_roc`, `indicator_rsi`, `indicator_stoch`, `indicator_stoch_rsi`, `indicator_tds`, `indicator_williams_r` |
| **ボラティリティ** | 5 | `indicator_abands`, `indicator_atr`, `indicator_bbands`, `indicator_iqr`, `indicator_zigzag` |
| **ユーティリティ** | 9 | `util_average`, `util_grid`, `util_max`, `util_min`, `util_median`, `util_quartile`, `util_stddev`, `util_streaks`, `util_weekday` |
| **シグナル** | 4 | `signal_ema_cross`, `signal_macd_rsi`, `signal_bb_rsi`, `signal_ma_cross` |
| **リスク** | 5 | `util_sharpe`, `util_max_drawdown`, `util_calmar`, `util_win_rate`, `util_var` |

## 環境設定

| 変数 | 必須 | 説明 |
|------|:--:|------|
| `BINANCE_API_KEY` | 不要 | Binance API キー |
| `BINANCE_API_SECRET` | 不要 | Binance API シークレット |
| `BINANCE_TESTNET` | 不要 | テストネット切替、デフォルト `true` |
| `HTTP_FUTURES_BASE` | 不要 | 先物エンドポイント、空欄で testnet 自動切替 |
| `HTTP_PROXY` | 不要 | HTTP プロキシ、例 `http://user:pass@host:8080` |
| `MCP_SERVER_NAME` | 不要 | サーバー名、デフォルト `binance-mcp-server` |
| `LOG_LEVEL` | 不要 | ログレベル: `debug` / `info` / `warn` / `error` |

### 環境変数の優先順位

```
MCP 設定 env ブロック  >  .env ファイル  >  コードデフォルト値
```

MCP 設定ファイル（`mcp.json` など）の `env` ブロックが最優先、`.env` は補完。dotenv は**既存の環境変数を上書きしません**。

> **セキュリティのヒント:** キーは MCP 設定の `env` ブロックで管理し、`.env` の値は空にしてください。

## AI アシスタントの設定

> **注意:** MCP 設定ファイルはプロジェクトディレクトリ外にあるため、**絶対パスが必須**です。以下は `E:/Github/I-binance-mcp` にある前提の例です。

### 事前準備: ビルド

```bash
npm run build
```

### Cursor / Trae / OpenCode

```json
{
  "mcpServers": {
    "binance": {
      "command": "node",
      "args": ["E:/Github/I-binance-mcp/dist/index.js"],
      "env": {
        "BINANCE_API_KEY": "your_key",
        "BINANCE_API_SECRET": "your_secret",
        "BINANCE_TESTNET": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add binance -- node E:/Github/I-binance-mcp/dist/index.js
```

## アーキテクチャ

```
src/
├── index.ts              ← エントリポイント
├── server.ts             ← McpServer 作成 + 条件付き登録
├── config/binance.ts     ← 設定（エンドポイント / プロキシ / 認証）
├── types/common.ts       ← ToolDefinition ジェネリック型
├── utils/                ← ロガー / バリデーション / エラーサニタイズ / レート制限
└── domain/
    ├── futures/          ← 先物: パブリック (11) + 認証 (19)
    │   ├── schemas.ts    ← Zod スキーマ
    │   ├── public.ts     ← パブリックハンドラ
    │   ├── authenticated.ts ← 認証ハンドラ
    │   └── index.ts
    └── indicators/       ← テクニカル指標 (46)
        ├── schemas.ts    ← 指標パラメータスキーマ
        ├── format.ts     ← 精度フォーマッタ
        ├── trend.ts (12) / momentum.ts (11)
        ├── volatility.ts (5) / utility.ts (9)
        ├── signals.ts (4) / risk.ts (5)
        └── index.ts
```

**条件付き登録:** API Key あり → 76 ツール; なし → 57 ツール。

## コマンド

| コマンド | 説明 |
|------|------|
| `npm run dev` | 開発モード（tsx） |
| `npm run build` | コンパイル |
| `npm start` | コンパイル済み実行 |
| `npm run typecheck` | 型チェック |
| `npm run watch` | ホットリロード |
| `npx tsx test/smoke-test.ts` | スモークテスト（31 項目） |

## 技術スタック

| コンポーネント | バージョン | 用途 |
|------|------|------|
| `@modelcontextprotocol/sdk` | ^1.29 | MCP フレームワーク（`registerTool`） |
| `binance-api-node` | ^0.13 | Binance API クライアント |
| `trading-signals` | ^7.4 | テクニカル指標計算 |
| `zod` | ^4.4 | スキーマ → JSON Schema 自動生成 |
| `dotenv` | ^17.4 | 環境変数 |
| `typescript` | ^6.0 | メイン言語 |

## セキュリティ

- キーは環境変数のみから注入、コードやログに書き込まれません
- エラーメッセージは自動サニタイズ（`api_key` → `[API_KEY]`、`signature` → `[SIGNATURE]`）
- 取引機能は必ず `BINANCE_TESTNET=true` でテストしてください
- 本番環境では `LOG_LEVEL=error` を推奨

## ライセンス

MIT
