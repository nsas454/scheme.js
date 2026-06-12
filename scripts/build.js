#!/usr/bin/env node
/**
 * src/*.js を結合して dist/schemInp.js を生成する。
 * 各モジュールは同一グローバルスコープ(レガシー var)で連結される。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const MODULES = [
	'core.js',
	'env.js',
	'continuations.js',
	'primitives.js',
	'numbers.js',
	'io.js',
	'r7rs.js',
	'evaluator.js',
	'js_interop.js',
	'debugger.js',
	'init.js',
	'parser.js',
	'runtime.js'
];

const HEADER = `/**
 * scheme.js — ビルド成果物 (scripts/build.js から生成)
 * ソースは src/ 以下を編集してください。
 * Copyright (c) 2014 Shuichi Yukimoto. MIT License.
 */
`;

function build() {
	if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

	let out = HEADER;
	for (const name of MODULES) {
		const fp = path.join(SRC, name);
		if (!fs.existsSync(fp)) {
			console.error('Missing:', fp);
			process.exit(1);
		}
		out += '\n// ===== ' + name + ' =====\n';
		out += fs.readFileSync(fp, 'utf8');
		out += '\n';
	}

	const outPath = path.join(DIST, 'schemInp.js');
	fs.writeFileSync(outPath, out);
	fs.copyFileSync(path.join(SRC, 'r7rs_large.js'), path.join(DIST, 'r7rs_large.js'));
	console.log('Built', outPath, '(' + out.split('\n').length + ' lines)');
}

build();
