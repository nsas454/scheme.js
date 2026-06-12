# scheme.js アーキテクチャ

## ディレクトリ構成

```
scheme.js/
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
│   ├── init.js          # グローバル初期化
│   ├── parser.js        # Tokenizer, parse
│   └── runtime.js       # scheme(), REPL, エクスポート
├── dist/                # ビルド成果物 (scripts/build.js)
│   ├── schemInp.js      # ブラウザ / Node 用バンドル
│   └── r7rs_large.js
├── test/
│   ├── r5rs/            # R5RS / R7RS 準拠テスト
│   ├── sicp/            # SICP 演習 (予定)
│   └── js-interop/      # JS 連携テスト (予定)
├── scripts/
│   ├── build.js         # src → dist 結合
│   └── extract.js       # 旧単一ファイルからの分割 (参考用)
├── docs/                # ドキュメント
├── demo.html
└── repl.html
```

## ビルド

```bash
node scripts/build.js
```

`src/*.js` を定義順に連結し `dist/schemInp.js` を生成します。
各モジュールは同一の `var` スコープで結合されるため、レガシーなグローバル変数スタイルを維持しています。

## モジュール依存 (読み込み順)

```
core → env → continuations → primitives → numbers → io
  → r7rs → evaluator → init → parser → runtime
```

## テスト

```bash
node scripts/build.js
node test/r5rs/test_r5rs_extra.js
node test/r5rs/test_r7rs.js
node test/r5rs/test_r7rs_large.js
```
