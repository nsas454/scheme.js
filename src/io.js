// io.js — I/O ポート / EXTRA_R5RS
// ==================================================================
// I/O ポート
//   - 文字列ポート: open-input-string / open-output-string / get-output-string
//   - ファイルポート(Node のみ): open-input-file / open-output-file ほか
//   - read / read-char / peek-char / read-line / write / display / newline …
//   display/write/newline/write-char/write-string は省略可能なポート引数を取る。
// ==================================================================
function Port(opts) {
	this.isInput = !!opts.isInput;
	this.isOutput = !!opts.isOutput;
	this.kind = opts.kind;                 // 'string' | 'stdout' | 'stdin' | 'file'
	this.buffer = '';                      // 出力の蓄積
	this.str = opts.str || '';             // 入力バッファ
	this.pos = 0;
	this.closed = false;
	this.fileName = opts.fileName || null; // ファイル出力先
}
function make_string_output_port() { return new Port({ isOutput: true, kind: 'string' }); }
function make_string_input_port(s) { return new Port({ isInput: true, kind: 'string', str: s }); }

var NODE_FS = (typeof require !== 'undefined') ? (function () { try { return require('fs'); } catch (e) { return null; } })() : null;
var NODE_STDIN = (typeof process !== 'undefined' && process.stdin && process.stdin.fd !== undefined) ? process.stdin : null;
var HAS_STDIN = !!(NODE_FS && NODE_STDIN);

// 既定の入出力ポート(stdout / stdin)
var STDOUT_PORT = new Port({ isOutput: true, kind: 'stdout' });
var STDIN_PORT = new Port({ isInput: true, kind: HAS_STDIN ? 'stdin' : 'string', str: '' });
var current_output_port_obj = STDOUT_PORT;
var current_input_port_obj = STDIN_PORT;

function out_port(arg) { return (arg instanceof Port) ? arg : current_output_port_obj; }
function in_port(arg) { return (arg instanceof Port) ? arg : current_input_port_obj; }

function port_write_string(port, str) {
	if (port.closed) throw 'write: port is closed';
	if (port.kind === 'stdout') { scheme_output(str); return; }
	port.buffer += str; // 'string' / 'file'(file は close 時にフラッシュ)
}
function flush_port(port) {
	if (port.kind === 'file' && NODE_FS) NODE_FS.writeFileSync(port.fileName, port.buffer);
}

// --- stdin 同期読み取り(Node.js) ---------------------------------
function port_input_buffered(port) { return port.pos < port.str.length; }

function stdin_read_byte(port) {
	if (!HAS_STDIN) return false;
	try {
		var buf = Buffer.alloc(1);
		var n = NODE_FS.readSync(NODE_STDIN.fd, buf, 0, 1, null);
		if (n <= 0) return false;
		port.str += buf.toString('utf8', 0, n);
		return true;
	} catch (e) {
		return false;
	}
}

function port_input_fill(port) {
	if (port.kind === 'stdin') return stdin_read_byte(port);
	return false;
}

function port_char_ready(port) {
	if (port_input_buffered(port)) return true;
	if (port.kind === 'stdin' && HAS_STDIN) {
		// TTY ではブロック読み取りになるが、REPL 用途では #t を返す
		if (NODE_STDIN.isTTY) return true;
		// パイプ入力: 未読データがあるか試す(非ブロック)
		try {
			var buf = Buffer.alloc(1);
			var n = NODE_FS.readSync(NODE_STDIN.fd, buf, 0, 1, null);
			if (n > 0) { port.str += buf.toString('utf8', 0, n); return true; }
		} catch (e) { /* ignore */ }
	}
	return false;
}

function port_read_char(port) {
	if (!port_input_buffered(port) && !port_input_fill(port)) return EOF_OBJECT;
	return new Char(port.str.charAt(port.pos++));
}

function port_peek_char(port) {
	if (!port_input_buffered(port) && !port_input_fill(port)) return EOF_OBJECT;
	return new Char(port.str.charAt(port.pos));
}

function port_read_line(port) {
	var line = '';
	while (true) {
		if (!port_input_buffered(port) && !port_input_fill(port)) {
			return line === '' ? EOF_OBJECT : line;
		}
		var ch = port.str.charAt(port.pos++);
		if (ch === '\n') return line;
		if (ch !== '\r') line += ch;
	}
}

// バッファ先頭(空白を除く)から 1 つの完全な S 式が読めるか判定
function sexpr_complete_p(s) {
	var i = 0;
	while (i < s.length && ' \t\n\r'.indexOf(s.charAt(i)) >= 0) i++;
	if (i >= s.length) return false;
	var c = s.charAt(i);
	// リスト以外のアトム(空白または閉じ括弧まで)
	if (c !== '(' && c !== '"') {
		while (i < s.length && ' \t\n\r()'.indexOf(s.charAt(i)) < 0) i++;
		return i < s.length;
	}
	if (c === '"') {
		i++;
		var q = false;
		while (i < s.length) {
			if (s.charAt(i) === '\\') { i += 2; continue; }
			if (s.charAt(i) === '"') { q = !q; i++; if (!q) return i <= s.length; continue; }
			i++;
		}
		return false;
	}
	// リスト: 括弧の釣り合い(文字列内は無視)
	var depth = 0;
	var inStr = false;
	while (i < s.length) {
		var ch = s.charAt(i);
		if (inStr) {
			if (ch === '\\') { i += 2; continue; }
			if (ch === '"') inStr = false;
			i++; continue;
		}
		if (ch === '"') { inStr = true; i++; continue; }
		if (ch === '(') depth++;
		else if (ch === ')') { depth--; if (depth === 0) return true; }
		i++;
	}
	return false;
}

// stdin では 1 行(または完全な S 式)が揃うまで読み込む
function port_ensure_datum(port) {
	var slice = port.str.slice(port.pos);
	if (slice.trim() !== '' && sexpr_complete_p(slice)) return true;
	if (port.kind !== 'stdin') return slice.trim() !== '';
	while (true) {
		slice = port.str.slice(port.pos);
		if (slice.trim() !== '' && sexpr_complete_p(slice)) return true;
		if (!port_input_fill(port)) return slice.trim() !== '';
		// 改行が来たら 1 行分として解析を試みる(括弧なしアトム用)
		if (slice.indexOf('\n') >= 0 && slice.trim() !== '') return true;
	}
}

// ポートから 1 つの S 式を read する(データ = 本物の Pair を返す)
function port_read(port) {
	while (true) {
		if (!port_ensure_datum(port)) return EOF_OBJECT;
		var rest = port.str.slice(port.pos);
		var tk = new Tokenizer(rest);
		if (tk.value() === '' || tk.value() == null) {
			if (!port_input_fill(port)) return EOF_OBJECT;
			continue;
		}
		var ast = parse(tk);
		port.pos += tk.point;
		return to_datum(ast);
	}
}

var PORT_PRIMITIVES = {
	// 文字列ポート
	'open-input-string': function (args) { return make_string_input_port(String(args[0])); },
	'open-output-string': function (args) { return make_string_output_port(); },
	'get-output-string': function (args) { return args[0].buffer; },

	// ポート述語
	'port?': function (args) { return args[0] instanceof Port; },
	'input-port?': function (args) { return (args[0] instanceof Port) && args[0].isInput; },
	'output-port?': function (args) { return (args[0] instanceof Port) && args[0].isOutput; },
	'eof-object': function (args) { return EOF_OBJECT; },
	'char-ready?': function (args) { return port_char_ready(in_port(args[0])); },

	// 入力
	'read-char': function (args) { return port_read_char(in_port(args[0])); },
	'peek-char': function (args) { return port_peek_char(in_port(args[0])); },
	'read-line': function (args) { return port_read_line(in_port(args[0])); },
	'read': function (args) { return port_read(in_port(args[0])); },

	// 出力(省略可能なポート引数)
	'display': function (args) { port_write_string(out_port(args[1]), scheme_repr(args[0], false)); return undefined; },
	'write': function (args) { port_write_string(out_port(args[1]), scheme_repr(args[0], true)); return undefined; },
	'newline': function (args) { port_write_string(out_port(args[0]), '\n'); return undefined; },
	'write-char': function (args) { port_write_string(out_port(args[1]), args[0] instanceof Char ? args[0].ch : String(args[0])); return undefined; },
	'write-string': function (args) { port_write_string(out_port(args[1]), String(args[0])); return undefined; },

	// 既定ポート
	'current-output-port': function (args) { return current_output_port_obj; },
	'current-input-port': function (args) { return current_input_port_obj; },

	// クローズ
	'close-output-port': function (args) { flush_port(args[0]); args[0].closed = true; return undefined; },
	'close-input-port': function (args) { args[0].closed = true; return undefined; },
	'close-port': function (args) { flush_port(args[0]); args[0].closed = true; return undefined; },

	// ファイルポート(Node のみ)
	'open-input-file': function (args) { if (!NODE_FS) throw 'open-input-file: file ports require Node.js'; return make_string_input_port(NODE_FS.readFileSync(String(args[0]), 'utf8')); },
	'open-output-file': function (args) { if (!NODE_FS) throw 'open-output-file: file ports require Node.js'; return new Port({ isOutput: true, kind: 'file', fileName: String(args[0]) }); },
	'file-exists?': function (args) { return NODE_FS ? NODE_FS.existsSync(String(args[0])) : false; }
};

(function () {
	for (var name in PORT_PRIMITIVES) {
		primitive_procedures[name] = PORT_PRIMITIVES[name];
	}
})();

// --- CPS なポート手続き(thunk/proc を呼ぶため継続を扱う) ---------
var prim_call_with_output_string = function (args, k) {
	var proc = args[0];
	var port = make_string_output_port();
	return s_apply(proc, [port], function (ignored) {
		return bounce(function () { return k(port.buffer); });
	});
};
prim_call_with_output_string.cps = true;

var prim_with_output_to_string = function (args, k) {
	var thunk = args[0];
	var port = make_string_output_port();
	var saved = current_output_port_obj;
	current_output_port_obj = port;
	return s_apply(thunk, [], function (ignored) {
		current_output_port_obj = saved;
		return bounce(function () { return k(port.buffer); });
	});
};
prim_with_output_to_string.cps = true;

var prim_with_input_from_string = function (args, k) {
	var thunk = args[1];
	var port = make_string_input_port(String(args[0]));
	var saved = current_input_port_obj;
	current_input_port_obj = port;
	return s_apply(thunk, [], function (result) {
		current_input_port_obj = saved;
		return bounce(function () { return k(result); });
	});
};
prim_with_input_from_string.cps = true;

var prim_call_with_input_file = function (args, k) {
	if (!NODE_FS) throw 'call-with-input-file: file ports require Node.js';
	var port = make_string_input_port(NODE_FS.readFileSync(String(args[0]), 'utf8'));
	var proc = args[1];
	return s_apply(proc, [port], function (result) {
		port.closed = true;
		return bounce(function () { return k(result); });
	});
};
prim_call_with_input_file.cps = true;

var prim_call_with_output_file = function (args, k) {
	if (!NODE_FS) throw 'call-with-output-file: file ports require Node.js';
	var port = new Port({ isOutput: true, kind: 'file', fileName: String(args[0]) });
	var proc = args[1];
	return s_apply(proc, [port], function (result) {
		flush_port(port); port.closed = true;
		return bounce(function () { return k(result); });
	});
};
prim_call_with_output_file.cps = true;

var prim_with_output_to_file = function (args, k) {
	if (!NODE_FS) throw 'with-output-to-file: file ports require Node.js';
	var port = new Port({ isOutput: true, kind: 'file', fileName: String(args[0]) });
	var thunk = args[1];
	var saved = current_output_port_obj;
	current_output_port_obj = port;
	return s_apply(thunk, [], function (result) {
		current_output_port_obj = saved;
		flush_port(port); port.closed = true;
		return bounce(function () { return k(result); });
	});
};
prim_with_output_to_file.cps = true;

var prim_with_input_from_file = function (args, k) {
	if (!NODE_FS) throw 'with-input-from-file: file ports require Node.js';
	var port = make_string_input_port(NODE_FS.readFileSync(String(args[0]), 'utf8'));
	var thunk = args[1];
	var saved = current_input_port_obj;
	current_input_port_obj = port;
	return s_apply(thunk, [], function (result) {
		current_input_port_obj = saved;
		return bounce(function () { return k(result); });
	});
};
prim_with_input_from_file.cps = true;

primitive_procedures['call-with-output-string'] = prim_call_with_output_string;
primitive_procedures['with-output-to-string'] = prim_with_output_to_string;
primitive_procedures['with-input-from-string'] = prim_with_input_from_string;
primitive_procedures['call-with-input-file'] = prim_call_with_input_file;
primitive_procedures['call-with-output-file'] = prim_call_with_output_file;
primitive_procedures['with-output-to-file'] = prim_with_output_to_file;
primitive_procedures['with-input-from-file'] = prim_with_input_from_file;

// --- 追加 R5RS 手続き --------------------------------------------
var EXTRA_R5RS = {
	'load': function (args) {
		var path = String(args[0]);
		if (!NODE_FS) throw 'load: requires Node.js';
		scheme(NODE_FS.readFileSync(path, 'utf8'));
		return undefined;
	},
	'set-current-input-port!': function (args) { current_input_port_obj = args[0]; return undefined; },
	'set-current-output-port!': function (args) { current_output_port_obj = args[0]; return undefined; },
	'string-ci=?': function (args) { return String(args[0]).toLowerCase() === String(args[1]).toLowerCase(); },
	'string-ci<?': function (args) { return String(args[0]).toLowerCase() < String(args[1]).toLowerCase(); },
	'string-ci>?': function (args) { return String(args[0]).toLowerCase() > String(args[1]).toLowerCase(); },
	'string-ci<=?': function (args) { return String(args[0]).toLowerCase() <= String(args[1]).toLowerCase(); },
	'string-ci>=?': function (args) { return String(args[0]).toLowerCase() >= String(args[1]).toLowerCase(); },
	'char-ci=?': function (args) { return args[0].ch.toLowerCase() === args[1].ch.toLowerCase(); },
	'char-ci<?': function (args) { return args[0].ch.toLowerCase() < args[1].ch.toLowerCase(); },
	'char-ci>?': function (args) { return args[0].ch.toLowerCase() > args[1].ch.toLowerCase(); },
	'char-ci<=?': function (args) { return args[0].ch.toLowerCase() <= args[1].ch.toLowerCase(); },
	'char-ci>=?': function (args) { return args[0].ch.toLowerCase() >= args[1].ch.toLowerCase(); },
	'vector-copy': function (args) { return new SVector(args[0].items.slice()); },
	'vector-copy!': function (args) {
		var dest = args[0].items, src = args[1].items;
		var dstart = args.length > 2 ? to_jsint(args[2]) : 0;
		var sstart = args.length > 3 ? to_jsint(args[3]) : 0;
		var send = args.length > 4 ? to_jsint(args[4]) : src.length;
		for (var i = sstart, j = dstart; i < send; i++, j++) dest[j] = src[i];
		return undefined;
	}
};
(function () {
	for (var name in EXTRA_R5RS) primitive_procedures[name] = EXTRA_R5RS[name];
})();
