// primitives.js — 基本プリミティブ / R5RS
var primitive_procedures = {
	'car': function (args) { return car(args[0]); },
	'cdr': function (args) { return cdr(args[0]); },
	'cons': function (args) { return cons(args[0], args[1]); },
	'list': function (args) { return array_to_list(args); },
	'append': function (args) {
		if (args.length === 0) return null;
		var ret = args[args.length - 1];
		for (var i = args.length - 2; i >= 0; i--) {
			ret = append_pair(args[i], ret);
		}
		return ret;
	},
	'length': function (args) { return list_length(args[0]); },
	'pair?': function (args) { return args[0] instanceof Pair; },
	'null?': function (args) { return args[0] === null; },
	'not': function (args) { return !isTruthy(args[0]); },
	'*': function (args) {
		var ret = 1;
		for (var i = 0; i < args.length; i++) {
			if (!isNumber(args[i])) throw ("argument " + i + " is NaN: " + args[i]);
			ret *= (+args[i]);
		}
		return ret;
	},
	'+': function (args) {
		var ret = 0;
		for (var i = 0; i < args.length; i++) {
			if (!isNumber(args[i])) throw ("argument " + i + " is NaN: " + args[i]);
			ret += (+args[i]);
		}
		return ret;
	},
	'-': function (args) {
		if (args.length === 0) throw ("'-' requires at least 1 argument.");
		if (!isNumber(args[0])) throw ("argument 0 is NaN: " + args[0]);
		if (args.length === 1) return -(+args[0]);
		var ret = +args[0];
		for (var i = 1; i < args.length; i++) {
			if (!isNumber(args[i])) throw ("argument " + i + " is NaN: " + args[i]);
			ret -= (+args[i]);
		}
		return ret;
	},
	'/': function (args) {
		if (args.length === 0) throw ("'/' requires at least 1 argument.");
		if (!isNumber(args[0])) throw ("argument 0 is NaN: " + args[0]);
		var ret = +args[0];
		for (var i = 1; i < args.length; i++) {
			if (!isNumber(args[i])) throw ("argument " + i + " is NaN: " + args[i]);
			ret /= (+args[i]);
		}
		return ret;
	},
	'=': function (args) {
		for (var i = 1; i < args.length; i++) {
			if (+args[i - 1] !== +args[i]) return false;
		}
		return true;
	},
	'<': function (args) {
		for (var i = 1; i < args.length; i++) {
			if (!(+args[i - 1] < +args[i])) return false;
		}
		return true;
	},
	'>': function (args) {
		for (var i = 1; i < args.length; i++) {
			if (!(+args[i - 1] > +args[i])) return false;
		}
		return true;
	},
	'<=': function (args) {
		for (var i = 1; i < args.length; i++) {
			if (!(+args[i - 1] <= +args[i])) return false;
		}
		return true;
	},
	'>=': function (args) {
		for (var i = 1; i < args.length; i++) {
			if (!(+args[i - 1] >= +args[i])) return false;
		}
		return true;
	},
	'eq?': function (args) {
		if (args.length != 2) {
			return error("'eq?' requires 2 arguments.");
		}
		return (args[0] == args[1]);
	},
	'display': function (args) {
		var out;
		for (var i = 0; i < args.length; i++) {
			out = args[i];
			console.log(out);
			// ブラウザで #scheme-output があればそこにも出力する
			if (typeof document !== 'undefined') {
				var sink = document.getElementById('scheme-output');
				if (sink) {
					sink.appendChild(document.createTextNode(String(out) + '\n'));
				}
			}
		}
		return out;
	},
	'call/cc': callcc,
	'call-with-current-continuation': callcc,
	'XHR': function (args) {
		if (args.length < 2) {
			error("'XHR ' requires 2 arguments. method,url");
		}
		var METHOD = args[0].replace(/\"/g, '');
		var URL = args[1].replace(/\"/g, '');
		var body = null;

		if (METHOD == 'POST') {
			body = args[2];
		}

		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = _callback_;
		xhr.open(METHOD, URL, true);
		xhr.send(body);
	}
};

// ==================================================================
// R5RS 標準手続き(段階的拡張) ――― 追加データ型 / 等価性 / 出力 /
// 数値・リスト・文字・文字列・ベクタ手続き / 高階手続き / 制御
// ==================================================================

// --- 追加データ型 -------------------------------------------------
function Char(ch) { this.ch = ch; }                 // 文字
function SVector(items) { this.items = items; }     // ベクタ
function Values(items) { this.items = items; }       // 多値
function Promise(expr, env) { this.forced = false; this.value = undefined; this.expr = expr; this.env = env; }
function Eof() { }
var EOF_OBJECT = new Eof();

ispromise = function (p) { return p instanceof Promise; };

// --- 等価性 -------------------------------------------------------
function seqv(a, b) {
	if (a instanceof Char && b instanceof Char) return a.ch === b.ch;
	if (is_scheme_number(a) && is_scheme_number(b)) return num_eq(a, b);
	return a === b;
}
function sequal(a, b) {
	if (seqv(a, b)) return true;
	if (a instanceof Char && b instanceof Char) return a.ch === b.ch;
	if (a instanceof Pair && b instanceof Pair) {
		return sequal(a.car, b.car) && sequal(a.cdr, b.cdr);
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (var i = 0; i < a.length; i++) {
			if (!sequal(a[i], b[i])) return false;
		}
		return true;
	}
	if (a instanceof SVector && b instanceof SVector) return sequal(a.items, b.items);
	if (typeof SBytevector !== 'undefined' && a instanceof SBytevector && b instanceof SBytevector) {
		if (a.u8.length !== b.u8.length) return false;
		for (var bi = 0; bi < a.u8.length; bi++) if (a.u8[bi] !== b.u8[bi]) return false;
		return true;
	}
	return a == b;
}

// --- 表示 / write 表現 -------------------------------------------
function char_repr(ch) {
	var names = { ' ': 'space', '\n': 'newline', '\t': 'tab', '\r': 'return', '\0': 'null', '\u007f': 'delete' };
	return '#\\' + (names[ch] !== undefined ? names[ch] : ch);
}
function scheme_repr(x, writeMode) {
	if (x === true) return '#t';
	if (x === false) return '#f';
	if (x === undefined) return '';
	if (x === null) return '()';
	if (x instanceof Rational) return num_repr(x);
	if (x instanceof Complex) return num_repr(x);
	if (typeof x === 'number') return num_repr(x);
	if (x instanceof Char) return writeMode ? char_repr(x.ch) : x.ch;
	if (x instanceof Symbol) return x.name;
	if (x instanceof SVector) {
		var parts = [];
		for (var i = 0; i < x.items.length; i++) parts.push(scheme_repr(x.items[i], writeMode));
		return '#(' + parts.join(' ') + ')';
	}
	if (x instanceof Promise) return '#<promise>';
	if (x instanceof Values) {
		var vs = [];
		for (var j = 0; j < x.items.length; j++) vs.push(scheme_repr(x.items[j], writeMode));
		return vs.join(' ');
	}
	if (x instanceof Eof) return '#<eof>';
	if (x instanceof SRecord) return '#<record ' + x.typeName + '>';
	if (x instanceof HashTable) return '#<hash-table>';
	if (typeof SBytevector !== 'undefined' && x instanceof SBytevector) {
		var bp = [];
		for (var bi = 0; bi < x.u8.length; bi++) bp.push(String(x.u8[bi]));
		return '#u8(' + bp.join(' ') + ')';
	}
	if (typeof Box !== 'undefined' && x instanceof Box) return '#<box>';
	if (typeof SText !== 'undefined' && x instanceof SText) return '"' + x.s + '"';
	if (x instanceof Pair) {
		var parts = [];
		var p = x;
		var seen = [];
		while (p instanceof Pair) {
			if (seen.indexOf(p) >= 0) { parts.push('...'); p = null; break; }
			seen.push(p);
			parts.push(scheme_repr(p.car, writeMode));
			p = p.cdr;
		}
		if (p === null) return '(' + parts.join(' ') + ')';
		return '(' + parts.join(' ') + ' . ' + scheme_repr(p, writeMode) + ')';
	}
	if (Array.isArray(x)) {
		if (isprimitive_procedure(x) || iscompound_procedure(x)) return '#<procedure>';
		if (iscontinuation(x)) return '#<continuation>';
		if (ismacro(x)) return '#<macro>';
		var es = [];
		for (var m = 0; m < x.length; m++) es.push(scheme_repr(x[m], writeMode));
		return '(' + es.join(' ') + ')';
	}
	if (typeof x === 'string') return writeMode ? ('"' + x + '"') : x;
	return String(x);
}

// 出力先の上書き(ブラウザ REPL 等)。関数または { appendChild } を持つ DOM 要素。
var scheme_output_sink = null;

// 出力(末尾に改行を付けない。Node では stdout、ブラウザでは #scheme-output へ)
function scheme_output(str) {
	if (scheme_output_sink) {
		if (typeof scheme_output_sink === 'function') scheme_output_sink(str);
		else if (scheme_output_sink.appendChild) scheme_output_sink.appendChild(document.createTextNode(str));
		return;
	}
	if (typeof process !== 'undefined' && process.stdout && process.stdout.write) {
		process.stdout.write(str);
	} else if (typeof console !== 'undefined') {
		console.log(str);
	}
	if (typeof document !== 'undefined') {
		var sink = document.getElementById('scheme-output');
		if (sink) {
			sink.appendChild(document.createTextNode(str));
		}
	}
}

// --- 数値ヘルパ ---------------------------------------------------
function num(x, who) {
	if (!isNumber(x)) throw ((who || 'arithmetic') + ': not a number: ' + scheme_repr(x, true));
	return +x;
}
function gcd2(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }

// --- 追加プリミティブ群 ------------------------------------------
var R5RS_PRIMITIVES = {
	// 等価性
	'eqv?': function (args) { return seqv(args[0], args[1]); },
	'equal?': function (args) { return sequal(args[0], args[1]); },

	// 述語
	'boolean?': function (args) { return typeof args[0] === 'boolean'; },
	'symbol?': function (args) { return args[0] instanceof Symbol; },
	'char?': function (args) { return args[0] instanceof Char; },
	'string?': function (args) { return typeof args[0] === 'string'; },
	'vector?': function (args) { return args[0] instanceof SVector; },
	'number?': function (args) { return typeof args[0] === 'number'; },
	'list?': function (args) {
		var slow = args[0], fast = args[0];
		while (true) {
			if (fast === null) return true;
			if (!(fast instanceof Pair)) return false;
			fast = fast.cdr;
			if (fast === null) return true;
			if (!(fast instanceof Pair)) return false;
			fast = fast.cdr; slow = slow.cdr;
			if (fast === slow) return false; // 循環リスト
		}
	},
	'procedure?': function (args) {
		var p = args[0];
		return isprimitive_procedure(p) || iscompound_procedure(p) || iscontinuation(p);
	},
	'integer?': function (args) { return typeof args[0] === 'number' && isFinite(args[0]) && Math.floor(args[0]) === args[0]; },
	'real?': function (args) { return typeof args[0] === 'number'; },
	'rational?': function (args) { return typeof args[0] === 'number' && isFinite(args[0]); },
	'complex?': function (args) { return typeof args[0] === 'number'; },
	'exact?': function (args) { return typeof args[0] === 'number' && Math.floor(args[0]) === args[0]; },
	'inexact?': function (args) { return typeof args[0] === 'number' && Math.floor(args[0]) !== args[0]; },
	'eof-object?': function (args) { return args[0] instanceof Eof; },
	'zero?': function (args) { return num(args[0], 'zero?') === 0; },
	'positive?': function (args) { return num(args[0], 'positive?') > 0; },
	'negative?': function (args) { return num(args[0], 'negative?') < 0; },
	'odd?': function (args) { return Math.abs(num(args[0], 'odd?') % 2) === 1; },
	'even?': function (args) { return num(args[0], 'even?') % 2 === 0; },

	// 数値演算
	'abs': function (args) { return Math.abs(num(args[0], 'abs')); },
	'min': function (args) { var m = num(args[0], 'min'); for (var i = 1; i < args.length; i++) m = Math.min(m, num(args[i], 'min')); return m; },
	'max': function (args) { var m = num(args[0], 'max'); for (var i = 1; i < args.length; i++) m = Math.max(m, num(args[i], 'max')); return m; },
	'quotient': function (args) { return Math.trunc(num(args[0], 'quotient') / num(args[1], 'quotient')); },
	'remainder': function (args) { return num(args[0], 'remainder') % num(args[1], 'remainder'); },
	'modulo': function (args) { var a = num(args[0], 'modulo'), b = num(args[1], 'modulo'); return ((a % b) + b) % b; },
	'gcd': function (args) { if (args.length === 0) return 0; var g = Math.abs(num(args[0], 'gcd')); for (var i = 1; i < args.length; i++) g = gcd2(g, num(args[i], 'gcd')); return g; },
	'lcm': function (args) { if (args.length === 0) return 1; var l = Math.abs(num(args[0], 'lcm')); for (var i = 1; i < args.length; i++) { var b = Math.abs(num(args[i], 'lcm')); l = (l === 0 || b === 0) ? 0 : l / gcd2(l, b) * b; } return l; },
	'floor': function (args) { return Math.floor(num(args[0], 'floor')); },
	'ceiling': function (args) { return Math.ceil(num(args[0], 'ceiling')); },
	'truncate': function (args) { return Math.trunc(num(args[0], 'truncate')); },
	'round': function (args) { var x = num(args[0], 'round'); var r = Math.round(x); if (Math.abs(x - Math.trunc(x)) === 0.5 && r % 2 !== 0) r -= Math.sign(x); return r; },
	'sqrt': function (args) { return Math.sqrt(num(args[0], 'sqrt')); },
	'expt': function (args) { return Math.pow(num(args[0], 'expt'), num(args[1], 'expt')); },
	'exp': function (args) { return Math.exp(num(args[0], 'exp')); },
	'log': function (args) { return args.length > 1 ? Math.log(num(args[0], 'log')) / Math.log(num(args[1], 'log')) : Math.log(num(args[0], 'log')); },
	'sin': function (args) { return Math.sin(num(args[0], 'sin')); },
	'cos': function (args) { return Math.cos(num(args[0], 'cos')); },
	'tan': function (args) { return Math.tan(num(args[0], 'tan')); },
	'asin': function (args) { return Math.asin(num(args[0], 'asin')); },
	'acos': function (args) { return Math.acos(num(args[0], 'acos')); },
	'atan': function (args) { return args.length > 1 ? Math.atan2(num(args[0], 'atan'), num(args[1], 'atan')) : Math.atan(num(args[0], 'atan')); },
	'exact->inexact': function (args) { return num(args[0], 'exact->inexact'); },
	'inexact->exact': function (args) { return Math.round(num(args[0], 'inexact->exact')); },
	'exact': function (args) { return Math.round(num(args[0], 'exact')); },
	'inexact': function (args) { return num(args[0], 'inexact'); },
	'number->string': function (args) { return String(num(args[0], 'number->string')); },
	'string->number': function (args) { var n = Number(args[0]); return (args[0] !== '' && !isNaN(n)) ? n : false; },
	'1+': function (args) { return num(args[0], '1+') + 1; },
	'1-': function (args) { return num(args[0], '1-') - 1; },

	// リスト
	'caar': function (args) { return car(car(args[0])); },
	'cadr': function (args) { return car(cdr(args[0])); },
	'cdar': function (args) { return cdr(car(args[0])); },
	'cddr': function (args) { return cdr(cdr(args[0])); },
	'caaar': function (args) { return car(car(car(args[0]))); },
	'caadr': function (args) { return car(car(cdr(args[0]))); },
	'cadar': function (args) { return car(cdr(car(args[0]))); },
	'caddr': function (args) { return car(cdr(cdr(args[0]))); },
	'cdaar': function (args) { return cdr(car(car(args[0]))); },
	'cdadr': function (args) { return cdr(car(cdr(args[0]))); },
	'cddar': function (args) { return cdr(cdr(car(args[0]))); },
	'cdddr': function (args) { return cdr(cdr(cdr(args[0]))); },
	'cadddr': function (args) { return car(cdr(cdr(cdr(args[0])))); },
	'list-ref': function (args) { var p = args[0], n = to_jsint(args[1]); while (n-- > 0) p = p.cdr; return p.car; },
	'list-tail': function (args) { var p = args[0], n = to_jsint(args[1]); while (n-- > 0) p = p.cdr; return p; },
	'reverse': function (args) { var p = args[0], r = null; while (p instanceof Pair) { r = new Pair(p.car, r); p = p.cdr; } return r; },
	'last-pair': function (args) { var p = args[0]; if (!(p instanceof Pair)) return p; while (p.cdr instanceof Pair) p = p.cdr; return p; },
	'list-copy': function (args) { return append_pair(args[0], null); },
	'member': function (args) { var l = args[1]; while (l instanceof Pair) { if (sequal(args[0], l.car)) return l; l = l.cdr; } return false; },
	'memq': function (args) { var l = args[1]; while (l instanceof Pair) { if (seqv(args[0], l.car)) return l; l = l.cdr; } return false; },
	'memv': function (args) { var l = args[1]; while (l instanceof Pair) { if (seqv(args[0], l.car)) return l; l = l.cdr; } return false; },
	'assoc': function (args) { var l = args[1]; while (l instanceof Pair) { if (l.car instanceof Pair && sequal(args[0], l.car.car)) return l.car; l = l.cdr; } return false; },
	'assq': function (args) { var l = args[1]; while (l instanceof Pair) { if (l.car instanceof Pair && seqv(args[0], l.car.car)) return l.car; l = l.cdr; } return false; },
	'assv': function (args) { var l = args[1]; while (l instanceof Pair) { if (l.car instanceof Pair && seqv(args[0], l.car.car)) return l.car; l = l.cdr; } return false; },
	'set-car!': function (args) { args[0].car = args[1]; return undefined; },
	'set-cdr!': function (args) { args[0].cdr = args[1]; return undefined; },

	// シンボル / 文字列
	'symbol->string': function (args) { return (args[0] instanceof Symbol) ? args[0].name : String(args[0]); },
	'string->symbol': function (args) { return new Symbol(String(args[0])); },
	'string-length': function (args) { return String(args[0]).length; },
	'string-ref': function (args) { return new Char(String(args[0]).charAt(args[1])); },
	'substring': function (args) { return String(args[0]).substring(args[1], args[2]); },
	'string-append': function (args) { var s = ''; for (var i = 0; i < args.length; i++) s += String(args[i]); return s; },
	'string-copy': function (args) { return String(args[0]); },
	'string=?': function (args) { return String(args[0]) === String(args[1]); },
	'string<?': function (args) { return String(args[0]) < String(args[1]); },
	'string>?': function (args) { return String(args[0]) > String(args[1]); },
	'string<=?': function (args) { return String(args[0]) <= String(args[1]); },
	'string>=?': function (args) { return String(args[0]) >= String(args[1]); },
	'string->list': function (args) { var s = String(args[0]); var r = null; for (var i = s.length - 1; i >= 0; i--) r = new Pair(new Char(s.charAt(i)), r); return r; },
	'list->string': function (args) { var l = args[0]; var s = ''; while (l instanceof Pair) { s += (l.car instanceof Char ? l.car.ch : String(l.car)); l = l.cdr; } return s; },
	'make-string': function (args) { var n = args[0]; var c = args[1] instanceof Char ? args[1].ch : ' '; var s = ''; for (var i = 0; i < n; i++) s += c; return s; },
	'string': function (args) { var s = ''; for (var i = 0; i < args.length; i++) s += (args[i] instanceof Char ? args[i].ch : String(args[i])); return s; },
	'string-upcase': function (args) { return String(args[0]).toUpperCase(); },
	'string-downcase': function (args) { return String(args[0]).toLowerCase(); },

	// 文字
	'char->integer': function (args) { return args[0].ch.charCodeAt(0); },
	'integer->char': function (args) { return new Char(String.fromCharCode(args[0])); },
	'char=?': function (args) { return args[0].ch === args[1].ch; },
	'char<?': function (args) { return args[0].ch < args[1].ch; },
	'char>?': function (args) { return args[0].ch > args[1].ch; },
	'char<=?': function (args) { return args[0].ch <= args[1].ch; },
	'char>=?': function (args) { return args[0].ch >= args[1].ch; },
	'char-upcase': function (args) { return new Char(args[0].ch.toUpperCase()); },
	'char-downcase': function (args) { return new Char(args[0].ch.toLowerCase()); },
	'char-alphabetic?': function (args) { return /[a-zA-Z]/.test(args[0].ch); },
	'char-numeric?': function (args) { return /[0-9]/.test(args[0].ch); },
	'char-whitespace?': function (args) { return /\s/.test(args[0].ch); },
	'char-upper-case?': function (args) { var c = args[0].ch; return c !== c.toLowerCase() && c === c.toUpperCase(); },
	'char-lower-case?': function (args) { var c = args[0].ch; return c !== c.toUpperCase() && c === c.toLowerCase(); },

	// ベクタ
	'vector': function (args) { return new SVector(args.slice()); },
	'make-vector': function (args) { var n = args[0]; var fill = args.length > 1 ? args[1] : 0; var a = []; for (var i = 0; i < n; i++) a.push(fill); return new SVector(a); },
	'vector-ref': function (args) { return args[0].items[args[1]]; },
	'vector-set!': function (args) { args[0].items[args[1]] = args[2]; return undefined; },
	'vector-length': function (args) { return args[0].items.length; },
	'vector->list': function (args) { return array_to_list(args[0].items); },
	'list->vector': function (args) { return new SVector(list_to_array(args[0])); },
	'vector-fill!': function (args) { var v = args[0].items; for (var i = 0; i < v.length; i++) v[i] = args[1]; return undefined; },

	// 出力
	'write': function (args) { scheme_output(scheme_repr(args[0], true)); return undefined; },
	'write-string': function (args) { scheme_output(String(args[0])); return undefined; },
	'write-char': function (args) { scheme_output(args[0] instanceof Char ? args[0].ch : String(args[0])); return undefined; },
	'newline': function (args) { scheme_output('\n'); return undefined; },

	// エラー
	'error': function (args) {
		var msg = args.length ? scheme_repr(args[0], false) : 'error';
		for (var i = 1; i < args.length; i++) msg += ' ' + scheme_repr(args[i], true);
		throw msg;
	},

	// 環境(eval 用)
	'interaction-environment': function () { return theGlobalEnv; },
	'scheme-report-environment': function () { return theGlobalEnv; },
	'null-environment': function () { return theGlobalEnv; }
};

// display は R5RS 表現で出力(末尾改行なし)
R5RS_PRIMITIVES['display'] = function (args) {
	scheme_output(scheme_repr(args[0], false));
	return undefined;
};

// --- 高階・制御手続き (CPS。継続を扱うため k を受け取る) ----------

// (apply proc a b ... list)
var prim_apply = function (args, k) {
	var proc = args[0];
	var fixed = args.slice(1, args.length - 1);
	var last = args[args.length - 1];
	var all = fixed.concat(last == null ? [] : (last instanceof Pair ? list_to_array(last) : [last]));
	return s_apply(proc, all, k);
};
prim_apply.cps = true;

// (map proc list1 list2 ...)
var prim_map = function (args, k) {
	var proc = args[0];
	var lists = [];
	var n = Infinity;
	for (var i = 1; i < args.length; i++) {
		var arr = list_to_array(args[i]);
		lists.push(arr);
		if (arr.length < n) n = arr.length;
	}
	if (n === Infinity) n = 0;
	var result = [];
	var loop = function (idx) {
		if (idx >= n) {
			return bounce(function () { return k(array_to_list(result)); });
		}
		var tuple = [];
		for (var j = 0; j < lists.length; j++) tuple.push(lists[j][idx]);
		return s_apply(proc, tuple, function (v) {
			result.push(v);
			return loop(idx + 1);
		});
	};
	return loop(0);
};
prim_map.cps = true;

// (for-each proc list1 ...)
var prim_for_each = function (args, k) {
	var proc = args[0];
	var lists = [];
	var n = Infinity;
	for (var i = 1; i < args.length; i++) {
		var arr = list_to_array(args[i]);
		lists.push(arr);
		if (arr.length < n) n = arr.length;
	}
	if (n === Infinity) n = 0;
	var loop = function (idx) {
		if (idx >= n) {
			return bounce(function () { return k(undefined); });
		}
		var tuple = [];
		for (var j = 0; j < lists.length; j++) tuple.push(lists[j][idx]);
		return s_apply(proc, tuple, function (ignored) {
			return loop(idx + 1);
		});
	};
	return loop(0);
};
prim_for_each.cps = true;

// (values a b ...) / (call-with-values producer consumer)
var prim_values = function (args, k) {
	if (args.length === 1) return bounce(function () { return k(args[0]); });
	return bounce(function () { return k(new Values(args.slice())); });
};
prim_values.cps = true;

var prim_cwv = function (args, k) {
	var producer = args[0], consumer = args[1];
	return s_apply(producer, [], function (res) {
		var vals = (res instanceof Values) ? res.items : [res];
		return s_apply(consumer, vals, k);
	});
};
prim_cwv.cps = true;

// (dynamic-wind before thunk after) — 継続による脱出/再入でも before/after を実行
var prim_dynamic_wind = function (args, k) {
	var before = args[0], thunk = args[1], after = args[2];
	var frame = { before: before, after: after };
	return s_apply(before, [], function (ignored) {
		windStack.push(frame);
		return s_apply(thunk, [], function (result) {
			if (windStack.length > 0 && windStack[windStack.length - 1] === frame) {
				windStack.pop();
				return s_apply(after, [], function (ignored2) {
					return bounce(function () { return k(result); });
				});
			}
			return bounce(function () { return k(result); });
		});
	});
};
prim_dynamic_wind.cps = true;

// (force promise)
var prim_force = function (args, k) {
	var p = args[0];
	if (!ispromise(p)) return bounce(function () { return k(p); });
	if (p.forced) return bounce(function () { return k(p.value); });
	return seval(p.expr, p.env, function (v) {
		if (!p.forced) { p.forced = true; p.value = v; }
		return bounce(function () { return k(p.value); });
	});
};
prim_force.cps = true;

// (eval expr [env])
var prim_eval = function (args, k) {
	// データ(Pair)をコード(配列 AST)へ変換してから評価する
	var expr = to_ast(args[0]);
	var env = (args.length > 1 && args[1] instanceof Env) ? args[1] : theGlobalEnv;
	return seval(expr, env, k);
};
prim_eval.cps = true;

R5RS_PRIMITIVES['apply'] = prim_apply;
R5RS_PRIMITIVES['map'] = prim_map;
R5RS_PRIMITIVES['for-each'] = prim_for_each;
R5RS_PRIMITIVES['values'] = prim_values;
R5RS_PRIMITIVES['call-with-values'] = prim_cwv;
R5RS_PRIMITIVES['dynamic-wind'] = prim_dynamic_wind;
R5RS_PRIMITIVES['force'] = prim_force;
R5RS_PRIMITIVES['eval'] = prim_eval;

// 既存の primitive_procedures に統合
(function () {
	for (var name in R5RS_PRIMITIVES) {
		primitive_procedures[name] = R5RS_PRIMITIVES[name];
	}
})();

