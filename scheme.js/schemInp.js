/**
 * Scheme interpriter in JavaScript
 * Copyright (c) [2014] [Shuichi Yukimoto]
 * This software is released under the MIT License.
 *
 * https://bitbucket.org/yukimoto/scheme.js
 *
 * @fileoverview scheme in JavaScript
 * @author yukimoto@usa-mimi.jp
 *
 * 2026: クロージャー / マクロ(define-macro) / 継続(call/cc) を追加。
 *  - 環境を親リンク付きチェーンに変更し、真の字句スコープ(クロージャー)を実現
 *  - define-macro で Lisp 風マクロをサポート(引数は未評価のS式として渡る)
 *  - 評価器を CPS(継続渡しスタイル)+ トランポリンで再実装し、
 *    再入可能・再利用可能な「完全な継続(first-class continuation)」を実現。
 *    call/cc が捕捉した継続は保存して後から何度でも呼び出せる。
 */

var _callback_ = function (readystatechange) {
	if (readystatechange.target.readyState == 4) { // DONE
		if (readystatechange.target.status == 200) { // OK
			return regist_global('*callback*', readystatechange.target.responseText);
		} else {
			return regist_global('*callback*', readystatechange.target.responseText);
		}
	}
};

var TAG_CONS = 0;
var TAG_SYMBOL = 1;
var TAG_NUM = 2;

// ------------------------------------------------------------------
// 基本のリスト操作 (リストは JavaScript の配列で表現する)
// ------------------------------------------------------------------
var car = function (list) {
	return list[0];
};
var cdr = function (list) {
	return list.slice(1);
};
var cadr = function (list) {
	return car(cdr(list));
};

// 真のリスト cons: (cons x lst) は lst の先頭に x を足した新しいリストを返す
var cons = function (a, b) {
	if (arguments.length != 2)
		throw ("cons requires 2 arguments");
	if (Array.isArray(b)) return [a].concat(b);
	if (b == null) return [a];
	return [a, b];
};

var isNumber = function (value) {
	if (typeof (value) != 'number' && typeof (value) != 'string')
		return false;
	else
		return (value == parseFloat(value) && isFinite(value));
};

// scheme の真偽値判定: #f と空リストのみ偽として扱う
var isTruthy = function (value) {
	return !(value === false || value == null);
};

// ------------------------------------------------------------------
// トランポリン: CPS の末尾呼び出しを Bounce で包んで反復実行することで
// JavaScript のコールスタックを伸ばさずに(=スタックオーバーフローを避けて)
// 深い再帰や継続の再呼び出しを安全に駆動する。
// ------------------------------------------------------------------
function Bounce(thunk) {
	this.thunk = thunk;
}
function bounce(thunk) {
	return new Bounce(thunk);
}
function trampoline(b) {
	while (b instanceof Bounce) {
		b = b.thunk();
	}
	return b;
}

// ------------------------------------------------------------------
// 環境 (親リンク付きチェーン) ―― クロージャーの基盤
// ------------------------------------------------------------------
var Env = function (parent) {
	this.vars = {};
	this.parent = parent || null;
};

// 変数を探索して値を返す (見つからなければエラー)
Env.prototype.find = function (arg) {
	var name = (arg instanceof Symbol) ? arg.name : arg;
	var e = this;
	while (e) {
		if (Object.prototype.hasOwnProperty.call(e.vars, name)) {
			return e.vars[name];
		}
		e = e.parent;
	}
	return error(name + ' is not defined');
};

// 見つからなくてもエラーにせず undefined を返す (マクロ判定用)
Env.prototype.tryFind = function (arg) {
	var name = (arg instanceof Symbol) ? arg.name : arg;
	var e = this;
	while (e) {
		if (Object.prototype.hasOwnProperty.call(e.vars, name)) {
			return e.vars[name];
		}
		e = e.parent;
	}
	return undefined;
};

// set! : 既存の束縛を探して書き換える
Env.prototype.assainment = function (name, value) {
	var e = this;
	while (e) {
		if (Object.prototype.hasOwnProperty.call(e.vars, name)) {
			e.vars[name] = value;
			return value;
		}
		e = e.parent;
	}
	return error(name + ' is not defined -- SET!');
};

// define : 現在のフレームに束縛を作る
Env.prototype.add = function (name, value) {
	this.vars[name] = value;
	return value;
};

// トップレベル(グローバル)環境。define はここに積まれ、呼び出し間で永続する。
var theGlobalEnv = new Env();

regist_global = function (name, value) {
	theGlobalEnv.vars[name] = value;
	return theGlobalEnv.vars[name];
};

// 仮引数に実引数を束縛した「新しい子環境」を作る(クロージャーの肝)
extend_env = function (parameters, args, env) {
	var newEnv = new Env(env);
	if (parameters == null) {
		return newEnv;
	}
	for (var i = 0; i < parameters.length; i++) {
		var name = (parameters[i] instanceof Symbol) ? parameters[i].name : parameters[i];
		newEnv.add(name, args[i]);
	}
	return newEnv;
};

look_up_variable_value = function (arg, env) {
	return env.find(arg);
};

// ------------------------------------------------------------------
// シンボル / 自己評価式
// ------------------------------------------------------------------
isSymbol = function (exp) {
	return exp instanceof Symbol;
};

self_evaluating = function (exp) {
	if (typeof (exp) == 'number') return true;
	if (exp == parseFloat(exp) && isFinite(exp)) return true;
	if (typeof (exp) == "string"
		&& exp.charAt(0) == "\""
		&& exp.charAt(exp.length - 1) == "\"") return true;
	return false;
};

isVariable = function (exp) {
	return exp instanceof Symbol;
};

// ------------------------------------------------------------------
// quote
// ------------------------------------------------------------------
isquoted = function (exp) {
	return istagged_list(exp, "quote");
};

text_of_quotation = function (exp) {
	var datum = car(cdr(exp));
	if (datum instanceof Array) {
		return datum;
	}
	if (datum instanceof Symbol) {
		return datum.name;
	}
	if (typeof datum === "string") {
		return datum.replace(/\"/g, '');
	}
	return datum;
};

istagged_list = function (exp, tag) {
	if (exp instanceof Array) {
		return car(exp) == tag;
	}
	return false;
};

// ------------------------------------------------------------------
// set! / define
// ------------------------------------------------------------------
isassignment = function (exp) {
	return istagged_list(exp, 'set!');
};

isdefine = function (exp) {
	return istagged_list(exp, 'define');
};

// ------------------------------------------------------------------
// マクロ define-macro
//   (define-macro (name a b ...) body ...)
//   引数は「未評価のS式」として束縛され、body が新しいS式を構築して返す。
//   返された式を改めて評価する。
// ------------------------------------------------------------------
isdefine_macro = function (exp) {
	return istagged_list(exp, 'define-macro');
};

ismacro = function (p) {
	return istagged_list(p, 'macro');
};

// ------------------------------------------------------------------
// if
// ------------------------------------------------------------------
isif = function (exp) {
	return istagged_list(exp, "if");
};

// ------------------------------------------------------------------
// lambda / 手続き(クロージャー)
// ------------------------------------------------------------------
islambda = function (exp) {
	return istagged_list(exp, "lambda");
};

// 手続きは ["procedure", 仮引数, 本体(式の配列), 定義時の環境]
make_procedure = function (param, body, env) {
	return ["procedure", param, body, env];
};

lambda_parameters = function (exp) {
	return car(cdr(exp));
};

// 本体は式の配列 (複数式を許す)
lambda_body = function (exp) {
	return cdr(cdr(exp));
};

iscompound_procedure = function (p) {
	return istagged_list(p, "procedure");
};
procedure_parameters = function (p) {
	return p[1];
};
procedure_body = function (p) {
	return p[2];
};
procedure_environment = function (p) {
	return p[3];
};

// ------------------------------------------------------------------
// 継続 (first-class continuation)
//   call/cc は現在の継続 k を ["continuation", k] として具現化(reify)する。
//   この継続オブジェクトはファーストクラスの値なので、変数に保存して
//   後から何度でも呼び出せる(再入可能・再利用可能)。
//   継続を呼ぶと、その時点の継続を破棄して捕捉済みの k へジャンプする。
// ------------------------------------------------------------------
iscontinuation = function (p) {
	return istagged_list(p, 'continuation');
};

// ------------------------------------------------------------------
// プリミティブ手続き
// ------------------------------------------------------------------
isprimitive_procedure = function (procedure) {
	return istagged_list(procedure, "primitive");
};

// 通常のプリミティブは fn(args)->値。call/cc など継続を扱うものは
// fn.cps=true を立て fn(args, k)->Bounce を返す。
apply_primitive_procedure = function (proc, args, k) {
	var func = car(cdr(proc));
	if (func.cps) {
		return func(args, k);
	}
	return bounce(function () { return k(func.call(null, args)); });
};

// call/cc 本体: 現在の継続 k を具現化して proc に渡す。
// proc が普通に値を返せば k で継続。継続オブジェクトが呼ばれた場合は
// s_apply 側で捕捉済みの k へジャンプする。
var callcc = function (args, k) {
	var proc = args[0];
	var continuation = ["continuation", k];
	return s_apply(proc, [continuation], k);
};
callcc.cps = true;

var primitive_procedures = {
	'car': function (args) { return car(args[0]); },
	'cdr': function (args) { return cdr(args[0]); },
	'cons': function (args) { return cons(args[0], args[1]); },
	'list': function (args) { return args.slice(); },
	'append': function (args) {
		var ret = [];
		for (var i = 0; i < args.length; i++) {
			ret = ret.concat(args[i]);
		}
		return ret;
	},
	'length': function (args) { return args[0] == null ? 0 : args[0].length; },
	'pair?': function (args) { return Array.isArray(args[0]) && args[0].length > 0; },
	'null?': function (args) { return args[0] == null || (Array.isArray(args[0]) && args[0].length === 0); },
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
	return a === b;
}
function sequal(a, b) {
	if (seqv(a, b)) return true;
	if (a instanceof Char && b instanceof Char) return a.ch === b.ch;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (var i = 0; i < a.length; i++) {
			if (!sequal(a[i], b[i])) return false;
		}
		return true;
	}
	if (a instanceof SVector && b instanceof SVector) return sequal(a.items, b.items);
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

// 出力(末尾に改行を付けない。Node では stdout、ブラウザでは #scheme-output へ)
function scheme_output(str) {
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
	'list?': function (args) { return args[0] == null || Array.isArray(args[0]); },
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
	'list-ref': function (args) { return args[0][args[1]]; },
	'list-tail': function (args) { return args[0].slice(args[1]); },
	'reverse': function (args) { return args[0] == null ? null : args[0].slice().reverse(); },
	'last-pair': function (args) { var l = args[0]; return l.slice(l.length - 1); },
	'list-copy': function (args) { return args[0] == null ? null : args[0].slice(); },
	'member': function (args) { var l = args[1] || []; for (var i = 0; i < l.length; i++) if (sequal(args[0], l[i])) return l.slice(i); return false; },
	'memq': function (args) { var l = args[1] || []; for (var i = 0; i < l.length; i++) if (seqv(args[0], l[i])) return l.slice(i); return false; },
	'memv': function (args) { var l = args[1] || []; for (var i = 0; i < l.length; i++) if (seqv(args[0], l[i])) return l.slice(i); return false; },
	'assoc': function (args) { var l = args[1] || []; for (var i = 0; i < l.length; i++) if (sequal(args[0], car(l[i]))) return l[i]; return false; },
	'assq': function (args) { var l = args[1] || []; for (var i = 0; i < l.length; i++) if (seqv(args[0], car(l[i]))) return l[i]; return false; },
	'assv': function (args) { var l = args[1] || []; for (var i = 0; i < l.length; i++) if (seqv(args[0], car(l[i]))) return l[i]; return false; },
	'set-car!': function (args) { args[0][0] = args[1]; return undefined; },
	'set-cdr!': function (args) {
		var l = args[0], nt = args[1];
		l.length = 1;
		if (Array.isArray(nt)) { for (var i = 0; i < nt.length; i++) l.push(nt[i]); }
		else if (nt != null) { l.push(nt); }
		return undefined;
	},

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
	'string->list': function (args) { var s = String(args[0]); var r = []; for (var i = 0; i < s.length; i++) r.push(new Char(s.charAt(i))); return r.length ? r : null; },
	'list->string': function (args) { var l = args[0] || []; var s = ''; for (var i = 0; i < l.length; i++) s += (l[i] instanceof Char ? l[i].ch : String(l[i])); return s; },
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
	'vector->list': function (args) { return args[0].items.length ? args[0].items.slice() : null; },
	'list->vector': function (args) { return new SVector(args[0] == null ? [] : args[0].slice()); },
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
	var all = fixed.concat(last == null ? [] : (Array.isArray(last) ? last : [last]));
	return s_apply(proc, all, k);
};
prim_apply.cps = true;

// (map proc list1 list2 ...)
var prim_map = function (args, k) {
	var proc = args[0];
	var lists = args.slice(1);
	var n = Infinity;
	for (var i = 0; i < lists.length; i++) {
		var len = lists[i] == null ? 0 : lists[i].length;
		if (len < n) n = len;
	}
	if (n === Infinity) n = 0;
	var result = [];
	var loop = function (idx) {
		if (idx >= n) {
			return bounce(function () { return k(result.length ? result : null); });
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
	var lists = args.slice(1);
	var n = Infinity;
	for (var i = 0; i < lists.length; i++) {
		var len = lists[i] == null ? 0 : lists[i].length;
		if (len < n) n = len;
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

// (dynamic-wind before thunk after)
// 注: 通常完了時に after を実行する。継続による脱出/再入には未対応(簡易版)。
var prim_dynamic_wind = function (args, k) {
	var before = args[0], thunk = args[1], after = args[2];
	return s_apply(before, [], function (ignored) {
		return s_apply(thunk, [], function (result) {
			return s_apply(after, [], function (ignored2) {
				return bounce(function () { return k(result); });
			});
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
	var expr = args[0];
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

// ------------------------------------------------------------------
// 式の各種アクセサ
// ------------------------------------------------------------------
operator = function (exp) {
	return car(exp);
};
operands = function (exp) {
	return cdr(exp);
};

isapplication = function (exp) {
	return exp instanceof Array;
};

isbegin = function (exp) {
	return istagged_list(exp, "begin");
};
begin_actions = function (exp) {
	return cdr(exp);
};

iscond = function (exp) {
	return istagged_list(exp, "cond");
};
islet = function (exp) {
	return istagged_list(exp, "let");
};
islet_star = function (exp) {
	return istagged_list(exp, "let*");
};
isletrec = function (exp) {
	return istagged_list(exp, "letrec");
};
isdo = function (exp) {
	return istagged_list(exp, "do");
};
isquasiquote = function (exp) {
	return istagged_list(exp, "quasiquote");
};
isdelay = function (exp) {
	return istagged_list(exp, "delay");
};
// タグが文字列でも Symbol でも一致判定する
tag_equals = function (x, name) {
	if (x === name) return true;
	if (x instanceof Symbol && x.name === name) return true;
	return false;
};
isand = function (exp) {
	return istagged_list(exp, "and");
};
isor = function (exp) {
	return istagged_list(exp, "or");
};
iscase = function (exp) {
	return istagged_list(exp, "case");
};

cond_if = function (exp) {
	return expand_clauses(cond_clauses(exp));
};

cond_else_clause = function (clause) {
	return cond_predicate(clause) == "else";
};

cond_predicate = function (clause) {
	return car(clause);
};

cond_actions = function (clause) {
	return cdr(clause);
};
cond_clauses = function (exp) {
	return cdr(exp);
};

sequence_exp = function (seq) {
	if (seq == null || seq.length === 0) return seq;
	if (seq.length === 1) return seq[0];
	return make_begin(seq);
};

make_begin = function (seq) {
	return ['begin'].concat(seq);
};

make_if = function (predicate, consequent, alternative) {
	return ["if", predicate, consequent, alternative];
};

expand_clauses = function (clauses) {
	if (clauses == null || clauses.length === 0) return false;
	var first = car(clauses);
	var rest = cdr(clauses);
	if (cond_else_clause(first)) {
		if (rest.length === 0) {
			return sequence_exp(cond_actions(first));
		} else {
			return error("ELSE clause isn't last -- COND->IF");
		}
	} else {
		return make_if(cond_predicate(first),
			sequence_exp(cond_actions(first)),
			expand_clauses(rest));
	}
};

show_text = function (exp) {
	var ret = exp;
	if (typeof exp === 'string' && isNaN(Number(exp))) {
		ret = exp.replace(/\"/g, "");
	}
	return ret;
};

let_to_parameters_args_body = function (exp) {
	var ret = [];
	var param = [];
	var arg = [];
	var array = car(cdr(exp));
	var body = car(cdr(cdr(exp)));
	for (var i = 0; i < array.length; i++) {
		param.push(car(array[i]));
		arg.push(cdr(array[i]));
	}
	ret.push(param);
	ret.push(arg);
	ret.push(body);
	return ret;
};

// ==================================================================
// CPS 評価器
//   seval(exp, env, k): 式 exp を評価し、結果を継続 k に渡す。
//   返り値は必ず Bounce(またはトップレベル halt が返す最終値)で、
//   トランポリンが反復実行することでスタックを消費せず駆動する。
// ==================================================================
function seval(exp, env, k) {
	// 真偽値・空リストはそのまま
	if (typeof exp === 'boolean' || exp == null) {
		return bounce(function () { return k(exp); });
	}
	// 文字 / ベクタ / 多値 / プロミス はそのまま自己評価
	if (exp instanceof Char || exp instanceof SVector || exp instanceof Values || exp instanceof Promise) {
		return bounce(function () { return k(exp); });
	}
	// 自己評価式 (数値・文字列リテラル)
	if (self_evaluating(exp)) {
		return bounce(function () { return k(show_text(exp)); });
	}
	// 変数参照
	if (isVariable(exp)) {
		return bounce(function () { return k(env.find(exp)); });
	}
	// quote
	if (isquoted(exp)) {
		return bounce(function () { return k(text_of_quotation(exp)); });
	}
	// set!
	if (isassignment(exp)) {
		return eval_assignment(exp, env, k);
	}
	// define
	if (isdefine(exp)) {
		return eval_definition(exp, env, k);
	}
	// define-macro
	if (isdefine_macro(exp)) {
		return eval_define_macro(exp, env, k);
	}
	// let
	if (islet(exp)) {
		return eval_let(exp, env, k);
	}
	// let* (逐次束縛)
	if (islet_star(exp)) {
		return eval_let_star(exp, env, k);
	}
	// letrec (相互再帰の束縛)
	if (isletrec(exp)) {
		return eval_letrec(exp, env, k);
	}
	// do ループ
	if (isdo(exp)) {
		return eval_do(exp, env, k);
	}
	// quasiquote
	if (isquasiquote(exp)) {
		return eval_quasi(car(cdr(exp)), 1, env, k);
	}
	// delay -> プロミスを生成(本体は遅延評価)
	if (isdelay(exp)) {
		var promise = new Promise(car(cdr(exp)), env);
		return bounce(function () { return k(promise); });
	}
	// if
	if (isif(exp)) {
		return eval_if(exp, env, k);
	}
	// and (短絡)
	if (isand(exp)) {
		return eval_and(cdr(exp), env, k);
	}
	// or (短絡)
	if (isor(exp)) {
		return eval_or(cdr(exp), env, k);
	}
	// case
	if (iscase(exp)) {
		return eval_case(exp, env, k);
	}
	// lambda -> クロージャー(定義時の環境を捕捉)
	if (islambda(exp)) {
		var proc = make_procedure(lambda_parameters(exp), lambda_body(exp), env);
		return bounce(function () { return k(proc); });
	}
	// begin
	if (isbegin(exp)) {
		return eval_sequence(begin_actions(exp), env, k);
	}
	// cond
	if (iscond(exp)) {
		return seval(cond_if(exp), env, k);
	}
	// 関数適用 (マクロ展開もここで処理)
	if (isapplication(exp)) {
		return eval_application(exp, env, k);
	}

	return error("Unknown expression type -- EVAL");
}

eval_assignment = function (exp, env, k) {
	var name = car(cdr(exp)).name;
	return seval(car(cdr(cdr(exp))), env, function (value) {
		env.assainment(name, value);
		return bounce(function () { return k(value); });
	});
};

eval_definition = function (exp, env, k) {
	var target = car(cdr(exp));
	if (target instanceof Array) {
		// (define (name a b ...) body ...)
		var name = car(target).name;
		var params = cdr(target);
		var body = cdr(cdr(exp));
		env.add(name, make_procedure(params, body, env));
		return bounce(function () { return k(name); });
	}
	// (define name value)
	var sym = target.name;
	return seval(car(cdr(cdr(exp))), env, function (value) {
		env.add(sym, value);
		return bounce(function () { return k(sym); });
	});
};

eval_define_macro = function (exp, env, k) {
	var spec = car(cdr(exp));
	var name = car(spec).name;
	var params = cdr(spec);
	var body = cdr(cdr(exp));
	env.add(name, ['macro', params, body, env]);
	return bounce(function () { return k(name); });
};

eval_if = function (exp, env, k) {
	return seval(car(cdr(exp)), env, function (test) {
		if (isTruthy(test)) {
			return seval(car(cdr(cdr(exp))), env, k);
		}
		return seval(car(cdr(cdr(cdr(exp)))), env, k);
	});
};

// let は lambda 適用へ脱糖。第2要素がシンボルなら「名前付き let」。
eval_let = function (exp, env, k) {
	if (car(cdr(exp)) instanceof Symbol) {
		return eval_named_let(exp, env, k);
	}
	var param_list = let_to_parameters_args_body(exp);
	var arg = param_list[1];
	var new_exp = [['lambda', param_list[0], param_list[2]]];
	for (var i = 0; i < arg.length; i++) {
		new_exp.push(car(arg[i]));
	}
	return seval(new_exp, env, k);
};

// 名前付き let: (let name ((v init) ...) body ...)
//   名前を持つ再帰手続きとして実装し、初期値を引数に適用する(ループに使える)。
eval_named_let = function (exp, env, k) {
	var name = car(cdr(exp)).name;
	var bindings = car(cdr(cdr(exp)));
	var body = cdr(cdr(cdr(exp)));
	var params = [];
	var initExprs = [];
	if (bindings != null) {
		for (var i = 0; i < bindings.length; i++) {
			params.push(car(bindings[i]));
			initExprs.push(car(cdr(bindings[i])));
		}
	}
	var loopEnv = new Env(env);
	var proc = make_procedure(params, body, loopEnv);
	loopEnv.add(name, proc);
	// 初期値は外側の環境で評価し、手続きに適用する
	return eval_list(initExprs, env, function (args) {
		return s_apply(proc, args, k);
	});
};

// letrec : 全ての束縛名を先に宣言してから初期値を評価する(相互再帰が可能)
eval_letrec = function (exp, env, k) {
	var bindings = car(cdr(exp));
	var body = cdr(cdr(exp));
	var newEnv = new Env(env);
	var names = [];
	if (bindings != null) {
		for (var i = 0; i < bindings.length; i++) {
			var nm = car(bindings[i]);
			nm = (nm instanceof Symbol) ? nm.name : nm;
			names.push(nm);
			newEnv.add(nm, undefined);
		}
	}
	var bind = function (j) {
		if (bindings == null || j >= bindings.length) {
			return eval_sequence(body, newEnv, k);
		}
		return seval(car(cdr(bindings[j])), newEnv, function (value) {
			newEnv.add(names[j], value);
			return bind(j + 1);
		});
	};
	return bind(0);
};

// do ループ: (do ((var init step) ...) (test result ...) command ...)
eval_do = function (exp, env, k) {
	var specs = car(cdr(exp));
	var testClause = car(cdr(cdr(exp)));
	var body = cdr(cdr(cdr(exp)));
	var test = car(testClause);
	var resultExprs = cdr(testClause);

	var names = [];
	var initExprs = [];
	var stepExprs = [];
	if (specs != null) {
		for (var i = 0; i < specs.length; i++) {
			var s = specs[i];
			var nm = car(s);
			nm = (nm instanceof Symbol) ? nm.name : nm;
			names.push(nm);
			initExprs.push(car(cdr(s)));
			// step が無ければ変数自身(=値を変えない)
			stepExprs.push(s.length >= 3 ? car(cdr(cdr(s))) : car(s));
		}
	}

	return eval_list(initExprs, env, function (initVals) {
		var loopEnv = new Env(env);
		for (var i = 0; i < names.length; i++) {
			loopEnv.add(names[i], initVals[i]);
		}
		var iterate = function () {
			return seval(test, loopEnv, function (tv) {
				if (isTruthy(tv)) {
					if (resultExprs == null || resultExprs.length === 0) {
						return bounce(function () { return k(undefined); });
					}
					return eval_sequence(resultExprs, loopEnv, k);
				}
				// 本体を副作用のために評価 -> ステップを(古い値で)一括評価 -> 再束縛
				return eval_sequence(body, loopEnv, function (ignored) {
					return eval_list(stepExprs, loopEnv, function (stepVals) {
						for (var j = 0; j < names.length; j++) {
							loopEnv.add(names[j], stepVals[j]);
						}
						return iterate();
					});
				});
			});
		};
		return iterate();
	});
};

// quasiquote: テンプレートを評価し、unquote(,) は評価結果に、
// unquote-splicing(,@) はリストを展開して埋め込む。ネスト(depth)も扱う。
eval_quasi = function (tmpl, depth, env, k) {
	if (!(tmpl instanceof Array)) {
		// アトム: シンボルは名前文字列に(quote と同様)、それ以外はそのまま
		var v = (tmpl instanceof Symbol) ? tmpl.name : tmpl;
		return bounce(function () { return k(v); });
	}
	// (unquote x)
	if (tmpl.length > 0 && tag_equals(tmpl[0], 'unquote')) {
		if (depth === 1) {
			return seval(tmpl[1], env, k);
		}
		return eval_quasi(tmpl[1], depth - 1, env, function (inner) {
			return bounce(function () { return k(['unquote', inner]); });
		});
	}
	// (quasiquote x) ネスト
	if (tmpl.length > 0 && tag_equals(tmpl[0], 'quasiquote')) {
		return eval_quasi(tmpl[1], depth + 1, env, function (inner) {
			return bounce(function () { return k(['quasiquote', inner]); });
		});
	}
	// 一般のリスト: 各要素を処理。depth===1 の unquote-splicing は展開する。
	return quasi_list(tmpl, 0, depth, env, k);
};

quasi_list = function (items, i, depth, env, k) {
	if (i >= items.length) {
		return bounce(function () { return k([]); });
	}
	var e = items[i];
	if (e instanceof Array && e.length > 0 && tag_equals(e[0], 'unquote-splicing') && depth === 1) {
		return seval(e[1], env, function (spliced) {
			return quasi_list(items, i + 1, depth, env, function (rest) {
				var arr = (spliced == null) ? [] : (Array.isArray(spliced) ? spliced : [spliced]);
				return bounce(function () { return k(arr.concat(rest)); });
			});
		});
	}
	return eval_quasi(e, depth, env, function (head) {
		return quasi_list(items, i + 1, depth, env, function (rest) {
			return bounce(function () { return k([head].concat(rest)); });
		});
	});
};

// let* : 束縛を逐次評価し、後の束縛から前の束縛を参照できる
eval_let_star = function (exp, env, k) {
	var bindings = car(cdr(exp));
	var body = cdr(cdr(exp));
	var newEnv = new Env(env);
	var bind = function (i) {
		if (bindings == null || i >= bindings.length) {
			return eval_sequence(body, newEnv, k);
		}
		var b = bindings[i];
		var name = car(b);
		name = (name instanceof Symbol) ? name.name : name;
		return seval(car(cdr(b)), newEnv, function (value) {
			newEnv.add(name, value);
			return bind(i + 1);
		});
	};
	return bind(0);
};

// and : 左から評価し #f が出たらそこで打ち切る。全て真なら最後の値を返す。
eval_and = function (clauses, env, k) {
	if (clauses == null || clauses.length === 0) {
		return bounce(function () { return k(true); });
	}
	if (clauses.length === 1) {
		return seval(clauses[0], env, k);
	}
	return seval(clauses[0], env, function (value) {
		if (!isTruthy(value)) {
			return bounce(function () { return k(value); });
		}
		return eval_and(cdr(clauses), env, k);
	});
};

// or : 左から評価し最初の真値を返す。全て偽なら最後の値を返す。
eval_or = function (clauses, env, k) {
	if (clauses == null || clauses.length === 0) {
		return bounce(function () { return k(false); });
	}
	if (clauses.length === 1) {
		return seval(clauses[0], env, k);
	}
	return seval(clauses[0], env, function (value) {
		if (isTruthy(value)) {
			return bounce(function () { return k(value); });
		}
		return eval_or(cdr(clauses), env, k);
	});
};

// case : key を評価し、データリストに一致する節の本体を評価する。
//   (case key ((d1 d2 ...) body ...) ... (else body ...))
normalize_datum = function (d) {
	return (d instanceof Symbol) ? d.name : d;
};

eval_case = function (exp, env, k) {
	var keyExpr = car(cdr(exp));
	var clauses = cdr(cdr(exp));
	return seval(keyExpr, env, function (key) {
		var nkey = normalize_datum(key);
		var loop = function (cs) {
			if (cs == null || cs.length === 0) {
				return bounce(function () { return k(undefined); });
			}
			var clause = car(cs);
			var head = car(clause);
			if (head === 'else') {
				return eval_sequence(cdr(clause), env, k);
			}
			var datums = head;
			if (datums != null) {
				for (var i = 0; i < datums.length; i++) {
					if (normalize_datum(datums[i]) == nkey) {
						return eval_sequence(cdr(clause), env, k);
					}
				}
			}
			return loop(cdr(cs));
		};
		return loop(clauses);
	});
};

// 式の配列を順に評価し、最後の値を継続へ渡す
eval_sequence = function (exps, env, k) {
	if (exps == null || exps.length === 0) {
		return bounce(function () { return k(undefined); });
	}
	if (exps.length === 1) {
		return seval(exps[0], env, k);
	}
	return seval(exps[0], env, function (ignored) {
		return eval_sequence(cdr(exps), env, k);
	});
};

// 引数列を左から順に評価し、評価済み配列を継続へ渡す
eval_list = function (exps, env, k) {
	if (exps == null || exps.length === 0) {
		return bounce(function () { return k([]); });
	}
	return seval(exps[0], env, function (first) {
		return eval_list(cdr(exps), env, function (rest) {
			return bounce(function () { return k([first].concat(rest)); });
		});
	});
};

// マクロ展開: 本体を評価して新しい式を得て、それを継続へ渡す
expand_macro = function (macro, argExprs, k) {
	var macroEnv = extend_env(macro[1], argExprs, macro[3]);
	return eval_sequence(macro[2], macroEnv, k);
};

eval_application = function (exp, env, k) {
	var op = operator(exp);
	// マクロ呼び出しか? (演算子がシンボル/シンボル名文字列の場合)
	if (op instanceof Symbol || typeof op === 'string') {
		var maybeMacro = env.tryFind(op);
		if (maybeMacro && ismacro(maybeMacro)) {
			return expand_macro(maybeMacro, operands(exp), function (expanded) {
				return seval(expanded, env, k);
			});
		}
	}
	// 演算子を評価
	var evalOperator;
	if (op instanceof Symbol) {
		evalOperator = function (cont) { return bounce(function () { return cont(env.find(op)); }); };
	} else if (typeof op === 'string') {
		// quote 等でシンボルが文字列化して演算子位置に来た場合も変数として解決
		evalOperator = function (cont) { return bounce(function () { return cont(env.find(op)); }); };
	} else {
		evalOperator = function (cont) { return seval(op, env, cont); };
	}
	return evalOperator(function (proc) {
		return eval_list(operands(exp), env, function (args) {
			return s_apply(proc, args, k);
		});
	});
};

function s_apply(procedure, args, k) {
	if (isprimitive_procedure(procedure)) {
		return apply_primitive_procedure(procedure, args, k);
	}
	if (iscontinuation(procedure)) {
		// 継続呼び出し: 現在の継続 k を捨て、捕捉済みの継続へジャンプする
		var capturedK = procedure[1];
		var value = args.length ? args[0] : undefined;
		return bounce(function () { return capturedK(value); });
	}
	if (iscompound_procedure(procedure)) {
		var newEnv = extend_env(
			procedure_parameters(procedure),
			args,
			procedure_environment(procedure));
		return eval_sequence(procedure_body(procedure), newEnv, k);
	}
	return error("Unknown procedure type -- APPLY");
}

// 旧 API 互換: 同期的に評価して値を返すラッパー(トランポリンで駆動)
scheme_eval = function (sexp, env) {
	if (env == undefined) {
		env = theGlobalEnv;
	}
	return trampoline(seval(sexp, env, function (v) { return v; }));
};

error = function (error) {
	throw error;
};

// プリミティブとグローバル定数を登録
(function () {
	for (var i in primitive_procedures) {
		regist_global(i, ["primitive", primitive_procedures[i]]);
	}
	regist_global('#t', true);
	regist_global('#f', false);
	regist_global('nil', null);
})();


/**
 * parser
 * S式をリストにしてevalする
 *
 */

scheme = function (code) {
	var tokenizer = new Tokenizer(code);
	var result = null;
	try {
		// 複数のトップレベル式を順に評価し、最後の結果を返す。
		// halt 継続は値をそのまま返し、トランポリンを停止させる。
		while (tokenizer.value() !== "" && tokenizer.value() != null) {
			var tree = parse(tokenizer);
			result = trampoline(seval(tree, theGlobalEnv, function (v) { return v; }));
		}
	} catch (e) {
		result = e;
	}
	return result;
};

Tokenizer = function (code) {
	this.point = 0;
	this.code = code;
	this.current = null;
	this.next();
};

Tokenizer.prototype.value = function () {
	return this.current;
};

Tokenizer.prototype.next = function () {
	var inQuote = false;
	var token = "";
	while (this.code.charAt(this.point) in { "\n": 0, " ": 0 }) {
		this.point++;
	}
	loop:
	for (var i = this.point; i < this.code.length; i++) {
		var c = this.code.charAt(i);

		switch (c) {
			case "\"":
				inQuote = !inQuote;
				token += c;
				break;
			case "(":
			case ")":
			case "'":
			case "`":
				if (token.length > 0)
					break loop;
				i++;
				if (inQuote) {
					token += c;
					break;
				} else {
					token = c;
					break loop;
				}
			case ",":
				// 文字列内ならただの文字
				if (inQuote) {
					token += c;
					break;
				}
				if (token.length > 0)
					break loop;
				// ,@ (unquote-splicing) か , (unquote) か
				if (this.code.charAt(i + 1) === "@") {
					i += 2;
					token = ",@";
					break loop;
				}
				i++;
				token = c;
				break loop;
			case " ":
			case "\n":
				while (!inQuote && this.code.charAt(i++) in { "\n": 0, " ": 0 })
					break loop;
			default:
				token += c;
		}
	}
	this.point = i;
	this.current = token;

	// #t / #f : 真偽値リテラル
	if (token === "#t" || token === "#true") {
		return this.current = true;
	}
	if (token === "#f" || token === "#false") {
		return this.current = false;
	}
	// #\x : 文字リテラル (#\a #\space #\newline ...)
	if (token.length >= 3 && token.charAt(0) === "#" && token.charAt(1) === "\\") {
		return this.current = char_from_token(token);
	}

	//symbolのチェック
	if (is_Number(token)) {
		this.current = Number(token);
	}
	if (is_Symbol(token)) {
		return this.current = new Symbol(token);

	}

	return token;
};

// "#\a" / "#\space" などを Char に変換する
char_from_token = function (token) {
	var name = token.slice(2);
	var named = {
		'space': ' ', 'newline': '\n', 'tab': '\t', 'return': '\r',
		'nul': '\0', 'null': '\0', 'delete': '\u007f', 'rubout': '\u007f',
		'altmode': '\u001b', 'escape': '\u001b', 'backspace': '\b', 'page': '\f',
		'linefeed': '\n'
	};
	if (named[name.toLowerCase()] !== undefined) {
		return new Char(named[name.toLowerCase()]);
	}
	return new Char(name.charAt(0));
};
function Symbol(str) {
	this.tag = TAG_SYMBOL;
	this.name = str;
}
is_Number = function (token) {
	if (token === "") return false;
	if (!isNaN(Number(token))) {
		return true;
	}
};
is_Symbol = function (token) {
	if (isNaN(Number(token))) {
		if (token.match(new RegExp("\"")) != null) {
			return false;
		}
	} else {
		return false;
	}

	//特殊記号のぞく
	//()
	//'はテキスト
	if (atom[token]) {
		return false;
	}
	return true;
};
atom = {
	"(": true,
	")": true,
	"'": true,
	"define": true,
	"define-macro": true,
	"set!": true,
	"lambda": true,
	"begin": true,
	"cond": true,
	"if": true,
	"else": true,
	"quote": true,
	"let": true,
	"let*": true,
	"letrec": true,
	"do": true,
	"and": true,
	"or": true,
	"case": true,
	"delay": true,
	"`": true,
	",": true,
	",@": true
};

parse = function (tokenizer) {

	var ret;
	if (tokenizer.value() == "(") {
		if (tokenizer.next() == ")") {
			tokenizer.next();
			ret = null;
		} else {
			ret = new Array();
			// 厳密比較を使う: 数値 0 は loose比較だと 0 == "" が真になり要素が脱落する
			while (tokenizer.value() !== "" && tokenizer.value() !== ")") {
				ret[ret.length] = parse(tokenizer);
			}
			if (tokenizer.value() == ")")
				tokenizer.next();
		}
	} else if (tokenizer.value() == "\'") {
		tokenizer.next();
		ret = ["quote", parse(tokenizer)];
	} else if (tokenizer.value() == "`") {
		tokenizer.next();
		ret = ["quasiquote", parse(tokenizer)];
	} else if (tokenizer.value() == ",") {
		tokenizer.next();
		ret = ["unquote", parse(tokenizer)];
	} else if (tokenizer.value() == ",@") {
		tokenizer.next();
		ret = ["unquote-splicing", parse(tokenizer)];
	} else {
		ret = tokenizer.value();

		tokenizer.next();
	}
	return ret;
};

// ------------------------------------------------------------------
// ブラウザ連携: <script type="text/scheme"> ... </script> を自動実行
//   ページ内の Scheme スクリプトブロックを上から順に評価する。
//   src 属性があれば外部ファイルを読み込んで実行する。
//   例:
//     <script src="schemInp.js"></script>
//     <script type="text/scheme">
//       (display (+ 1 2 3))
//     </script>
//     <script type="text/scheme" src="hello.scm"></script>
// ------------------------------------------------------------------
var SCHEME_SCRIPT_TYPES = {
	'text/scheme': true,
	'text/x-scheme': true,
	'application/scheme': true,
	'text/lisp': true
};

// 外部ファイルを同期取得する (スクリプトの実行順序を保つため)
fetch_scheme_source = function (url) {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', url, false);
	xhr.send(null);
	if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 0) {
		return xhr.responseText;
	}
	throw ('Failed to load scheme source: ' + url + ' (status ' + xhr.status + ')');
};

// ページ内の Scheme スクリプトを順番に実行する
run_scheme_scripts = function () {
	var scripts = document.getElementsByTagName('script');
	// getElementsByTagName は live なので配列にコピーしてから処理する
	var list = [];
	for (var i = 0; i < scripts.length; i++) {
		var type = (scripts[i].type || '').toLowerCase();
		if (SCHEME_SCRIPT_TYPES[type]) {
			list.push(scripts[i]);
		}
	}
	for (var j = 0; j < list.length; j++) {
		var el = list[j];
		if (el.getAttribute('data-scheme-evaluated')) {
			continue;
		}
		var code = el.src ? fetch_scheme_source(el.src) : (el.textContent || el.innerText || '');
		var result = scheme(code);
		el.setAttribute('data-scheme-evaluated', 'true');
		// 評価結果を data 属性に残しておく (デバッグ用)
		try {
			el.setAttribute('data-scheme-result', String(result));
		} catch (e) { /* ignore */ }
	}
};

// DOM 構築完了後に自動実行する (ブラウザ環境のときのみ)
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run_scheme_scripts);
	} else {
		run_scheme_scripts();
	}
}

// Node.js から利用できるようにエクスポート (ブラウザ環境では無視される)
if (typeof module !== 'undefined' && module.exports) {
	module.exports = { scheme: scheme, scheme_eval: scheme_eval };
}
