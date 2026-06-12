/**
 * SICP (Structure and Interpretation of Computer Programs) 演習カタログ。
 * 各演習はこのインタプリタで動作する自己完結型の Scheme コードです。
 */
window.SICP_EXERCISES = {
	chapters: [
		{
			id: 1,
			title: "第1章 手続きによる抽象化",
			sections: [
				{
					id: "1.1",
					title: "1.1 Scheme の要素",
					exercises: [
						{
							id: "1.1",
							sicp: "演習 1.1",
							title: "式の評価",
							description: "次の式を順に評価し、結果を表示します。",
							code: `(display (+ 5 4 (- 2 (- 11 6))))
(newline)
(display (+ (* 3 (- 4 2)) (- 18 6 3)))
(newline)
(display (+ (* 3 (- 4 2)) (- 18 6 3) 5))
(newline)`
						},
						{
							id: "1.2",
							sicp: "演習 1.2",
							title: "式の翻訳",
							description: "数学の式を Scheme の式として評価します。",
							code: `(display (/ (+ 5 4 2 (- 3 6)) 3.0))
(newline)
(display (+ (* 3 5) (- 10 6)))
(newline)`
						},
						{
							id: "1.3",
							sicp: "演習 1.3",
							title: "手続きの適用",
							description: "define した手続き square を使って sum-of-squares を定義し、呼び出します。",
							code: `(define (square x) (* x x))
(define (sum-of-squares x y)
  (+ (square x) (square y)))
(display (sum-of-squares 3 4))
(newline)`
						},
						{
							id: "1.4",
							sicp: "演習 1.4",
							title: "演算子とオペランドの組み合わせ",
							description: "演算子の位置を変えた式の評価を確認します。",
							code: `(display (+ 2 3 4 5))
(newline)
(display (* 2 3 4 5))
(newline)`
						}
					]
				},
				{
					id: "1.2",
					title: "1.2 手続きとそれらが生み出す抽象",
					exercises: [
						{
							id: "1.7",
							sicp: "演習 1.7",
							title: "ニュートン法による平方根",
							description: "good-enough? と sqrt-iter を使った平方根の計算。",
							code: `(define (square x) (* x x))
(define (average x y) (/ (+ x y) 2))
(define (improve guess x)
  (average guess (/ x guess)))
(define (good-enough? guess x)
  (< (abs (- (square guess) x)) 0.001))
(define (sqrt-iter guess x)
  (if (good-enough? guess x)
      guess
      (sqrt-iter (improve guess x) x)))
(define (sqrt x) (sqrt-iter 1.0 x))
(display (sqrt 2))
(newline)
(display (sqrt 9))
(newline)`
						},
						{
							id: "1.8",
							sicp: "演習 1.8",
							title: "ニュートン法による立方根",
							description: "平方根の手続きを立方根に拡張します。",
							code: `(define (square x) (* x x))
(define (cube x) (* x x x))
(define (improve-cube guess x)
  (/ (+ (* 2 guess) (/ x (square guess))) 3))
(define (good-enough-cube? guess x)
  (< (abs (- (cube guess) x)) 0.001))
(define (cube-root-iter guess x)
  (if (good-enough-cube? guess x)
      guess
      (cube-root-iter (improve-cube guess x) x)))
(define (cube-root x) (cube-root-iter 1.0 x))
(display (cube-root 27))
(newline)
(display (cube-root 8))
(newline)`
						},
						{
							id: "1.21",
							sicp: "演習 1.21",
							title: "gcd と互いに素",
							description: "ユークリッドの互除法で最大公約数を求めます。",
							code: `(define (gcd a b)
  (if (= b 0)
      a
      (gcd b (remainder a b))))
(display (gcd 206 40))
(newline)
(display (gcd 1071 462))
(newline)`
						},
						{
							id: "1.22",
							sicp: "演習 1.22",
							title: "フィボナッチ数",
							description: "再帰的フィボナッチ手続きで数列を表示します。",
							code: `(define (fib n)
  (cond ((= n 0) 0)
        ((= n 1) 1)
        (else (+ (fib (- n 1)) (fib (- n 2))))))
(do ((i 0 (+ i 1)))
    ((> i 10))
  (display (fib i))
  (display " "))
(newline)`
						},
						{
							id: "1.31",
							sicp: "演習 1.31",
							title: "高階手続き sum",
							description: "term と next を引数に取る一般化された sum を定義します。",
							code: `(define (sum term a next b)
  (if (> a b)
      0
      (+ (term a)
         (sum term (next a) next b))))
(define (inc n) (+ n 1))
(define (cube x) (* x x x))
(define (sum-cubes a b)
  (sum cube a inc b))
(display (sum-cubes 1 10))
(newline)`
						},
						{
							id: "1.32",
							sicp: "演習 1.32",
							title: "accumulate",
							description: "filter / map / accumulate パターンの accumulate を実装します。",
							code: `(define (accumulate combiner null-value term a next b)
  (if (> a b)
      null-value
      (combiner (term a)
                (accumulate combiner null-value term (next a) next b))))
(define (inc n) (+ n 1))
(define (sum-squares a b)
  (accumulate + 0 (lambda (x) (* x x)) a inc b))
(display (sum-squares 1 5))
(newline)`
						},
						{
							id: "1.41",
							sicp: "演習 1.41",
							title: "二重適用",
							description: "手続きを二重に適用する式の評価を確認します。",
							code: `(define (double f)
  (lambda (x) (f (f x))))
(define (inc x) (+ x 1))
(display ((double inc) 5))
(newline)
(define (square x) (* x x))
(display ((double square) 3))
(newline)`
						},
						{
							id: "1.42",
							sicp: "演習 1.42",
							title: "compose",
							description: "二つの手続きを合成する compose を定義します。",
							code: `(define (compose f g)
  (lambda (x) (f (g x))))
(define (inc x) (+ x 1))
(define (square x) (* x x))
(define inc-then-square (compose square inc))
(display (inc-then-square 6))
(newline)`
						},
						{
							id: "1.43",
							sicp: "演習 1.43",
							title: "repeated",
							description: "手続きを n 回繰り返し適用する repeated を定義します。",
							code: `(define (repeated f n)
  (if (= n 1)
      f
      (compose f (repeated f (- n 1)))))
(define (compose f g)
  (lambda (x) (f (g x))))
(define (inc x) (+ x 1))
(define (double x) (* 2 x))
(display ((repeated inc 3) 5))
(newline)
(display ((repeated double 2) 3))
(newline)`
						}
					]
				}
			]
		},
		{
			id: 2,
			title: "第2章 データによる抽象化",
			sections: [
				{
					id: "2.1",
					title: "2.1 データ抽象化入門",
					exercises: [
						{
							id: "2.1",
							sicp: "演習 2.1",
							title: "有理数の加算",
							description: "make-rat / numer / denom を使った有理数の足し算。",
							code: `(define (make-rat n d) (cons n d))
(define (numer x) (car x))
(define (denom x) (cdr x))
(define (print-rat x)
  (display (numer x))
  (display "/")
  (display (denom x)))
(define (add-rat x y)
  (make-rat (+ (* (numer x) (denom y))
               (* (numer y) (denom x)))
            (* (denom x) (denom y))))
(print-rat (add-rat (make-rat 1 2) (make-rat 1 3)))
(newline)`
						},
						{
							id: "2.2",
							sicp: "演習 2.2",
							title: "線分の中点",
							description: "make-segment と midpoint を定義して中点座標を求めます。",
							code: `(define (make-point x y) (cons x y))
(define (x-point p) (car p))
(define (y-point p) (cdr p))
(define (make-segment p1 p2) (cons p1 p2))
(define (start-segment s) (car s))
(define (end-segment s) (cdr s))
(define (midpoint s)
  (make-point (/ (+ (x-point (start-segment s))
                    (x-point (end-segment s)))
                 2)
              (/ (+ (y-point (start-segment s))
                    (y-point (end-segment s)))
                 2)))
(define seg (make-segment (make-point 0 0) (make-point 4 6)))
(write (midpoint seg))
(newline)`
						},
						{
							id: "2.4",
							sicp: "演習 2.4",
							title: "教会数",
							description: "zero / add-1 / church->int で教会数を整数に変換します。",
							code: `(define zero (lambda (f) (lambda (x) x)))
(define (add-1 n)
  (lambda (f) (lambda (x) (f ((n f) x)))))
(define (church->int n) ((n (lambda (x) (+ x 1))) 0))
(display (church->int zero))
(newline)
(display (church->int (add-1 (add-1 zero))))
(newline)`
						}
					]
				},
				{
					id: "2.2",
					title: "2.2 階層データと閉包",
					exercises: [
						{
							id: "2.5",
							sicp: "演習 2.5",
							title: "リストの深い反転",
							description: "入れ子のリストを再帰的に反転する deep-reverse を実装します。",
							code: `(define (deep-reverse items)
  (if (null? items)
      '()
      (append (deep-reverse (cdr items))
              (list (if (pair? (car items))
                        (deep-reverse (car items))
                        (car items))))))
(write (deep-reverse (list 1 (list 2 3) 4 (list 5 6))))
(newline)`
						},
						{
							id: "2.17",
							sicp: "演習 2.17",
							title: "リストの最後の要素",
							description: "末尾ドット対を除く last-pair を定義します。",
							code: `(define (last-pair x)
  (if (null? (cdr x))
      x
      (last-pair (cdr x))))
(write (last-pair (list 1 2 3 4 5)))
(newline)`
						},
						{
							id: "2.18",
							sicp: "演習 2.18",
							title: "リストの反転",
							description: "reverse を定義してリストを反転します。",
							code: `(define (reverse items)
  (if (null? items)
      '()
      (append (reverse (cdr items)) (list (car items)))))
(write (reverse (list 1 2 3 4)))
(newline)`
						},
						{
							id: "2.34",
							sicp: "演習 2.34",
							title: "memq による探索",
							description: "リストにシンボルが含まれるか memq で調べます。",
							code: `(define (memq item x)
  (cond ((null? x) #f)
        ((eq? item (car x)) x)
        (else (memq item (cdr x)))))
(define vars '(x y z))
(display (memq 'x vars))
(newline)
(display (memq 'w vars))
(newline)`
						},
						{
							id: "2.40",
							sicp: "演習 2.40",
							title: "unique-pairs",
							description: "リストから重複のないペアのリストを生成します。",
							code: `(define (unique-pairs items)
  (if (null? items)
      '()
      (append (map (lambda (x) (list (car items) x))
                   (cdr items))
              (unique-pairs (cdr items)))))
(write (unique-pairs (list 1 2 3)))
(newline)`
						}
					]
				}
			]
		},
		{
			id: 3,
			title: "第3章 変異可能データとオブジェクト",
			sections: [
				{
					id: "3.1",
					title: "3.1 代入と局所状態",
					exercises: [
						{
							id: "3.1",
							sicp: "演習 3.1",
							title: "口座の残高",
							description: "set! を使った make-account 手続きの動作確認。",
							code: `(define (make-account balance)
  (define (withdraw amount)
    (set! balance (- balance amount))
    balance)
  (define (deposit amount)
    (set! balance (+ balance amount))
    balance)
  (lambda (m)
    (cond ((eq? m 'withdraw) withdraw)
          ((eq? m 'deposit) deposit)
          (else (error "unknown request")))))
(define acc (make-account 100))
(display ((acc 'withdraw) 25))
(newline)
(display ((acc 'deposit) 50))
(newline)`
						},
						{
							id: "3.2",
							sicp: "演習 3.2",
							title: "フィボナッチの反復計算",
							description: "反復プロセスでフィボナッチ数を効率的に求めます（第3章のプロセスモデル）。",
							code: `(define (fib-iter a b count)
  (if (= count 0)
      a
      (fib-iter b (+ a b) (- count 1))))
(define (fib n) (fib-iter 0 1 n))
(display (fib 40))
(newline)`
						},
						{
							id: "3.3",
							sicp: "演習 3.3",
							title: "デジタル回路シミュレーション",
							description: "wire と inverter で信号を反転して伝播します。",
							code: `(define (make-wire)
  (let ((signal 0)
        (actions '()))
    (define (set-signal! new-value)
      (if (not (= signal new-value))
          (begin (set! signal new-value)
                 (for-each (lambda (a) (a)) actions))))
    (define (add-action! proc)
      (set! actions (cons proc actions)))
    (lambda (m)
      (cond ((eq? m 'get-signal) signal)
            ((eq? m 'set-signal!) set-signal!)
            ((eq? m 'add-action!) add-action!)
            (else (error "unknown operation"))))))
(define (inverter input output)
  ((input 'add-action!)
   (lambda ()
     ((output 'set-signal!) (if (= (input 'get-signal) 0) 1 0)))))
(define input (make-wire))
(define output (make-wire))
(inverter input output)
((input 'set-signal!) 1)
(display (output 'get-signal))
(newline)
((input 'set-signal!) 0)
(display (output 'get-signal))
(newline)`
						}
					]
				},
				{
					id: "3.2",
					title: "3.2 環境モデル",
					exercises: [
						{
							id: "3.11",
							sicp: "演習 3.11",
							title: "環境のフレーム数",
							description: "再帰手続きと反復手続きの環境構造を比較するための定義。",
							code: `(define (factorial n)
  (if (= n 1)
      1
      (* n (factorial (- n 1)))))
(define (fact-iter product counter max)
  (if (> counter max)
      product
      (fact-iter (* counter product)
                 (+ counter 1)
                 max)))
(define (factorial-iter n)
  (fact-iter 1 1 n))
(display (factorial 6))
(newline)
(display (factorial-iter 6))
(newline)`
						},
						{
							id: "3.12",
							sicp: "演習 3.12",
							title: "append 反復版",
							description: "append を反復プロセスで実装します。",
							code: `(define (append x y)
  (if (null? x)
      y
      (cons (car x) (append (cdr x) y))))
(define (append! x y)
  (set-cdr! (last-pair x) y)
  x)
(define (last-pair x)
  (if (null? (cdr x)) x (last-pair (cdr x))))
(define a (list 1 2 3))
(define b (list 4 5))
(write (append a b))
(newline)
(set! a (list 1 2 3))
(set! b (list 4 5))
(write (append! a b))
(newline)`
						}
					]
				},
				{
					id: "3.3",
					title: "3.3 制御構造",
					exercises: [
						{
							id: "3.5",
							sicp: "演習 3.5",
							title: "newton 法 (再掲)",
							description: "第1章の平方根を制御構造の文脈で再実行します。",
							code: `(define (sqrt-iter guess x)
  (if (good-enough? guess x)
      guess
      (sqrt-iter (improve guess x) x)))
(define (improve guess x)
  (/ (+ guess (/ x guess)) 2))
(define (good-enough? guess x)
  (< (abs (- (* guess guess) x)) 0.001))
(define (sqrt x) (sqrt-iter 1.0 x))
(display (sqrt 2))
(newline)`
						},
						{
							id: "3.16",
							sicp: "演習 3.16",
							title: "巡回リストの検出",
							description: "memq を使ってリストに要素が含まれるか調べます。",
							code: `(define (memq item x)
  (cond ((null? x) #f)
        ((eq? item (car x)) x)
        (else (memq item (cdr x)))))
(display (memq 'apple '(pear banana apple)))
(newline)
(display (memq 'pear '(pear banana apple)))
(newline)
(display (memq 'grape '(pear banana apple)))
(newline)`
						}
					]
				}
			]
		},
		{
			id: 4,
			title: "第4章 メタ言語的抽象",
			sections: [
				{
					id: "4.1",
					title: "4.1 メタ循環評価器",
					exercises: [
						{
							id: "4.1",
							sicp: "演習 4.1",
							title: "eval の動作確認",
							description: "組み込み eval で S 式を評価します。",
							code: `(display (eval '(+ 1 2 3) (interaction-environment)))
(newline)
(display (eval '(define x 10) (interaction-environment)))
(display (eval 'x (interaction-environment)))
(newline)`
						},
						{
							id: "4.4",
							sicp: "演習 4.4",
							title: "quoted データ",
							description: "quote と quasiquote の違いを確認します。",
							code: "(write '(a b c))\n(newline)\n(write `(a b ,(+ 1 2)))\n(newline)\n(define x 5)\n(write `(the answer is ,x))\n(newline)"
						}
					]
				}
			]
		},
		{
			id: 5,
			title: "第5章 計算機による抽象",
			sections: [
				{
					id: "5.2",
					title: "5.2 レジスタ計算機",
					exercises: [
						{
							id: "5.2",
							sicp: "演習 5.2",
							title: "階乗の反復計算",
							description: "反復プロセスで階乗を計算し、レジスタ機械の考え方に対応します。",
							code: `(define (factorial-iter n)
  (define (iter product counter)
    (if (> counter n)
        product
        (iter (* counter product) (+ counter 1))))
  (iter 1 1))
(display (factorial-iter 10))
(newline)
(display (factorial-iter 20))
(newline)`
						},
						{
							id: "5.7",
							sicp: "演習 5.7",
							title: "フィボナッチの反復",
							description: "反復プロセスによるフィボナッチ数の計算。",
							code: `(define (fib-iter a b count)
  (if (= count 0)
      a
      (fib-iter b (+ a b) (- count 1))))
(define (fib n) (fib-iter 0 1 n))
(do ((i 0 (+ i 1)))
    ((> i 15))
  (display (fib i))
  (display " "))
(newline)`
						}
					]
				}
			]
		}
	]
};
