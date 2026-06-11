const S = require('./schemInp.js');
let pass = 0, fail = 0;
function t(label, code, expected) {
	let got;
	try { got = S.repr(S.scheme(code)); } catch (e) { got = 'THROW:' + e; }
	const ok = got === expected;
	if (ok) pass++; else fail++;
	console.log((ok ? 'OK  ' : 'NG  ') + label + ' => ' + got + (ok ? '' : ' (expected ' + expected + ')'));
}

console.log('--- syntax-rules 衛生性 ---');
t('defEnv 自由変数', '(let ((id 1)) (let-syntax ((m (syntax-rules () ((_ e) (list id e))))) (let ((id 2)) (m 3))))', '(1 3)');
t('導入束縛', '(let-syntax ((m (syntax-rules () ((_ e) (let ((x 99)) (list x e)))))) (let ((x 1)) (m 2)))', '(99 2)');

console.log('--- 内部 define ---');
t('lambda 内 define', '((lambda () (define x 10) (define (f y) (+ x y)) (f 5)))', '15');
t('begin 内 define', '(begin (define a 3) (define (sq x) (* x x)) (sq a))', '9');

console.log('--- リーダ #| #; ---');
t('#| block |#', '(+ 1 #|comment|# 2)', '3');
t('#; datum', '(+ 1 #;(+ 100) 2)', '3');

console.log('--- 標準手続き ---');
t('string-ci=?', '(string-ci=? "AbC" "abc")', '#t');
t('vector-copy', '(vector-ref (vector-copy (vector 1 2 3)) 1)', '2');
t('vector-copy!', '(define v (vector 0 0 0)) (vector-copy! v (vector 9 8 7) 0) (vector->list v)', '(9 8 7)');

console.log('--- dynamic-wind + 継続 ---');
t('再入時 before/after', "(define w '()) (define k #f) (dynamic-wind (lambda () (set! w (cons 'b w))) (lambda () (call/cc (lambda (c) (set! k c) 'in))) (lambda () (set! w (cons 'a w)))) (k 'out) w", '(a b a b)');
t('脱出時 after', "(define w '()) (call/cc (lambda (esc) (dynamic-wind (lambda () (set! w (cons 'b w))) (lambda () (esc (call/cc (lambda (c) c)))) (lambda () (set! w (cons 'a w))))) 'ok) w", '(a b)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
