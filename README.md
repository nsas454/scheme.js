# scheme.js

JavaScript で実装した Scheme インタプリタです。

基本的な構文に加えて、**クロージャー**・**マクロ(`define-macro`)**・**継続(`call/cc`)** に対応しています。継続は CPS(継続渡しスタイル)+ トランポリンで実装しており、捕捉した継続を変数に保存して後から何度でも呼び出せる「完全な(ファーストクラスの)継続」です。

## 特長

- 字句スコープに基づく真のクロージャー
- `define-macro` による Lisp 風マクロ(引数は未評価の S 式として渡る)
- `call/cc` / `call-with-current-continuation` によるファーストクラスの継続(再入可能・再利用可能)
- トランポリン駆動によりスタックを消費しないため、深い再帰でもオーバーフローしにくい
- ブラウザでもサーバ(Node.js)でも動作

## 使い方

### 1. ブラウザ: `<script type="text/scheme">` で実行する

`schemInp.js` を読み込むと、ページ内の `<script type="text/scheme">` ブロックがページ読み込み完了時に上から順に自動実行されます。

```html
<!-- インタプリタ本体を読み込む -->
<script src="scheme.js/schemInp.js"></script>

<!-- (任意) display の出力先。id="scheme-output" の要素があればそこにも出力される -->
<pre id="scheme-output"></pre>

<!-- Scheme コードを直接書く -->
<script type="text/scheme">
  (display (+ 1 2 3))
  (define (make-adder n) (lambda (x) (+ x n)))
  (display ((make-adder 5) 10))
</script>

<!-- 外部ファイルを読み込んで実行する -->
<script type="text/scheme" src="hello.scm"></script>
```

`type` は `text/scheme` のほか `text/x-scheme` / `application/scheme` / `text/lisp` も使えます。

> 注意: `src` での外部ファイル読み込みは同期 XHR を使うため、`file://` で直接開くとブラウザの CORS 制約で読めないことがあります。その場合はインライン記述を使うか、簡易 HTTP サーバ(例: `python3 -m http.server`)経由で開いてください。インラインの `<script type="text/scheme">` はサーバなしでも動作します。

動作確認用の `scheme.js/demo.html` を用意しています。ブラウザで開くと実行結果が表示されます。

### 2. ブラウザ: JavaScript の関数として実行する

`schemInp.js` を読み込むと、グローバルに `scheme()` 関数が定義されます。文字列で渡したコードを評価し、最後の式の結果を返します。

```html
<script src="scheme.js/schemInp.js"></script>
<script>
  var result = scheme("(+ 1 2 3)"); // => 6
  console.log(result);
</script>
```

### 3. Node.js から使う

```js
const { scheme } = require('./scheme.js/schemInp.js');

console.log(scheme('(+ 1 2 3)'));                  // 6
console.log(scheme('(define (f x) (* x x)) (f 9)'));// 81
```

## 対応している構文・機能

### 特殊形式

| 構文 | 例 |
| --- | --- |
| `define` | `(define x 10)` / `(define (f a b) (+ a b))` |
| `lambda` | `(lambda (x) (* x x))` |
| `set!` | `(set! x 20)` |
| `if` | `(if (< a b) a b)` |
| `cond` | `(cond ((eq? a 1) 'one) (else 'other))` |
| `case` | `(case x ((1 2) 'low) (else 'other))` |
| `and` | `(and (< 0 x) (< x 10))`(短絡評価) |
| `or` | `(or (eq? x 0) (eq? x 1))`(短絡評価) |
| `let` | `(let ((a 1) (b 2)) (+ a b))` |
| 名前付き `let` | `(let loop ((i 0)) (if (= i 5) i (loop (+ i 1))))`(ループ) |
| `let*` | `(let* ((a 1) (b (+ a 1))) (+ a b))`(逐次束縛) |
| `letrec` | `(letrec ((f (lambda (n) ... (g ...))) (g ...)) (f 10))`(相互再帰) |
| `do` | `(do ((i 0 (+ i 1)) (s 0 (+ s i))) ((= i 5) s))`(反復) |
| `begin` | `(begin (display 1) (display 2))` |
| `quote` | `(quote (1 2 3))` / `'(1 2 3)` |
| `quasiquote` | `` `(x ,a ,@lst) `` / `(quasiquote ...)`(準クオート) |
| `delay` | `(delay (+ 1 2))`(遅延評価。`force` で実体化) |
| `define-macro` | `(define-macro (when t body) (list 'if t body 0))` |

### 主な組み込み手続き

R5RS の標準手続きを幅広くサポートしています。

- 算術: `+` `-` `*` `/` `abs` `min` `max` `quotient` `remainder` `modulo` `gcd` `lcm` `floor` `ceiling` `round` `truncate` `sqrt` `expt` `exp` `log` `sin` `cos` `tan` `asin` `acos` `atan`
- 数値述語/変換: `number?` `integer?` `real?` `zero?` `positive?` `negative?` `odd?` `even?` `exact?` `inexact?` `number->string` `string->number` `exact->inexact` ほか
- 比較: `=` `<` `>` `<=` `>=`
- 等価性: `eq?` `eqv?` `equal?`
- リスト: `car` `cdr` `cons` `list` `append` `length` `reverse` `list-ref` `list-tail` `member`/`memq`/`memv` `assoc`/`assq`/`assv` `caar`〜`cadddr` `set-car!` `set-cdr!` `null?` `pair?` `list?`
- 高階: `map` `for-each` `apply`
- 述語: `boolean?` `symbol?` `string?` `char?` `vector?` `procedure?` `not`
- 文字: `char->integer` `integer->char` `char=?` `char<?` … `char-upcase` `char-downcase` `char-alphabetic?` `char-numeric?` `char-whitespace?`
- 文字列: `string?` `string-length` `string-ref` `substring` `string-append` `string->list` `list->string` `string->symbol` `symbol->string` `string=?` `string<?` … `make-string` `string`
- ベクタ: `vector` `make-vector` `vector-ref` `vector-set!` `vector-length` `vector->list` `list->vector` `vector-fill!`
- 制御: `call/cc` / `call-with-current-continuation` `values` `call-with-values` `dynamic-wind` `delay`/`force` `eval` `apply`
- 入出力: `display` `write` `newline` `write-char` `write-string`
- その他: `error` `interaction-environment`
- リテラル: 真偽値 `#t` `#f`、文字 `#\a` `#\space` `#\newline` ほか

## 例

### クロージャー

```scheme
(define (make-counter)
  (let ((c 0))
    (lambda () (set! c (+ c 1)) c)))
(define cnt (make-counter))
(cnt) ; => 1
(cnt) ; => 2
```

### 条件分岐 / 束縛

```scheme
(if (< 1 2) 'yes 'no)            ; => yes

(cond ((eq? 1 2) 'a)
      ((eq? 2 2) 'b)
      (else 'c))                 ; => b

(case (+ 2 3)
  ((1 2 3) 'low)
  ((4 5 6) 'mid)
  (else 'hi))                    ; => mid

(and 1 2 3)                      ; => 3   (全て真なら最後の値)
(or (eq? 1 2) 5 6)               ; => 5   (最初の真値)

(let* ((a 1) (b (+ a 1)) (c (+ b 1)))
  (+ a b c))                     ; => 6   (後の束縛が前の束縛を参照)
```

### 反復 / 再帰

```scheme
;; 名前付き let (ループ)
(let loop ((i 1) (acc 0))
  (if (> i 10) acc (loop (+ i 1) (+ acc i)))) ; => 55

;; do ループ
(do ((i 0 (+ i 1)) (s 0 (+ s i)))
    ((= i 5) s))                              ; => 10

;; letrec (相互再帰)
(letrec ((even? (lambda (n) (if (= n 0) #t (odd? (- n 1)))))
         (odd?  (lambda (n) (if (= n 0) #f (even? (- n 1))))))
  (even? 10))                                 ; => #t
```

### 準クオート (quasiquote)

```scheme
(define a 10)
(define lst (list 2 3 4))

`(x ,a y)        ; => (x 10 y)      ,  は unquote (評価して埋め込む)
`(1 ,@lst 5)     ; => (1 2 3 4 5)   ,@ は unquote-splicing (リストを展開)
`(sum ,(+ 1 2))  ; => (sum 3)

;; マクロと組み合わせるとコード生成が簡潔に書ける
(define-macro (swap-add a b) `(+ ,a ,b))
(swap-add 3 4)   ; => 7
```

### マクロ

```scheme
(define-macro (when test body)
  (list 'if test body 0))
(when (eq? 1 1) 42) ; => 42
```

### 継続(call/cc)

```scheme
;; 早期脱出
(call/cc (lambda (k) (+ 1 (k 10)))) ; => 10

;; 継続を保存して後から呼び出す(再入可能)
(define saved 0)
(+ 100 (call/cc (lambda (k) (set! saved k) 1))) ; => 101
(saved 10)                                       ; => 110
```

## R5RS 対応状況

R5RS の機能を段階的に取り込んでいます。多くの標準手続き・特殊形式・データ型(文字・文字列・ベクタ・真偽値)に対応済みですが、以下はまだ未対応/簡易対応です。

未対応・今後対応予定:

- **衛生的マクロ `define-syntax` / `syntax-rules`**(現状は非衛生的な `define-macro` のみ)
- **完全な数値タワー**(有理数・複素数、exact/inexact の厳密な区別)。現状は JavaScript の数値(倍精度浮動小数点)で近似
- **ポートと本格的な I/O**(`read` `open-input-file` など。出力系は `display`/`write`/`newline` のみ)
- **本物のペア(cons セル)とドット対 `(a . b)`**。リストは JavaScript 配列で表現しているため、`set-cdr!` は簡易対応で、シンボルと文字列の内部表現が一部重なります(`symbol?`/`string?` の区別に制限あり)

簡易対応:

- `dynamic-wind` は通常完了時に `after` を実行しますが、継続による脱出/再入をまたぐ場合の `after`/`before` 実行には未対応です。

備考:

- 末尾呼び出しはトランポリン + CPS により実質的にスタック安全(末尾位置の再帰は定数スタック)です。

## ライセンス

MIT License. Copyright (c) 2014 Shuichi Yukimoto.
