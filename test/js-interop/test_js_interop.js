const S = require('../../index.js');
let pass = 0, fail = 0;

function t(label, fn, expected) {
	let got;
	try { got = fn(); } catch (e) { got = 'THROW:' + e; }
	const ok = got === expected || (typeof got === 'number' && typeof expected === 'number' && got === expected)
		|| (String(got) === String(expected));
	if (ok) pass++; else fail++;
	console.log((ok ? 'OK  ' : 'NG  ') + label + ' => ' + got + (ok ? '' : ' (expected ' + expected + ')'));
}

console.log('--- Scheme から JS ---');
t('js-call Math.abs', () => S.scheme('(js-call (js-ref (js-global) "Math") "abs" -3)'), 3);
t('js-invoke parseInt', () => S.scheme('(js-invoke (js-ref (js-global) "parseInt") "42")'), 42);
t('js-set! / js-ref', () => S.scheme('(begin (define o (js-new (js-ref (js-global) "Object"))) (js-set! o "x" 99) (js-ref o "x"))'), 99);
t('js-new Date', () => S.scheme('(js-call (js-new (js-ref (js-global) "Date") 0) "getFullYear")'), new Date(0).getFullYear());
t('js-value?', () => S.repr(S.scheme('(js-value? (js-global))')), '#t');

console.log('--- JavaScript から Scheme ---');
t('Scheme 手続きを JS コールバック', () => {
	S.scheme('(define (add2 x y) (+ x y))');
	const add2 = S.fromScheme(S.scheme('add2'));
	return String(add2(10, 32));
}, '42');

t('toScheme オブジェクト', () => {
	S.setGlobal('hostObj', { n: 7, tag: 'ok' });
	return S.scheme('(js-ref hostObj "n")');
}, 7);

console.log('--- CLI 引数 ---');
t('setCommandLineArguments', () => {
	S.setCommandLineArguments(['prog.scm', 'a', 'b']);
	return S.repr(S.scheme('(import (scheme process-context)) (command-line)'));
}, '(prog.scm a b)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
