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
| `define-syntax` / `syntax-rules` | `(define-syntax swap! (syntax-rules () ((_ a b) ...)))` |
| `let-syntax` / `letrec-syntax` | `(let-syntax ((m (syntax-rules ...))) ...)` |

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
;; Lisp 風マクロ (define-macro)
(define-macro (when test body)
  (list 'if test body 0))
(when (eq? 1 1) 42) ; => 42

;; パターンマッチに基づくマクロ (define-syntax / syntax-rules)
(define-syntax swap!
  (syntax-rules ()
    ((_ a b) (let ((tmp a)) (set! a b) (set! b tmp)))))
(define x 1) (define y 2)
(swap! x y) (list x y) ; => (2 1)

;; エリプシス (...) で可変長パターン
(define-syntax my-and
  (syntax-rules ()
    ((_) #t)
    ((_ e) e)
    ((_ e1 e2 ...) (if e1 (my-and e2 ...) #f))))
(my-and 1 2 3)   ; => 3

;; リテラル識別子
(define-syntax arrow
  (syntax-rules (=>)
    ((_ a => b) (+ a b))
    ((_ a b)    (* a b))))
(arrow 3 => 4)   ; => 7
```

### 数値タワー

```scheme
(* 1000000000000 1000000000000) ; => 1000000000000000000000000 (多倍長・exact)
(/ 1 3)                         ; => 1/3   (有理数)
(+ 1/3 1/6)                     ; => 1/2
(exact? 3)                      ; => #t
(inexact? 3.0)                  ; => #t
(+ 1 2.0)                       ; => 3.    (inexact が伝播)
(inexact->exact 0.5)            ; => 1/2
(sqrt 16)                       ; => 4     (完全平方数は exact)
(expt 2 -2)                     ; => 1/4
#xff                            ; => 255   (基数接頭辞)
```

### 本物のペア(cons セル)

```scheme
(cons 1 2)            ; => (1 . 2)   (ドット対)
'(1 2 . 3)            ; => (1 2 . 3) (不完全リスト)
(pair? (cons 1 2))    ; => #t
(eq? (cons 1 2) (cons 1 2)) ; => #f  (別インスタンス)

;; 破壊的変更と構造共有
(define p (cons 'x 'y))
(set-cdr! p 'z)
p                     ; => (x . z)

;; 可変長引数(ドット仮引数)
(define (sum . xs) (apply + xs))
(sum 1 2 3 4 5)       ; => 15

;; インターンされたシンボル
(eq? 'foo 'foo)       ; => #t
(symbol? 'foo)        ; => #t
```

### 複素数

```scheme
(* 3+4i 1+2i)              ; => -5+10i
(+ 1+2i 1-2i)             ; => 2        (実数へ正規化)
(/ 1+2i 1+1i)             ; => 3/2+1/2i (exact のまま)
(magnitude 3+4i)          ; => 5.
(real-part 3+4i)          ; => 3
(imag-part 3+4i)          ; => 4
(make-rectangular 3 4)    ; => 3+4i
(sqrt -1)                 ; => i
(expt +i 2)               ; => -1
(exp +i)                  ; => 0.5403+0.8415i  (オイラーの公式)
(sin (make-rectangular 1 2)) ; => 3.1658+1.9596i
(log -1)                  ; => 3.1416i (主値)
```

### 対話 REPL(Node.js)

```bash
node scheme.js/schemInp.js
# または
node -e "require('./scheme.js/schemInp.js').scheme_repl()"
```

```scheme
> (+ 1 2 3)
6
> (eval (read))   ; 次の行の S 式を読み込んで評価
```

パイプからの利用:

```bash
echo "(+ 1 2)" | node -e "var S=require('./scheme.js/schemInp.js'); console.log(S.repr(S.scheme('(eval (read))')))"
; => 3
```

### I/O ポート

```scheme
;; 出力文字列ポート
(call-with-output-string
  (lambda (p) (display "x=" p) (write (+ 20 22) p))) ; => "x=42"

;; 入力文字列ポートと read
(define ip (open-input-string "(+ 1 2 3) hello"))
(eval (read ip))   ; => 6
(read ip)          ; => hello

;; read-char / read-line
(define cp (open-input-string "ab\ncd"))
(read-char cp)     ; => #\a
(read-line cp)     ; => "b"

;; ファイルポート(Node.js のみ)
(call-with-output-file "out.txt" (lambda (p) (display "hello" p)))
(call-with-input-file  "out.txt" (lambda (p) (read-line p)))  ; => "hello"
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

対応済み:

- **マクロ `define-syntax` / `syntax-rules`**(リテラル・エリプシス `...`・入れ子パターン・`let-syntax`/`letrec-syntax` に対応)
- **数値タワー**(`exact` な多倍長整数 / 有理数、`inexact` な浮動小数、**複素数**。`exact?`/`inexact?`/`exact->inexact`/`inexact->exact`、有理数演算、基数接頭辞 `#x`/`#o`/`#b`/`#d`、正確さ接頭辞 `#e`/`#i`、`#e1.5 → 3/2` など)
- **複素数**(`3+4i` / `+i` / `2i` などのリテラル、`make-rectangular`/`make-polar`/`real-part`/`imag-part`/`magnitude`/`angle`、四則演算、`(sqrt -1) → i`、超越関数 `exp`/`log`/`sin`/`cos`/`tan`/`asin`/`acos`/`atan`/`expt` の複素数引数)
- **I/O ポート**(文字列ポート `open-input-string`/`open-output-string`/`get-output-string`、`read`/`read-char`/`peek-char`/`read-line`、`call-with-output-string`/`with-output-to-string`、`display`/`write`/`newline` 等のポート引数。ファイルポート `open-input-file`/`open-output-file`/`call-with-input-file`/`call-with-output-file`/`with-output-to-file`/`with-input-from-file` は **Node.js のみ**)
- **対話的 stdin(Node.js)**。既定の入力ポートが標準入力に接続され、`(read)` / `(read-line)` / `(eval (read))` が利用可能。`node schemInp.js` または `scheme_repl()` で REPL 起動
- **本物のペア(cons セル)**。実行時のリストデータは本物の `Pair`(cons セル)で表現し、空リストは `'()`(= `null`)。ドット対 `(a . b)` / 不完全リスト `(a b . c)` の読み取り・表示、`set-car!`/`set-cdr!` による破壊的変更と構造共有、`eq?` によるペアの同一性、循環リストに安全な `list?`/表示、可変長引数 `(lambda args ...)` / `(define (f a . rest) ...)` に対応
- **シンボルのインターン化**(`(eq? 'a 'a)` ・ `(symbol? 'a)` が正しく動作)
- **`;` 行コメント**

簡易対応:

- 複素数の `log`/`asin`/`acos`/`atan` は**主値**(principal value)を返します。`(log -1)` は `i*pi` 相当です。
- 対話的 stdin は **Node.js のみ**(ブラウザでは stdin なし = EOF)。TTY では `char-ready?` は常に `#t` になり得ます(ブロック読み取り)。

- `syntax-rules` の健全性(hygiene)は簡易対応です。パターン変数は正しく扱いますが、テンプレートが導入する束縛変数の自動改名(完全な変数捕捉回避)は限定的です。
- 内部の AST(コード)は JavaScript 配列のままで、`quote`/`quasiquote`/`eval` の境界で配列↔ペアを相互変換しています(ユーザが操作するリストデータは常に本物の cons セル)。
- `dynamic-wind` は通常完了時に `after` を実行しますが、継続による脱出/再入をまたぐ場合の `after`/`before` 実行には未対応です。

備考:

- 末尾呼び出しはトランポリン + CPS により実質的にスタック安全(末尾位置の再帰は定数スタック)です。

## ライセンス

MIT License. Copyright (c) 2014 Shuichi Yukimoto.
