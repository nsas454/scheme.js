const S = require('../../dist/schemInp.js');
let pass = 0, fail = 0;
function t(label, code, expected) {
	let got;
	try { got = S.repr(S.scheme(code)); } catch (e) { got = 'THROW:' + e; }
	const ok = got === expected;
	if (ok) pass++; else fail++;
	console.log((ok ? 'OK  ' : 'NG  ') + label + ' => ' + got + (ok ? '' : ' (expected ' + expected + ')'));
}

console.log('--- syntax-rules 基本 ---');
t('swap!', '(begin (define x 1) (define y 2) (define-syntax swap! (syntax-rules () ((_ a b) (let ((tmp a)) (set! a b) (set! b tmp))))) (swap! x y) (list x y))', '(2 1)');
t('my-and 再帰+エリプシス', '(define-syntax my-and (syntax-rules () ((_ e) e) ((_ e1 e2 ...) (if e1 (my-and e2 ...) #f)))) (my-and 1 2 3)', '3');
t('my-and 短絡', '(define-syntax my-and (syntax-rules () ((_ e) e) ((_ e1 e2 ...) (if e1 (my-and e2 ...) #f)))) (my-and #f 1 (error "skip"))', '#f');
t('arrow リテラル', '(define-syntax arrow (syntax-rules (=>) ((_ x => y) (list x y)))) (arrow 7 => 12)', '(7 12)');

console.log('--- syntax-rules ドット対 ---');
t('不完全リスト', '(define-syntax m (syntax-rules () ((_ (a . b)) (list a b)))) (m (1 . 2))', '(1 2)');
t('完全リスト', '(define-syntax m (syntax-rules () ((_ (a . b)) (list a b)))) (m (1 2 3))', '(1 (2 3))');

console.log('--- syntax-rules 衛生性 ---');
t('defEnv 自由変数', '(let ((id 1)) (let-syntax ((m (syntax-rules () ((_ e) (list id e))))) (let ((id 2)) (m 3))))', '(1 3)');
t('導入束縛', '(let-syntax ((m (syntax-rules () ((_ e) (let ((x 99)) (list x e)))))) (let ((x 1)) (m 2)))', '(99 2)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
