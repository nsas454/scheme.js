#!/usr/bin/env node
/**
 * SICP 演習カタログのコードが評価できることを確認する。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '../..');
const DIST_LARGE = fs.readFileSync(path.join(ROOT, 'dist/r7rs_large.js'), 'utf8');
const DIST_MAIN = fs.readFileSync(path.join(ROOT, 'dist/schemInp.js'), 'utf8');

function freshContext() {
	var ctx = vm.createContext({ console: console });
	vm.runInContext(DIST_LARGE, ctx);
	vm.runInContext(DIST_MAIN, ctx);
	return ctx;
}

function loadExercises() {
	var ctx = freshContext();
	ctx.window = ctx;
	vm.runInContext(fs.readFileSync(path.join(ROOT, 'sicp/exercises.js'), 'utf8'), ctx);
	return ctx.window.SICP_EXERCISES;
}

function collectExercises(data) {
	var out = [];
	data.chapters.forEach(function (ch) {
		ch.sections.forEach(function (sec) {
			sec.exercises.forEach(function (ex) {
				out.push({ chapter: ch.id, id: ex.id, code: ex.code });
			});
		});
	});
	return out;
}

function main() {
	var data = loadExercises();
	var exercises = collectExercises(data);
	var failed = 0;

	console.log('--- SICP exercises ---');
	exercises.forEach(function (ex) {
		var ctx = freshContext();
		var res = ctx.scheme_repl_eval(ex.code);
		if (!res.ok) {
			failed++;
			console.log('FAIL', 'ch' + ex.chapter, ex.id, res.error);
		}
	});

	var ctx = freshContext();
	var sqrt = ctx.scheme_repl_eval(
		'(define (square x) (* x x))\n' +
		'(define (good-enough? guess x) (< (abs (- (square guess) x)) 0.001))\n' +
		'(define (sqrt-iter guess x) (if (good-enough? guess x) guess (sqrt-iter (/ (+ guess (/ x guess)) 2) x)))\n' +
		'(define (sqrt x) (sqrt-iter 1.0 x))\n' +
		'(sqrt 9)'
	);
	if (!sqrt.ok || Math.abs(Number(sqrt.value) - 3) > 0.01) {
		failed++;
		console.log('FAIL sqrt sanity', sqrt);
	}

	console.log(failed === 0
		? exercises.length + ' exercises OK'
		: failed + ' failed, ' + (exercises.length - failed) + ' passed');
	process.exit(failed ? 1 : 0);
}

main();
