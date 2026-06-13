# scheme.js アーキテクチャ

## ドキュメント

| ファイル | 内容 |
| --- | --- |
| [USAGE.md](USAGE.md) | **使い方ガイド**（npm / CLI / ブラウザ / REPL / JS 連携 / デバッガ） |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 本ファイル（構成・ビルド・モジュール依存） |
| [../README.md](../README.md) | 概要・対応機能一覧・コード例 |

---

## ディレクトリ構成

```
scheme.js/
├── index.js             # npm エントリ (require('@nsas454/scheme-js'))
├── bin/scheme-js.js     # CLI
├── src/                 # ソース (編集はここ)
│   ├── core.js          # Pair, リスト操作, トランポリン
│   ├── env.js           # 環境, クロージャー, lambda
│   ├── continuations.js # dynamic-wind, call/cc
│   ├── primitives.js    # 基本プリミティブ, R5RS 手続き
│   ├── numbers.js       # 数値タワー, NUMERIC_PRIMITIVES
│   ├── io.js            # I/O ポート, read/write
│   ├── r7rs.js          # R7RS small (ライブラリ, 特殊形式)
│   ├── r7rs_large.js    # R7RS large (Red Edition)
│   ├── evaluator.js     # CPS 評価器, マクロ, s_apply
│   ├── js_interop.js    # JavaScript 相互運用
│   ├── debugger.js      # ステップ実行, 評価トレース
│   ├── init.js          # グローバル初期化
│   ├── parser.js        # Tokenizer, parse
│   └── runtime.js       # scheme(), REPL, エクスポート
├── dist/                # ビルド成果物 (scripts/build.js)
│   ├── schemInp.js      # ブラウザ / Node 用バンドル
│   └── r7rs_large.js
├── examples/            # サンプル .scm
├── test/
│   ├── r5rs/            # R5RS / R7RS 準拠テスト
│   ├── js-interop/      # JS 連携テスト
│   └── debugger/        # デバッガテスト
├── debug.html           # ステップ実行 UI
├── demo.html / repl.html
├── scripts/
│   ├── build.js         # src → dist 結合
│   └── extract.js       # 旧単一ファイルからの分割 (参考用)
└── docs/                # ドキュメント
```

---

## ビルド

```bash
node scripts/build.js
# または
npm run build
```

`src/*.js` を定義順に連結し `dist/schemInp.js` を生成します。
各モジュールは同一の `var` スコープで結合されるため、レガシーなグローバル変数スタイルを維持しています。

`npm install` 時は `prepare` スクリプトで自動ビルドされます。

---

## モジュール依存 (読み込み順)

```
core → env → continuations → primitives → numbers → io
  → r7rs → evaluator → js_interop → debugger → init → parser → runtime
```

### 各モジュールの役割（概要）

| モジュール | 役割 |
| --- | --- |
| `core.js` | `Pair`, `bounce` / `trampoline`, リスト変換 |
| `env.js` | `Env`, クロージャー, 特殊形式の述語 |
| `continuations.js` | `call/cc`, `dynamic-wind` スタック |
| `evaluator.js` | CPS `seval`, マクロ展開, `s_apply` |
| `js_interop.js` | `js-ref` 等, `JsValue`, CLI 引数上書き |
| `debugger.js` | `seval` / `s_apply` フック, ステップ実行 |
| `runtime.js` | 公開 API, REPL, `module.exports` |

---

## 評価モデル

```
ソース文字列
  → Tokenizer / parse (parser.js)
  → AST (JavaScript 配列)
  → seval (CPS, evaluator.js)
       ↓ Bounce チェーン
  → trampoline (core.js) で反復実行
  → 結果値
```

- **データ**（実行時リスト）は `Pair`、**コード**（AST）は `Array`
- マクロ展開は `eval_application` 内で行い、展開結果を再び `seval` へ
- デバッガは `seval` 入口と `s_apply` でイベントを記録（[USAGE.md §7](USAGE.md#7-ステップ実行デバッガ)）

---

## テスト

```bash
npm test
```

個別実行:

```bash
node scripts/build.js
node test/r5rs/test_r5rs_extra.js
node test/r5rs/test_syntax_rules.js
node test/r5rs/test_r7rs.js
node test/r5rs/test_r7rs_large.js
node test/js-interop/test_js_interop.js
node test/debugger/test_debugger.js
```

---

## デバッガ（実装メモ）

CPS 評価器 `seval` / `s_apply` にフックし、式ごとの **eval / return / apply** イベントを記録します。

- **ライブステップ**: `scheme_debug_start(code)` → `step()` / `continue()` / `stepOver()` / `stepOut()`
- **トレース記録**: `scheme_debug_trace(code)` → `scheme_trace_walker` で再生
- **UI**: `debug.html`

停止時は `resumeState` に `{ exp, env, k }` を保存し、再開時に `seval` を継続します（CPS 継続 `k` を保持する方式）。

操作の詳細・ウォークスルー例は [USAGE.md §7](USAGE.md#7-ステップ実行デバッガ) を参照してください。
