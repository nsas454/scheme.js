#!/usr/bin/env node
/**
 * 既存 scheme.js/schemInp.js を src/ モジュールへ一度分割する。
 */
const fs = require('fs');
const path = require('path');

const SRC_FILE = path.join(__dirname, '../scheme.js/schemInp.js');
const OUT = path.join(__dirname, '../src');
const lines = fs.readFileSync(SRC_FILE, 'utf8').split('\n');

function slice(start, end) {
	return lines.slice(start - 1, end).join('\n') + '\n';
}

function write(name, content, desc) {
	const header = '// ' + name + ' — ' + desc + '\n';
	fs.writeFileSync(path.join(OUT, name), header + content);
	console.log('Wrote', name);
}

// 1-indexed line ranges from original schemInp.js
write('core.js', slice(29, 147), 'Pair / リスト操作 / トランポリン');
write('env.js', slice(149, 358), '環境 / クロージャー / lambda');
write('continuations.js', slice(360, 419), 'dynamic-wind / call/cc 基盤');
write('numbers.js', slice(990, 1426), '数値タワー / NUMERIC_PRIMITIVES');
write('primitives.js', slice(421, 989), '基本プリミティブ / R5RS');
write('io.js', slice(1428, 1767), 'I/O ポート / EXTRA_R5RS');
write('r7rs.js', slice(1770, 2437), 'R7RS small (ライブラリ / 特殊形式)');
write('evaluator.js', slice(2439, 3287), 'CPS 評価器 / マクロ / s_apply');
write('init.js', slice(3289, 3337), 'グローバル初期化 / r7rs_large ロード');
write('parser.js', slice(3366, 3649), 'Tokenizer / parse');
write('runtime.js', slice(19, 27) + '\n' + slice(3346, 3364) + slice(3651, 3964), 'scheme() / REPL / エクスポート');

console.log('Done. Run: node scripts/build.js');
