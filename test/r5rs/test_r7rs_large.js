const S = require('../../dist/schemInp.js');
let pass = 0, fail = 0;
function t(label, code, expected) {
	let got;
	try { got = S.repr(S.scheme(code)); } catch (e) { got = 'THROW:' + e; }
	const ok = got === expected;
	if (ok) pass++; else fail++;
	console.log((ok ? 'OK  ' : 'NG  ') + label + ' => ' + got + (ok ? '' : ' (expected ' + expected + ')'));
}

console.log('--- unicode ---');
t('NFC', '(string=? (string-normalize-nfc "café") "café")', '#t');
t('foldcase', '(string-foldcase "AbC")', 'abc');

console.log('--- bytevector ---');
t('make/ref', '(bytevector-u8-ref (make-bytevector 3 7) 1)', '7');
t('utf8', '(utf8->string (string->utf8 "hello"))', 'hello');

console.log('--- string ---');
t('string-map', '(string-map char-upcase "abc")', 'ABC');
t('string-index', '(string-index "hello" #\\l)', '2');

console.log('--- vector ---');
t('vector-map', '(vector-ref (vector-map (lambda (x) (* x 2)) (vector 1 2 3)) 1)', '4');
t('vector-append', '(vector->list (vector-append (vector 1) (vector 2 3)))', '(1 2 3)');

console.log('--- list ---');
t('take/drop', '(list (take 2 (list 1 2 3 4)) (drop 2 (list 1 2 3 4)))', '((1 2) (3 4))');
t('remove', '(remove 2 (list 1 2 3 2))', '(1 3)');

console.log('--- sort ---');
t('list-sort', '(list-sort (list 3 1 4 1 5))', '(1 1 3 4 5)');
t('sorted?', '(sorted? (list 1 2 3))', '#t');

console.log('--- division ---');
t('div/mod', '(list (div 10 3) (mod 10 3))', '(3 1)');

console.log('--- inexact ---');
t('nan?', '(nan? +nan.0)', '#t');

console.log('--- random ---');
t('random-integer', '(<= 0 (random-integer 10))', '#t');

console.log('--- box ---');
t('box', '(begin (define b (box 42)) (set-box! b 99) (unbox b))', '99');

console.log('--- generator ---');
t('g-collect', '(g-collect (make-iota-generator 3))', '(0 1 2)');

console.log('--- hash ---');
t('hash-table-size', '(begin (define ht (make-hash-table)) (hash-table-set! ht 1 2) (hash-table-size ht))', '1');

console.log('--- text ---');
t('text', '(text->string (string->text "hi"))', 'hi');

console.log('--- import scheme red subset ---');
t('scheme unicode import', '(begin (import (scheme unicode)) (string-foldcase "X"))', 'x');
t('scheme bytevector import', '(begin (import (scheme bytevector)) (bytevector-length (make-bytevector 5)))', '5');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
