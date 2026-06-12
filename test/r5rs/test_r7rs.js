const S = require('../../dist/schemInp.js');
let pass = 0, fail = 0;
function t(label, code, expected) {
	let got;
	try { got = S.repr(S.scheme(code)); } catch (e) { got = 'THROW:' + e; }
	const ok = got === expected;
	if (ok) pass++; else fail++;
	console.log((ok ? 'OK  ' : 'NG  ') + label + ' => ' + got + (ok ? '' : ' (expected ' + expected + ')'));
}

console.log('--- case-lambda ---');
t('0引数', '((case-lambda (() 1) ((x) x)))', '1');
t('1引数', '((case-lambda (() 1) ((x) x)) 42)', '42');

console.log('--- define-values / let-values ---');
t('define-values', '(begin (define-values (a b) (values 3 4)) (+ a b))', '7');
t('let-values', '(let-values (((x y) (values 1 2))) (+ x y))', '3');
t('let*-values', '(let*-values (((a) (values 1)) ((b) (values (+ a 1)))) b)', '2');

console.log('--- cond => ---');
t('=> 節', '(cond (1 => (lambda (x) (* x 2))))', '2');

console.log('--- guard / raise ---');
t('guard 捕捉', "(guard (c (#t 'caught)) (raise 'err))", 'caught');

console.log('--- define-record-type ---');
t('record', "(begin (define-record-type point (make-point x y) point? (x point-x) (y point-y point-y-set!)) (define p (make-point 3 4)) (list (point-x p) (point-y p) (point? p)))", '(3 4 #t)');

console.log('--- hash-table ---');
t('hash ref', "(begin (define ht (make-hash-table)) (hash-table-set! ht 'a 99) (hash-table-ref ht 'a))", '99');

console.log('--- define-library / import ---');
t('custom lib', "(begin (define-library (mylib) (export double) (import (scheme base)) (begin (define (double x) (* x 2)))) (import (mylib)) (double 21))", '42');

console.log('--- cond-expand ---');
t('r7rs feature', '(cond-expand (r7rs 99) (else 0))', '99');

console.log('--- list library ---');
t('filter', "(begin (import (scheme list)) (filter (lambda (x) (> x 2)) (list 1 2 3 4)))", '(3 4)');
t('fold-left', "(begin (import (scheme list)) (fold-left + 0 (list 1 2 3 4)))", '10');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
