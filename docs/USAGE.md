# scheme.js 使い方ガイド

このドキュメントでは、scheme.js / **scheme-js** npm パッケージの具体的な使い方を説明します。アーキテクチャやモジュール構成は [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。

---

## 目次

1. [インストールとビルド](#1-インストールとビルド)
2. [Node.js / npm API](#2-nodejs--npm-api)
3. [CLI（scheme-js コマンド）](#3-clischeme-js-コマンド)
4. [ブラウザでの使い方](#4-ブラウザでの使い方)
5. [REPL](#5-repl)
6. [JavaScript 相互運用](#6-javascript-相互運用)
7. [ステップ実行・デバッガ](#7-ステップ実行デバッガ)
8. [I/O ポート](#8-io-ポート)
9. [R7RS ライブラリ](#9-r7rs-ライブラリ)
10. [よくある質問](#10-よくある質問)

---

## 1. インストールとビルド

### npm からインストール（利用者向け）

```bash
npm install scheme-js
```

グローバル CLI も使う場合:

```bash
npm install -g scheme-js
scheme-js --help
```

### リポジトリを clone して開発する場合

```bash
git clone <repository-url>
cd scheme.js
npm install          # prepare スクリプトで dist/ が自動ビルドされる
npm test             # ビルド + 全テスト
```

手動ビルド:

```bash
node scripts/build.js   # src/ → dist/schemInp.js, dist/r7rs_large.js
```

**編集対象は常に `src/` です。** `dist/` は生成物なので直接編集しないでください。

---

## 2. Node.js / npm API

`require('scheme-js')` で次の関数が使えます。

### 評価系

| 関数 | 説明 |
| --- | --- |
| `scheme(code)` | 文字列を評価。最後の式の値を返す。エラーは **文字列として返る**（例外にならない） |
| `scheme_run(code)` | 同上。`display` 出力は stdout へ。エラー時は **例外を throw** |
| `scheme_run_file(path, opts?)` | `.scm` ファイルを読み込んで評価（Node.js のみ） |
| `scheme_eval(sexp, env?)` | パース済み AST を評価（上級者向け） |
| `repr(value, writeMode?)` | Scheme 値を文字列化（`writeMode` 真で `write` 形式） |

```js
const S = require('scheme-js');

// 基本的な評価
console.log(S.scheme('(+ 1 2 3)'));                    // 6 (exact 整数)
console.log(S.repr(S.scheme('(list 1 2 3)')));         // "(1 2 3)"

// 複数式（define してから使う）
S.scheme('(define (sq x) (* x x))');
console.log(S.scheme('(sq 9)'));                      // 81

// display 付き実行（エラーは throw）
S.scheme_run('(display "hello\\n")');

// ファイル実行
S.scheme_run_file('examples/hello.scm');
```

#### `scheme` と `scheme_run` の使い分け

- **REPL 風・試行錯誤** → `scheme`（エラーが返り値なので握りつぶしにくいデモ向き）
- **スクリプト実行・CLI 相当** → `scheme_run`（I/O が自然、失敗時に例外）
- **組み込みアプリ** → 用途に応じて選択。本番では `scheme_run` + try/catch を推奨

### REPL 系（Node.js）

| 関数 | 説明 |
| --- | --- |
| `scheme_repl(prompt?)` | stdin から `read` しながら対話（`Ctrl-D` で終了） |
| `scheme_repl_eval(code)` | 1 回分の評価。`{ ok, value, output, error }` を返す |
| `scheme_input_complete(code)` | 括弧が閉じた 1 式か判定（複数行入力 UI 用） |
| `scheme_repl_ui(container, opts?)` | ブラウザ用 REPL UI を DOM 要素に組み立て |

```js
// Node REPL
S.scheme_repl('> ');

// 1 式ずつ（ブラウザ / Node 共通）
const res = S.scheme_repl_eval('(+ 1 2)');
// res.ok === true
// res.value === 3
// res.output === ''   // display の出力
// res.error === null
```

### JavaScript 相互運用

| 関数 | 説明 |
| --- | --- |
| `setGlobal(name, jsValue)` | JS オブジェクト等を Scheme グローバルに束縛 |
| `getGlobal(name)` | Scheme グローバルの値を取得 |
| `toScheme(v)` / `jsWrap(v)` | JS 値 → Scheme 値（オブジェクトは `JsValue` ラッパー） |
| `fromScheme(v)` / `jsUnwrap(v)` | Scheme 値 → JS 値（手続きは JS 関数に変換） |
| `setCommandLineArguments(argv)` | CLI 引数を上書き（`command-line` 用） |
| `JsValue` / `isJsValue(x)` | JS 値ラッパー型 |

### デバッガ

| 関数 | 説明 |
| --- | --- |
| `scheme_debug_start(code, opts?)` | ステップ実行セッションを作成 |
| `scheme_debug_trace(code)` | 全評価イベントを同期記録 |
| `scheme_trace_walker(trace)` | トレースを前後に辿る |

---

## 3. CLI（scheme-js コマンド）

### 基本

```bash
scheme-js                     # 対話 REPL
scheme-js program.scm         # ファイル実行
scheme-js program.scm arg1 arg2   # 引数付き実行
scheme-js -e "(+ 1 2)"        # 式を直接評価
scheme-js -e "(display 1)" rest   # -e の後ろも command-line に入る
scheme-js --version
scheme-js --help
```

### スクリプト引数の参照

R7RS の process-context ライブラリを import します。

```scheme
(import (scheme process-context))

(display (command-line))   ; => (program.scm arg1 arg2) など
(newline)
```

CLI 実行前に Node API で上書きする場合:

```js
const S = require('scheme-js');
S.setCommandLineArguments(['my.scm', 'foo', 'bar']);
S.scheme('(import (scheme process-context)) (command-line)');
```

### 終了コード

- 正常終了: `0`
- 評価エラー・ファイル未存在: `1`（stderr に `error: ...`）

### ローカル開発時（npm link 前）

```bash
node bin/scheme-js.js examples/hello.scm
node dist/schemInp.js          # 第1引数を .scm として実行
```

---

## 4. ブラウザでの使い方

### 4.1 スクリプトタグで Scheme を書く

```html
<!-- 任意: R7RS-large 拡張 -->
<script src="dist/r7rs_large.js"></script>
<!-- 本体（必須） -->
<script src="dist/schemInp.js"></script>

<!-- display の出力先（任意） -->
<pre id="scheme-output"></pre>

<script type="text/scheme">
  (display (+ 1 2 3))
</script>
```

対応する `type` 属性:

- `text/scheme`
- `text/x-scheme`
- `application/scheme`
- `text/lisp`

`DOMContentLoaded` 後に `<script type="text/scheme">` が上から順に実行されます。

#### 外部 .scm の読み込み

```html
<script type="text/scheme" src="hello.scm"></script>
```

> **注意:** 同期 XHR を使うため `file://` では CORS エラーになることがあります。HTTP サーバ経由で開くか、インライン記述を使ってください。
>
> ```bash
> python3 -m http.server 8000
> # ブラウザで http://localhost:8000/demo.html
> ```

### 4.2 JavaScript から `scheme()` を呼ぶ

```html
<script src="dist/schemInp.js"></script>
<script>
  var n = scheme("(+ 10 20)");
  console.log(n);   // 30
</script>
```

### 4.3 用意済み HTML

| ファイル | 用途 |
| --- | --- |
| `demo.html` | `<script type="text/scheme">` のデモ |
| `repl.html` | 対話 REPL UI |
| `debug.html` | ステップ実行デバッガ UI |

---

## 5. REPL

### Node.js（ターミナル）

```bash
scheme-js
# または
node -e "require('scheme-js').scheme_repl()"
```

```
scheme.js REPL (Ctrl-D で終了)
> (+ 1 2)
3
> (define (double x) (* x 2))
> (double 21)
42
```

`(eval (read))` で次の行を読み込んで評価することもできます。

### ブラウザ REPL UI

`repl.html` を開くか、自前ページに組み込み:

```html
<div id="repl"></div>
<script src="dist/schemInp.js"></script>
<script>
  scheme_repl_ui(document.getElementById('repl'), {
    prompt: 'scheme> ',
    welcome: true,
    onEval: function (res, code) { console.log('evaluated', res); }
  });
</script>
```

| 操作 | 動作 |
| --- | --- |
| Enter | 実行（括弧未閉なら継続入力） |
| Shift+Enter | 改行 |
| ↑ / ↓ | 履歴 |

`define` や `define-syntax` で導入した束縛は **ページをリロードするまで** 保持されます。

---

## 6. JavaScript 相互運用

### 6.1 Scheme から JavaScript を呼ぶ

組み込み手続き（グローバルに登録済み）:

| 手続き | 例 |
| --- | --- |
| `(js-global)` | ホストの `globalThis` |
| `(js-ref obj "key")` | プロパティ参照 |
| `(js-set! obj "key" val)` | プロパティ代入 |
| `(js-call obj "method" arg ...)` | メソッド呼び出し |
| `(js-invoke fn arg ...)` | 関数呼び出し |
| `(js-new Class arg ...)` | `new Class(...)` |
| `(js-value? x)` | JS ラッパーか判定 |
| `(scheme->js x)` | Scheme 値を JS 側表現に変換してラップ |
| `(js->scheme x)` | （主に JS API 経由） |

#### console.log する

```scheme
(js-call (js-ref (js-global) "console") "log" "Hello from Scheme")
```

#### オブジェクトを作って読み書き

```scheme
(define o (js-new (js-ref (js-global) "Object")))
(js-set! o "name" "scheme-js")
(js-set! o "version" 2)
(js-ref o "name")    ; => "scheme-js"
```

#### 配列・JSON 風データ

```scheme
;; parseInt は js-invoke（第一引数が関数そのもの）
(js-invoke (js-ref (js-global) "parseInt") "42")   ; => 42

;; Math.abs
(js-call (js-ref (js-global) "Math") "abs" -3)   ; => 3
```

### 6.2 JavaScript から Scheme を呼ぶ

#### JS オブジェクトを Scheme に渡す

```js
const S = require('scheme-js');

S.setGlobal('config', { host: 'localhost', port: 8080 });

S.scheme(`
  (display (js-ref config "host"))
  (newline)
  (+ (js-ref config "port") 92)
`);   // => 8900
```

#### Scheme 手続きを JS コールバックにする

```js
S.scheme('(define (add a b) (+ a b))');
const add = S.fromScheme(S.getGlobal('add'));
console.log(add(10, 32));   // 42
```

`fromScheme` は Scheme の compound / primitive 手続きを JS 関数にラップします。Scheme 側から見える JS 関数を渡す場合は `toScheme` を使います。

#### 値の型対応（概要）

| JS | Scheme |
| --- | --- |
| `null` / `undefined` | `()` |
| `boolean` / `number` / `string` | そのまま |
| 配列 | リスト（`Pair` 連鎖） |
| オブジェクト / 関数 | `JsValue` ラッパー |
| Scheme 手続き | JS function（`fromScheme` 後） |

---

## 7. ステップ実行・デバッガ

学習者が **「次にどの式が評価されるか」** を追うための機能です。CPS 評価器 `seval` / `s_apply` にフックし、イベントを記録します。

### 7.1 ブラウザ UI（debug.html）

1. リポジトリルートで HTTP サーバを起動（`file://` 非推奨）
2. `debug.html` を開く
3. 左ペインに Scheme コード、右ペインに評価状態が表示される

| ボタン / キー | 動作 |
| --- | --- |
| 開始 / リセット | デバッグセッションを最初から |
| ステップ (F10) | 次の `eval` イベント手前で停止 |
| ステップオーバー | 現在の深さを抜けるまで実行 |
| ステップアウト | 呼び出し元の深さまで実行 |
| 続行 (F5) | 最後まで実行 |
| 全トレース記録 | 停止せず全イベント記録 → ← → で再生 |

右ペインの **環境 (束縛)** には、その時点のローカルフレーム（最大 8 段）が表示されます。グローバルに近いフレームほど下に表示されます。

### 7.2 ライブステップ（JavaScript API）

```js
const S = require('scheme-js');

const sess = S.scheme_debug_start('(+ 1 2)');
sess.start();

console.log(sess.status);          // 'paused'
console.log(sess.currentEvent);
// {
//   phase: 'eval',
//   type: 'application',
//   source: '(+ 1 2)',
//   depth: 1,
//   env: [ { '+': '#<procedure>', ... } ]
// }

sess.step();       // 1 ステップ（次の eval で停止）
sess.continue();   // 最後まで

console.log(sess.status);          // 'done'
console.log(sess.result);          // 3
```

#### セッションメソッド

| メソッド | 説明 |
| --- | --- |
| `start()` | 評価開始。最初の式の手前で `paused` |
| `step()` | ステップイン（次の eval で停止） |
| `stepOver()` | ステップオーバー |
| `stepOut()` | ステップアウト |
| `continue()` | 続行（`mode: 'run'` まで） |
| `getState()` | `{ status, mode, depth, eventCount, current, result, error }` |
| `getEvents()` | これまでの全イベント配列 |

`options.mode` 初期値: `'step-in'`（省略時）

### 7.3 トレース記録と再生

停止せず **全イベントを記録** し、後から再生する方式です。

```js
const trace = S.scheme_debug_trace('(define x 5) (+ x 1)');
// trace.status === 'done'
// trace.result === 6
// trace.events === [ ... ]

const w = S.scheme_trace_walker(trace);
w.current();   // 最初のイベント
w.next();      // 次へ
w.prev();      // 前へ
w.go(10);      // 10 番目のイベントへ
```

### 7.4 イベントの種類

| phase | いつ | 主なフィールド |
| --- | --- | --- |
| `eval` | 式の評価 **開始前** | `source`, `type`, `depth`, `env` |
| `apply` | 手続き適用時 | `procedure`, `arguments`, `depth` |
| `return` | 式の評価 **完了後** | `source`, `value`, `depth` |

`type` には `application`, `variable`, `if`, `lambda`, `define`, `literal` などが入ります。

### 7.5 学習用ウォークスルー例

コード:

```scheme
(define x 10)
(+ x 1)
```

典型的なイベント列（抜粋）:

```
eval   define  ("define" x 10)
eval   10      (リテラル)
return 10
return (define x 10)  => x
eval   application   (+ x 1)
eval   variable      x          ← env に x=10 が見える
return x               => 10
eval   1
return 1
apply  +               (+ 10 1)
return (+ x 1)         => 11
```

再帰の例（factorial）:

```scheme
(define (fact n)
  (if (< n 2) 1 (* n (fact (- n 1)))))
(fact 3)
```

ステップ実行すると、`if` の条件評価 → 再帰呼び出し → 基底ケース → 乗算、という順序を追えます。`debug.html` にサンプルが入っています。

---

## 8. I/O ポート

### 文字列ポート

```scheme
;; 出力を文字列として取得
(call-with-output-string
  (lambda (p)
    (display "x=" p)
    (write 42 p)))           ; => "x=42"

;; 文字列から read
(define ip (open-input-string "(+ 1 2 3)"))
(eval (read ip))             ; => 6
```

### Node.js ファイル I/O

```scheme
(call-with-output-file "out.txt"
  (lambda (p) (display "hello" p)))

(call-with-input-file "out.txt"
  (lambda (p) (read-line p)))   ; => "hello"
```

`load` は Node.js 環境でのみ利用可能です。

### REPL / display の出力先

- Node.js: `process.stdout`
- ブラウザ: `console` + `#scheme-output` 要素（あれば）

---

## 9. R7RS ライブラリ

`define-library` / `import` / `export` に対応しています。

```scheme
(define-library (example)
  (export greet)
  (import (scheme base))
  (begin
    (define (greet) "hello")))

(import (example))
(greet)   ; => "hello"
```

よく使う標準ライブラリ:

```scheme
(import (scheme base))
(import (scheme list))           ; filter, fold-left, ...
(import (scheme process-context)) ; command-line, exit, ...
(import (scheme read))            ; read, read-char, ...
(import (scheme write))           ; write, display, ...
(import (scheme file))            ; open-input-file, ... (Node)
(import (scheme hash-table))
(import (scheme case-lambda))
```

R7RS-large（Unicode, bytevector, sort 等）は `dist/r7rs_large.js` を先に読み込むと追加ライブラリが使えます。

---

## 10. よくある質問

### Q. `scheme()` の結果が `[object Object]` / Rational のように見える

exact 整数は内部的に有理数 `Rational` として保持されることがあります。表示には `repr()` を使うか、数値として使う場合は JavaScript 側で変換してください。デバッガの `result` は小さな整数なら自動的に number に正規化されます。

### Q. ブラウザで外部 .scm が読めない

`file://` プロトコルでは同期 XHR がブロックされます。ローカルサーバを使うか、コードをインラインで書いてください。

### Q. デバッガの環境にプリミティブだらけで自分の変数が見えない

`env[0]` がいちばん内側（現在のフレーム）です。束縛が無い式（トップレベルの算術など）ではグローバルフレームのみが表示されます。`(define x 10)` のあと `(+ x 1)` の **`x` 評価** ステップで `x: "10"` を確認できます。

### Q. npm publish 前にローカルで CLI を試す

```bash
npm link
scheme-js examples/hello.scm
```

### Q. テストだけ実行したい

```bash
npm test
# 個別
node test/debugger/test_debugger.js
node test/js-interop/test_js_interop.js
```

---

## 関連ドキュメント

- [ARCHITECTURE.md](ARCHITECTURE.md) — ディレクトリ構成・モジュール依存・ビルド
- [../README.md](../README.md) — 対応構文一覧・コード例・R5RS/R7RS 対応状況
