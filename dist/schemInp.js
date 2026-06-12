/**
 * scheme.js — ビルド成果物 (scripts/build.js から生成)
 * ソースは src/ 以下を編集してください。
 * Copyright (c) 2014 Shuichi Yukimoto. MIT License.
 */

// ===== core.js =====
// core.js — Pair / リスト操作 / トランポリン
var TAG_CONS = 0;
var TAG_SYMBOL = 1;
var TAG_NUM = 2;

// ------------------------------------------------------------------
// 基本のリスト操作 (リストは JavaScript の配列で表現する)
// ------------------------------------------------------------------
// 本物のペア(cons セル)。実行時のリストデータはすべてこの Pair で表す。
// 空リスト '() は JavaScript の null。内部 AST(コード)は従来どおり配列。
function Pair(a, d) {
	this.car = a;
	this.cdr = d;
}

// car/cdr は「データ(Pair)」と「AST(配列)」の両方を受け付ける(polymorphic)。
// これにより評価器は配列 AST を従来どおり走査でき、データ操作は Pair で行える。
var car = function (x) {
	if (x instanceof Pair) return x.car;
	if (x == null) return undefined;
	return x[0];
};
var cdr = function (x) {
	if (x instanceof Pair) return x.cdr;
	if (x == null) return null;
	return x.slice(1);
};
var cadr = function (x) {
	return car(cdr(x));
};

// cons は常に本物の Pair を返す(データ構築)
var cons = function (a, b) {
	if (arguments.length != 2)
		throw ("cons requires 2 arguments");
	return new Pair(a, b);
};

// --- リスト/配列 変換ヘルパ --------------------------------------
// JS 配列 -> Pair リスト(末尾 tail を指定可能。省略時は '() = null)
function array_to_list(arr, tail) {
	var lst = (tail === undefined) ? null : tail;
	for (var i = arr.length - 1; i >= 0; i--) lst = new Pair(arr[i], lst);
	return lst;
}
// Pair リスト -> JS 配列(不完全リストの末尾は無視)
function list_to_array(lst) {
	var a = [];
	while (lst instanceof Pair) { a.push(lst.car); lst = lst.cdr; }
	return a;
}
function list_length(lst) {
	var n = 0;
	while (lst instanceof Pair) { n++; lst = lst.cdr; }
	return n;
}
// Pair リスト同士の append(最後の引数以外をコピーして連結する)
function append_pair(a, b) {
	if (!(a instanceof Pair)) return b;
	var arr = list_to_array(a);
	return array_to_list(arr, b);
}

// 配列 AST(引用データ)-> 本物の Pair データへ変換(quote/quasiquote 境界)
function to_datum(d) {
	if (d === null) return null;
	if (Array.isArray(d)) {
		var lst = null;
		for (var i = d.length - 1; i >= 0; i--) lst = new Pair(to_datum(d[i]), lst);
		return lst;
	}
	if (d instanceof Pair) {           // パーサが生成したドット対(不完全リスト)
		return new Pair(to_datum(d.car), to_datum(d.cdr));
	}
	if (typeof d === 'string') {        // 文字列リテラルの引用符を除去(show_text と同様)
		return d.replace(/\"/g, '');
	}
	return d;                           // Symbol / 数値 / 文字 / 真偽値 等はそのまま
}

// Pair データ -> 配列 AST へ変換(eval / マクロ展開結果を評価器に渡すため)
function to_ast(d) {
	if (d instanceof Pair) {
		var arr = [];
		var p = d;
		while (p instanceof Pair) { arr.push(to_ast(p.car)); p = p.cdr; }
		return arr;
	}
	return d;
}

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


// ===== env.js =====
// env.js — 環境 / クロージャー / lambda
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
	// 可変長: (lambda args ...) のように仮引数が 1 個のシンボル -> 全引数をリストで束縛
	if (parameters instanceof Symbol) {
		newEnv.add(parameters.name, array_to_list(args));
		return newEnv;
	}
	// 不完全な仮引数リスト: (lambda (a b . rest) ...) -> rest に残りをリストで束縛
	if (parameters instanceof Pair) {
		var p = parameters, i = 0;
		while (p instanceof Pair) {
			var nm = (p.car instanceof Symbol) ? p.car.name : p.car;
			newEnv.add(nm, args[i++]);
			p = p.cdr;
		}
		if (p != null) {
			var restName = (p instanceof Symbol) ? p.name : p;
			newEnv.add(restName, array_to_list(args.slice(i)));
		}
		return newEnv;
	}
	// 通常の仮引数リスト(配列 AST)
	for (var j = 0; j < parameters.length; j++) {
		var name = (parameters[j] instanceof Symbol) ? parameters[j].name : parameters[j];
		newEnv.add(name, args[j]);
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
	// 引用データを「本物の Pair」へ変換して返す(リストは cons セルになる)
	return to_datum(car(cdr(exp)));
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


// ===== continuations.js =====
// continuations.js — dynamic-wind / call/cc 基盤
var windStack = [];

function wind_stack_copy() { return windStack.slice(); }

function wind_transfer(targetStack, k) {
	var current = windStack;
	var common = 0;
	while (common < current.length && common < targetStack.length && current[common] === targetStack[common]) {
		common++;
	}
	var runAfters = function (idx) {
		if (idx <= common) {
			return wind_push_befores(targetStack, common, k);
		}
		var frame = windStack.pop();
		return s_apply(frame.after, [], function () { return runAfters(idx - 1); });
	};
	return runAfters(current.length);
}

function wind_push_befores(targetStack, start, k) {
	if (start >= targetStack.length) {
		return bounce(function () { return k(); });
	}
	return s_apply(targetStack[start].before, [], function () {
		windStack.push(targetStack[start]);
		return wind_push_befores(targetStack, start + 1, k);
	});
}

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
	var continuation = ["continuation", k, wind_stack_copy()];
	return s_apply(proc, [continuation], k);
};
callcc.cps = true;


// ===== primitives.js =====
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



// ===== numbers.js =====
// numbers.js — 数値タワー / NUMERIC_PRIMITIVES
// ==================================================================
// 数値タワー
//   exact: Rational(多倍長有理数。整数は分母 1)  /  inexact: JavaScript の number(浮動小数)
//   complex: Complex(実部・虚部はそれぞれ実数)。虚部が exact 0 なら実数へ正規化。
// ==================================================================
function Rational(n, d) { this.n = n; this.d = d; } // n,d は BigInt(正規化済み・d>0)

function big_abs(a) { return a < 0n ? -a : a; }
function big_gcd(a, b) { a = big_abs(a); b = big_abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }
function make_rat(n, d) {
	if (d === 0n) throw 'division by zero';
	if (d < 0n) { n = -n; d = -d; }
	var g = big_gcd(n, d);
	if (g > 1n) { n = n / g; d = d / g; }
	return new Rational(n, d);
}
function exact_int(bi) { return new Rational(bi, 1n); }

function is_exact(x) { return x instanceof Rational; }
function is_inexact(x) { return typeof x === 'number'; }
function is_scheme_number(x) { return is_exact(x) || is_inexact(x) || (x instanceof Complex); }
function ck_num(x, who) { if (!is_scheme_number(x)) throw ((who || 'number') + ': not a number: ' + scheme_repr(x, true)); return x; }

function rat_to_float(r) { return Number(r.n) / Number(r.d); }
function to_float(x) { return is_exact(x) ? rat_to_float(x) : x; }
function to_jsint(x) { return is_exact(x) ? Number(x.n / x.d) : Math.trunc(x); }
function num_is_integer(x) { return is_exact(x) ? (x.d === 1n) : (typeof x === 'number' && isFinite(x) && Math.floor(x) === x); }

function float_to_exact(x) {
	if (!isFinite(x)) throw 'cannot convert to exact: ' + x;
	if (Number.isInteger(x)) return exact_int(BigInt(x));
	var s = x.toString();
	if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) { s = x.toFixed(20).replace(/0+$/, ''); }
	var neg = false;
	if (s.charAt(0) === '-') { neg = true; s = s.slice(1); }
	var dot = s.indexOf('.');
	if (dot < 0) { var bi = BigInt(s); return exact_int(neg ? -bi : bi); }
	var digits = s.length - dot - 1;
	var n = BigInt(s.replace('.', ''));
	if (neg) n = -n;
	return make_rat(n, 10n ** BigInt(digits));
}
function to_exact(x) { return is_exact(x) ? x : float_to_exact(x); }

// --- 実数(exact 有理数 / inexact 浮動小数)演算 ---
function real_add(a, b) { if (is_exact(a) && is_exact(b)) return make_rat(a.n * b.d + b.n * a.d, a.d * b.d); return to_float(a) + to_float(b); }
function real_sub(a, b) { if (is_exact(a) && is_exact(b)) return make_rat(a.n * b.d - b.n * a.d, a.d * b.d); return to_float(a) - to_float(b); }
function real_mul(a, b) { if (is_exact(a) && is_exact(b)) return make_rat(a.n * b.n, a.d * b.d); return to_float(a) * to_float(b); }
function real_div(a, b) {
	if (is_exact(a) && is_exact(b)) { if (b.n === 0n) throw 'division by zero'; return make_rat(a.n * b.d, a.d * b.n); }
	return to_float(a) / to_float(b);
}
function real_neg(a) { return is_exact(a) ? new Rational(-a.n, a.d) : -a; }
function real_num_eq(a, b) {
	if (is_exact(a) && is_exact(b)) return a.n === b.n && a.d === b.d;
	if (is_inexact(a) && is_inexact(b)) return a === b;
	if (is_exact(a) && is_inexact(b)) return rat_to_float(a) === b;
	if (is_inexact(a) && is_exact(b)) return a === rat_to_float(b);
	return false;
}
function is_real_zero(x) { return (is_exact(x) && x.n === 0n) || (is_inexact(x) && x === 0); }

// --- 複素数 ---
function Complex(re, im) { this.re = re; this.im = im; } // re, im は実数(Rational または number)
function is_complex(x) { return x instanceof Complex; }
function is_real_num(x) { return is_exact(x) || is_inexact(x); }
// 浮動小数のごく小さい値を 0 とみなす(複素数演算の丸め誤差対策)
function scrub_tiny(x) {
	if (typeof x === 'number' && Math.abs(x) < 1e-14) return 0;
	return x;
}
// 虚部が 0 なら実数に正規化する
function make_complex(re, im) {
	re = scrub_tiny(re); im = scrub_tiny(im);
	if (is_real_zero(im) || (typeof im === 'number' && im === 0)) return re;
	return new Complex(re, im);
}
function cplx_re(x) { return is_complex(x) ? x.re : x; }
function cplx_im(x) { return is_complex(x) ? x.im : exact_int(0n); }
function complex_magnitude(x) { var r = to_float(cplx_re(x)), i = to_float(cplx_im(x)); return Math.sqrt(r * r + i * i); }
function complex_angle(x) { return Math.atan2(to_float(cplx_im(x)), to_float(cplx_re(x))); }

// 複素数の超越関数(inexact 結果)
function complex_exp(z) {
	var a = to_float(cplx_re(z)), b = to_float(cplx_im(z));
	var ea = Math.exp(a);
	return make_complex(ea * Math.cos(b), ea * Math.sin(b));
}
function complex_log(z) {
	var m = complex_magnitude(z);
	if (m === 0) throw 'log: undefined for 0';
	return make_complex(Math.log(m), complex_angle(z)); // 主値
}
function complex_sin(z) {
	var a = to_float(cplx_re(z)), b = to_float(cplx_im(z));
	return make_complex(Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b));
}
function complex_cos(z) {
	var a = to_float(cplx_re(z)), b = to_float(cplx_im(z));
	return make_complex(Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b));
}
function complex_tan(z) { return n_div(complex_sin(z), complex_cos(z)); }
// asin(z) = -i * log(i*z + sqrt(1 - z^2))
function complex_asin(z) {
	var iz = make_complex(n_neg(cplx_im(z)), cplx_re(z)); // i*z
	var one = exact_int(1n);
	var inner = n_add(iz, complex_sqrt(n_sub(one, n_mul(z, z))));
	return n_mul(make_complex(exact_int(0n), exact_int(-1n)), complex_log(inner));
}
function complex_acos(z) {
	// acos(z) = pi/2 - asin(z)
	var halfPi = Math.PI / 2;
	return n_sub(make_complex(halfPi, 0), complex_asin(z));
}
function complex_atan(z) {
	// atan(z) = i/2 * log((i+z)/(i-z))
	var i = make_complex(exact_int(0n), exact_int(1n));
	var num = n_add(i, z);
	var den = n_sub(i, z);
	return n_mul(make_complex(0, 0.5), complex_log(n_div(num, den)));
}
function complex_sqrt(z) {
	var m = complex_magnitude(z);
	if (m === 0) return make_complex(exact_int(0n), exact_int(0n));
	var a = complex_angle(z) / 2;
	var sm = Math.sqrt(m);
	return make_complex(sm * Math.cos(a), sm * Math.sin(a));
}
function complex_expt(base, ex) {
	// base^ex = exp(ex * log(base))  (主値)
	if (is_complex(ex) || is_complex(base)) {
		return complex_exp(n_mul(ex, complex_log(base)));
	}
	// 実数指数は polar 形式
	var m = complex_magnitude(base), a = complex_angle(base);
	var e = to_float(ex);
	return make_complex(Math.pow(m, e) * Math.cos(a * e), Math.pow(m, e) * Math.sin(a * e));
}

// --- 複素数対応の算術ディスパッチ ---
function n_add(a, b) {
	if (is_complex(a) || is_complex(b)) return make_complex(real_add(cplx_re(a), cplx_re(b)), real_add(cplx_im(a), cplx_im(b)));
	return real_add(a, b);
}
function n_sub(a, b) {
	if (is_complex(a) || is_complex(b)) return make_complex(real_sub(cplx_re(a), cplx_re(b)), real_sub(cplx_im(a), cplx_im(b)));
	return real_sub(a, b);
}
function n_mul(a, b) {
	if (is_complex(a) || is_complex(b)) {
		var ar = cplx_re(a), ai = cplx_im(a), br = cplx_re(b), bi = cplx_im(b);
		return make_complex(real_sub(real_mul(ar, br), real_mul(ai, bi)), real_add(real_mul(ar, bi), real_mul(ai, br)));
	}
	return real_mul(a, b);
}
function n_div(a, b) {
	if (is_complex(a) || is_complex(b)) {
		var ar = cplx_re(a), ai = cplx_im(a), br = cplx_re(b), bi = cplx_im(b);
		var den = real_add(real_mul(br, br), real_mul(bi, bi));
		return make_complex(real_div(real_add(real_mul(ar, br), real_mul(ai, bi)), den),
			real_div(real_sub(real_mul(ai, br), real_mul(ar, bi)), den));
	}
	return real_div(a, b);
}
function n_neg(a) { if (is_complex(a)) return make_complex(real_neg(a.re), real_neg(a.im)); return real_neg(a); }
function n_cmp(a, b) {
	if (is_complex(a) || is_complex(b)) throw 'cannot order complex numbers';
	if (is_exact(a) && is_exact(b)) { var l = a.n * b.d, r = b.n * a.d; return l < r ? -1 : (l > r ? 1 : 0); }
	var x = to_float(a), y = to_float(b); return x < y ? -1 : (x > y ? 1 : 0);
}
function num_eq(a, b) {
	if (is_complex(a) || is_complex(b)) return real_num_eq(cplx_re(a), cplx_re(b)) && real_num_eq(cplx_im(a), cplx_im(b));
	if (is_exact(a) && is_exact(b)) return a.n === b.n && a.d === b.d;
	if (is_inexact(a) && is_inexact(b)) return a === b;
	return false; // exact と inexact は eqv? 的には非同値
}

function big_pow(base, e) { var r = 1n; while (e > 0n) { if (e & 1n) r *= base; base *= base; e >>= 1n; } return r; }
function big_floordiv(n, d) { var q = n / d, r = n % d; if (r !== 0n && (r < 0n)) q -= 1n; return q; }

// 数値の表示
function num_repr(x) {
	if (is_exact(x)) return x.d === 1n ? x.n.toString() : (x.n.toString() + '/' + x.d.toString());
	if (typeof x === 'number') {
		if (Number.isNaN(x)) return '+nan.0';
		if (x === Infinity) return '+inf.0';
		if (x === -Infinity) return '-inf.0';
		if (Number.isInteger(x)) return x.toString() + '.';
		return x.toString();
	}
	if (x instanceof Complex) return complex_repr(x);
	return String(x);
}
function complex_repr(x) {
	var reZero = is_real_zero(x.re);
	var out = reZero ? '' : num_repr(x.re);
	var imv = to_float(x.im);
	var imStr;
	if (imv === 1) imStr = '+i';
	else if (imv === -1) imStr = '-i';
	else { imStr = num_repr(x.im); if (imStr.charAt(0) !== '-' && imStr.charAt(0) !== '+') imStr = '+' + imStr; imStr += 'i'; }
	if (reZero && imStr.charAt(0) === '+') imStr = imStr.slice(1);
	return out + imStr;
}

// 文字列を数値に変換(数値でなければ null)。リーダと string->number で共用。
function parse_number(token) {
	if (token === '' || token == null) return null;
	var radix = 10, exactness = null, t = token;
	// 接頭辞 #e #i #x #o #b #d
	while (t.length >= 2 && t.charAt(0) === '#') {
		var p = t.charAt(1).toLowerCase();
		if (p === 'e') exactness = 'e';
		else if (p === 'i') exactness = 'i';
		else if (p === 'x') radix = 16;
		else if (p === 'o') radix = 8;
		else if (p === 'b') radix = 2;
		else if (p === 'd') radix = 10;
		else return null;
		t = t.slice(2);
	}
	var result = parse_complex_token(t, radix);
	if (result === null) return null;
	if (exactness === 'i') return apply_exactness(result, to_float);
	if (exactness === 'e') return apply_exactness(result, to_exact);
	return result;
}

function apply_exactness(x, conv) {
	if (x instanceof Complex) return make_complex(conv(x.re), conv(x.im));
	return conv(x);
}

// 実数 1 個をパース(整数 / 有理数 / 小数 / inf / nan / 基数指定)。数値でなければ null。
function parse_real_token(t, radix) {
	if (t === '+inf.0') return Infinity;
	if (t === '-inf.0') return -Infinity;
	if (t === '+nan.0' || t === '-nan.0') return NaN;
	if (radix === 10) {
		if (/^[+-]?\d+\/\d+$/.test(t)) {
			var parts = t.replace('+', '').split('/');
			return make_rat(BigInt(parts[0]), BigInt(parts[1]));
		}
		if (/^[+-]?\d+$/.test(t)) return exact_int(BigInt(t));
		if (/^[+-]?(\d+\.\d*|\.\d+|\d+)(e[+-]?\d+)?$/i.test(t) && /[.e]/i.test(t)) return Number(t);
		return null;
	}
	var re = { 16: /^[+-]?[0-9a-fA-F]+$/, 8: /^[+-]?[0-7]+$/, 2: /^[+-]?[01]+$/ }[radix];
	if (re && re.test(t)) {
		var neg = t.charAt(0) === '-';
		var body = t.replace(/^[+-]/, '');
		var v = 0n, R = BigInt(radix);
		for (var i = 0; i < body.length; i++) v = v * R + BigInt(parseInt(body.charAt(i), radix));
		return exact_int(neg ? -v : v);
	}
	return null;
}

// 複素数(末尾 i)または実数をパース。
function parse_complex_token(t, radix) {
	if (t.charAt(t.length - 1) !== 'i') return parse_real_token(t, radix); // 実数
	if (t === 'i') return null;   // 単独の i はシンボル
	var bodyAll = t.slice(0, -1); // 末尾 i を除く
	// 虚部の符号位置を探す(先頭以外、かつ指数 e の直後でない + / -)
	var split = -1;
	for (var i = bodyAll.length - 1; i > 0; i--) {
		var c = bodyAll.charAt(i);
		if ((c === '+' || c === '-')) {
			var prev = bodyAll.charAt(i - 1).toLowerCase();
			if (prev === 'e') continue;
			split = i; break;
		}
	}
	var reStr, imStr;
	if (split < 0) { reStr = null; imStr = bodyAll; }       // 純虚数 (例: 4i, +4i, -i)
	else { reStr = bodyAll.slice(0, split); imStr = bodyAll.slice(split); }
	// 虚部の単位 (+i / -i / i)
	var imNum;
	if (imStr === '' || imStr === '+') imNum = exact_int(1n);
	else if (imStr === '-') imNum = exact_int(-1n);
	else { imNum = parse_real_token(imStr, radix); if (imNum === null) return null; }
	var reNum;
	if (reStr === null) reNum = exact_int(0n);
	else { reNum = parse_real_token(reStr, radix); if (reNum === null) return null; }
	return make_complex(reNum, imNum);
}

// --- 数値プリミティブ(既存の算術系を上書き) ----------------------
var NUMERIC_PRIMITIVES = {
	'+': function (args) { var r = exact_int(0n); for (var i = 0; i < args.length; i++) r = n_add(r, ck_num(args[i], '+')); return r; },
	'*': function (args) { var r = exact_int(1n); for (var i = 0; i < args.length; i++) r = n_mul(r, ck_num(args[i], '*')); return r; },
	'-': function (args) {
		if (args.length === 0) throw "'-' requires at least 1 argument.";
		if (args.length === 1) return n_neg(ck_num(args[0], '-'));
		var r = ck_num(args[0], '-');
		for (var i = 1; i < args.length; i++) r = n_sub(r, ck_num(args[i], '-'));
		return r;
	},
	'/': function (args) {
		if (args.length === 0) throw "'/' requires at least 1 argument.";
		if (args.length === 1) return n_div(exact_int(1n), ck_num(args[0], '/'));
		var r = ck_num(args[0], '/');
		for (var i = 1; i < args.length; i++) r = n_div(r, ck_num(args[i], '/'));
		return r;
	},
	'=': function (args) { for (var i = 1; i < args.length; i++) if (!num_eq(ck_num(args[i - 1], '='), ck_num(args[i], '='))) return false; return true; },
	'<': function (args) { for (var i = 1; i < args.length; i++) if (!(n_cmp(args[i - 1], args[i]) < 0)) return false; return true; },
	'>': function (args) { for (var i = 1; i < args.length; i++) if (!(n_cmp(args[i - 1], args[i]) > 0)) return false; return true; },
	'<=': function (args) { for (var i = 1; i < args.length; i++) if (!(n_cmp(args[i - 1], args[i]) <= 0)) return false; return true; },
	'>=': function (args) { for (var i = 1; i < args.length; i++) if (!(n_cmp(args[i - 1], args[i]) >= 0)) return false; return true; },

	'abs': function (args) { var x = ck_num(args[0], 'abs'); return is_exact(x) ? new Rational(big_abs(x.n), x.d) : Math.abs(x); },
	'min': function (args) { var m = ck_num(args[0], 'min'), inx = is_inexact(m); for (var i = 1; i < args.length; i++) { var a = ck_num(args[i], 'min'); if (is_inexact(a)) inx = true; if (n_cmp(a, m) < 0) m = a; } return inx ? to_float(m) : m; },
	'max': function (args) { var m = ck_num(args[0], 'max'), inx = is_inexact(m); for (var i = 1; i < args.length; i++) { var a = ck_num(args[i], 'max'); if (is_inexact(a)) inx = true; if (n_cmp(a, m) > 0) m = a; } return inx ? to_float(m) : m; },
	'quotient': function (args) { var a = args[0], b = args[1]; if (is_exact(a) && is_exact(b)) { if (b.n === 0n) throw 'division by zero'; return exact_int(a.n / b.n); } return Math.trunc(to_float(a) / to_float(b)); },
	'remainder': function (args) { var a = args[0], b = args[1]; if (is_exact(a) && is_exact(b)) { if (b.n === 0n) throw 'division by zero'; return exact_int(a.n % b.n); } var af = to_float(a), bf = to_float(b); return af - Math.trunc(af / bf) * bf; },
	'modulo': function (args) { var a = args[0], b = args[1]; if (is_exact(a) && is_exact(b)) { if (b.n === 0n) throw 'division by zero'; return exact_int(((a.n % b.n) + b.n) % b.n); } var af = to_float(a), bf = to_float(b); return ((af % bf) + bf) % bf; },
	'gcd': function (args) { if (args.length === 0) return exact_int(0n); var g = big_abs(to_exact(args[0]).n); for (var i = 1; i < args.length; i++) g = big_gcd(g, to_exact(args[i]).n); return exact_int(g); },
	'lcm': function (args) { if (args.length === 0) return exact_int(1n); var l = big_abs(to_exact(args[0]).n); for (var i = 1; i < args.length; i++) { var b = big_abs(to_exact(args[i]).n); l = (l === 0n || b === 0n) ? 0n : (l / big_gcd(l, b)) * b; } return exact_int(l); },
	'floor': function (args) { var x = ck_num(args[0], 'floor'); return is_exact(x) ? exact_int(big_floordiv(x.n, x.d)) : Math.floor(x); },
	'ceiling': function (args) { var x = ck_num(args[0], 'ceiling'); return is_exact(x) ? exact_int(-big_floordiv(-x.n, x.d)) : Math.ceil(x); },
	'truncate': function (args) { var x = ck_num(args[0], 'truncate'); return is_exact(x) ? exact_int(x.n / x.d) : Math.trunc(x); },
	'round': function (args) {
		var x = ck_num(args[0], 'round');
		if (is_inexact(x)) { var r = Math.round(x); if (Math.abs(x - Math.trunc(x)) === 0.5 && r % 2 !== 0) r -= Math.sign(x); return r; }
		var f = big_floordiv(x.n, x.d); var rem = x.n - f * x.d; var twice = rem * 2n;
		if (twice < x.d) return exact_int(f);
		if (twice > x.d) return exact_int(f + 1n);
		return exact_int((f % 2n === 0n) ? f : f + 1n);
	},
	'sqrt': function (args) {
		var x = ck_num(args[0], 'sqrt');
		if (is_complex(x)) return complex_sqrt(x);
		if (is_exact(x) && x.d === 1n && x.n >= 0n) { var r = BigInt(Math.floor(Math.sqrt(Number(x.n)))); for (var k = r - 1n; k <= r + 1n; k++) { if (k >= 0n && k * k === x.n) return exact_int(k); } }
		var f = to_float(x);
		if (f < 0) return make_complex(0, Math.sqrt(-f));
		return Math.sqrt(f);
	},
	'expt': function (args) {
		var base = ck_num(args[0], 'expt'), ex = ck_num(args[1], 'expt');
		if (is_complex(base) || is_complex(ex)) {
			// 複素数底・整数指数は正確な繰り返し乗算を優先
			if (is_complex(base) && is_exact(ex) && ex.d === 1n && !is_complex(ex)) {
				var e = ex.n, neg = e < 0n; if (neg) e = -e;
				var acc = exact_int(1n); for (var bi = 0n; bi < e; bi++) acc = n_mul(acc, base);
				return neg ? n_div(exact_int(1n), acc) : acc;
			}
			return complex_expt(base, ex);
		}
		if (is_exact(base) && is_exact(ex) && ex.d === 1n) {
			if (ex.n >= 0n) return make_rat(big_pow(base.n, ex.n), big_pow(base.d, ex.n));
			var e2 = -ex.n; return make_rat(big_pow(base.d, e2), big_pow(base.n, e2));
		}
		var bf = to_float(base);
		if (bf < 0 && !Number.isInteger(to_float(ex))) return complex_expt(base, ex); // 負底・非整数指数 -> 複素数
		return Math.pow(bf, to_float(ex));
	},
	'exp': function (args) { var x = ck_num(args[0], 'exp'); return is_complex(x) ? complex_exp(x) : Math.exp(to_float(x)); },
	'log': function (args) {
		if (args.length > 1) {
			var base = ck_num(args[1], 'log');
			if (is_complex(args[0]) || is_complex(base)) return n_div(complex_log(ck_num(args[0], 'log')), complex_log(base));
			return Math.log(to_float(args[0])) / Math.log(to_float(base));
		}
		var x = ck_num(args[0], 'log');
		if (is_complex(x)) return complex_log(x);
		if (to_float(x) < 0) return complex_log(make_complex(x, exact_int(0n))); // 負の実数 -> 主値
		return Math.log(to_float(x));
	},
	'sin': function (args) { var x = ck_num(args[0], 'sin'); return is_complex(x) ? complex_sin(x) : Math.sin(to_float(x)); },
	'cos': function (args) { var x = ck_num(args[0], 'cos'); return is_complex(x) ? complex_cos(x) : Math.cos(to_float(x)); },
	'tan': function (args) { var x = ck_num(args[0], 'tan'); return is_complex(x) ? complex_tan(x) : Math.tan(to_float(x)); },
	'asin': function (args) { var x = ck_num(args[0], 'asin'); return is_complex(x) ? complex_asin(x) : Math.asin(to_float(x)); },
	'acos': function (args) { var x = ck_num(args[0], 'acos'); return is_complex(x) ? complex_acos(x) : Math.acos(to_float(x)); },
	'atan': function (args) {
		if (args.length > 1) return Math.atan2(to_float(args[0]), to_float(args[1])); // 2引数は実数
		var x = ck_num(args[0], 'atan');
		return is_complex(x) ? complex_atan(x) : Math.atan(to_float(x));
	},
	'exact->inexact': function (args) { return apply_exactness(ck_num(args[0], 'exact->inexact'), to_float); },
	'inexact->exact': function (args) { return apply_exactness(ck_num(args[0], 'inexact->exact'), to_exact); },
	'exact': function (args) { return apply_exactness(ck_num(args[0], 'exact'), to_exact); },
	'inexact': function (args) { return apply_exactness(ck_num(args[0], 'inexact'), to_float); },
	'number->string': function (args) { return num_repr(ck_num(args[0], 'number->string')); },
	'string->number': function (args) { var r = parse_number(String(args[0])); return r === null ? false : r; },
	'1+': function (args) { return n_add(ck_num(args[0], '1+'), exact_int(1n)); },
	'1-': function (args) { return n_sub(ck_num(args[0], '1-'), exact_int(1n)); },

	// 複素数
	'make-rectangular': function (args) { return make_complex(ck_num(args[0], 'make-rectangular'), ck_num(args[1], 'make-rectangular')); },
	'make-polar': function (args) { var m = to_float(args[0]), a = to_float(args[1]); return make_complex(m * Math.cos(a), m * Math.sin(a)); },
	'real-part': function (args) { return cplx_re(ck_num(args[0], 'real-part')); },
	'imag-part': function (args) { return cplx_im(ck_num(args[0], 'imag-part')); },
	'magnitude': function (args) { var x = ck_num(args[0], 'magnitude'); return is_complex(x) ? complex_magnitude(x) : (is_exact(x) ? new Rational(big_abs(x.n), x.d) : Math.abs(x)); },
	'angle': function (args) { var x = ck_num(args[0], 'angle'); return is_complex(x) ? complex_angle(x) : (n_cmp(x, exact_int(0n)) < 0 ? Math.PI : (is_exact(x) ? exact_int(0n) : 0)); },

	// 数値述語
	'number?': function (args) { return is_scheme_number(args[0]); },
	'complex?': function (args) { return is_scheme_number(args[0]); },
	'real?': function (args) { return is_real_num(args[0]); },
	'rational?': function (args) { return is_exact(args[0]) || (is_inexact(args[0]) && isFinite(args[0])); },
	'integer?': function (args) { return is_real_num(args[0]) && num_is_integer(args[0]); },
	'exact?': function (args) { return is_exact(args[0]); },
	'inexact?': function (args) { return is_inexact(args[0]); },
	'exact-integer?': function (args) { return is_exact(args[0]) && args[0].d === 1n; },
	'zero?': function (args) { return n_cmp(ck_num(args[0], 'zero?'), exact_int(0n)) === 0; },
	'positive?': function (args) { return n_cmp(ck_num(args[0], 'positive?'), exact_int(0n)) > 0; },
	'negative?': function (args) { return n_cmp(ck_num(args[0], 'negative?'), exact_int(0n)) < 0; },
	'odd?': function (args) { var x = ck_num(args[0], 'odd?'); return is_exact(x) ? (x.n % 2n !== 0n) : (Math.abs(x % 2) === 1); },
	'even?': function (args) { var x = ck_num(args[0], 'even?'); return is_exact(x) ? (x.n % 2n === 0n) : (x % 2 === 0); },

	// 整数値を JS インデックスとして使う手続き(数値型対応のため上書き)
	'list-ref': function (args) { var p = args[0], n = to_jsint(args[1]); while (n-- > 0) p = p.cdr; return p.car; },
	'list-tail': function (args) { var p = args[0], n = to_jsint(args[1]); while (n-- > 0) p = p.cdr; return p; },
	'length': function (args) { return exact_int(BigInt(list_length(args[0]))); },
	'make-vector': function (args) { var n = to_jsint(args[0]); var fill = args.length > 1 ? args[1] : exact_int(0n); var a = []; for (var i = 0; i < n; i++) a.push(fill); return new SVector(a); },
	'vector-ref': function (args) { return args[0].items[to_jsint(args[1])]; },
	'vector-set!': function (args) { args[0].items[to_jsint(args[1])] = args[2]; return undefined; },
	'vector-length': function (args) { return exact_int(BigInt(args[0].items.length)); },
	'string-length': function (args) { return exact_int(BigInt(String(args[0]).length)); },
	'string-ref': function (args) { return new Char(String(args[0]).charAt(to_jsint(args[1]))); },
	'substring': function (args) { return String(args[0]).substring(to_jsint(args[1]), to_jsint(args[2])); },
	'make-string': function (args) { var n = to_jsint(args[0]); var c = args[1] instanceof Char ? args[1].ch : ' '; var s = ''; for (var i = 0; i < n; i++) s += c; return s; },
	'char->integer': function (args) { return exact_int(BigInt(args[0].ch.charCodeAt(0))); },
	'integer->char': function (args) { return new Char(String.fromCharCode(to_jsint(args[0]))); },

	// 等価性(数値は数値比較)
	'eq?': function (args) { return seqv(args[0], args[1]); },
	'eqv?': function (args) { return seqv(args[0], args[1]); },
	'equal?': function (args) { return sequal(args[0], args[1]); }
};

(function () {
	for (var name in NUMERIC_PRIMITIVES) {
		primitive_procedures[name] = NUMERIC_PRIMITIVES[name];
	}
})();


// ===== io.js =====
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


// ===== r7rs.js =====
// r7rs.js — R7RS small (ライブラリ / 特殊形式)
// R7RS (small + 主要 large ライブラリ)
//   define-library / import / export
//   case-lambda, define-values, let-values, let*-values
//   cond-expand, include, include-ci
//   guard / raise, define-record-type, hash-table
//   cond => 節, 追加標準手続き (filter, fold-left 等)
// ==================================================================

function SchemeCondition(obj) { this.payload = obj; }
function SRecord(typeName, fields) { this.typeName = typeName; this.fields = fields; }
function HashTable(map, eqFn) { this.map = map || new Map(); this.eqFn = eqFn || 'eq'; }

var libraryRegistry = {};
var r7rsFeatures = {
	'scheme': true, 'r7rs': true, 'r5rs': true, 'scheme-js': true,
	'node': !!(typeof require !== 'undefined' && NODE_FS),
	'unix': typeof process !== 'undefined' && process.platform !== 'win32',
	'windows': typeof process !== 'undefined' && process.platform === 'win32'
};

function lib_name_key(name) {
	if (name instanceof Array) {
		return name.map(function (x) { return (x instanceof Symbol) ? x.name : String(x); }).join(' ');
	}
	if (name instanceof Pair) {
		var parts = [];
		var p = name;
		while (p instanceof Pair) { parts.push(p.car.name || p.car); p = p.cdr; }
		return parts.join(' ');
	}
	if (name instanceof Symbol) return name.name;
	return String(name);
}

function parse_export_list(exp) {
	var out = [];
	if (exp == null) return out;
	for (var i = 0; i < exp.length; i++) {
		var e = exp[i];
		out.push((e instanceof Symbol) ? e.name : String(e));
	}
	return out;
}

function parse_import_spec(spec) {
	var onlyIdx = -1, exceptIdx = -1;
	for (var i = 0; i < spec.length; i++) {
		var name = (spec[i] instanceof Symbol) ? spec[i].name : spec[i];
		if (name === 'only:') onlyIdx = i;
		if (name === 'except:') exceptIdx = i;
	}
	if (onlyIdx >= 0) {
		return { key: lib_name_key(spec.slice(0, onlyIdx)), only: parse_export_list(spec.slice(onlyIdx + 1)), except: null };
	}
	if (exceptIdx >= 0) {
		return { key: lib_name_key(spec.slice(0, exceptIdx)), only: null, except: parse_export_list(spec.slice(exceptIdx + 1)) };
	}
	return { key: lib_name_key(spec), only: null, except: null };
}

function import_bindings_into(spec, env) {
	var lib = libraryRegistry[spec.key];
	if (!lib) throw 'unknown library: ' + spec.key;
	var names = Object.keys(lib.exports);
	if (spec.only) names = spec.only;
	if (spec.except) {
		names = names.filter(function (n) { return spec.except.indexOf(n) < 0; });
	}
	for (var i = 0; i < names.length; i++) {
		var nm = names[i];
		if (lib.exports[nm] !== undefined) env.add(nm, lib.exports[nm]);
	}
}

function eval_library_forms(forms, env) {
	if (forms == null) return;
	for (var i = 0; i < forms.length; i++) {
		var f = forms[i];
		if (istagged_list(f, 'begin')) {
			eval_library_forms(begin_actions(f), env);
		} else if (istagged_list(f, 'include')) {
			scheme_include(String(car(cdr(f))), env, false);
		} else if (istagged_list(f, 'include-ci')) {
			scheme_include(String(car(cdr(f))), env, true);
		} else if (istagged_list(f, 'cond-expand')) {
			var chosen = cond_expand_choose(cdr(f));
			if (chosen != null) eval_library_forms(chosen, env);
		} else if (isdefine_library(f)) {
			process_define_library(f);
		} else {
			trampoline(seval(f, env, function (v) { return v; }));
		}
	}
}

function cond_expand_choose(clauses) {
	if (clauses == null || clauses.length === 0) return null;
	for (var i = 0; i < clauses.length; i++) {
		var cl = clauses[i];
		var feat = car(cl);
		if (feat === 'else' || tag_equals(feat, 'else')) return cdr(cl);
		if (feature_set_satisfied(feat)) return cdr(cl);
	}
	return null;
}

function feature_set_satisfied(feat) {
	if (feat instanceof Array) {
		for (var i = 0; i < feat.length; i++) {
			var f = (feat[i] instanceof Symbol) ? feat[i].name : feat[i];
			if (!r7rsFeatures[f]) return false;
		}
		return true;
	}
	var name = (feat instanceof Symbol) ? feat.name : feat;
	return !!r7rsFeatures[name];
}

function process_define_library(exp) {
	var key = lib_name_key(car(cdr(exp)));
	var exports = [];
	var imports = [];
	var bodyForms = [];
	var clauses = cdr(cdr(exp));
	if (clauses != null) {
		for (var i = 0; i < clauses.length; i++) {
			var cl = clauses[i];
			var tag = car(cl);
			if (tag === 'export' || tag_equals(tag, 'export')) exports = parse_export_list(cdr(cl));
			else if (tag === 'import' || tag_equals(tag, 'import')) {
				for (var j = 1; j < cl.length; j++) imports.push(parse_import_spec(cl[j]));
			} else if (tag === 'begin' || tag_equals(tag, 'begin')) bodyForms = bodyForms.concat(cdr(cl));
			else if (tag === 'include' || tag_equals(tag, 'include')) bodyForms.push(cl);
			else if (tag === 'include-ci' || tag_equals(tag, 'include-ci')) bodyForms.push(cl);
			else if (tag === 'cond-expand' || tag_equals(tag, 'cond-expand')) bodyForms.push(cl);
		}
	}
	var libEnv = new Env(null);
	for (var k = 0; k < imports.length; k++) import_bindings_into(imports[k], libEnv);
	eval_library_forms(bodyForms, libEnv);
	var exported = {};
	for (var e = 0; e < exports.length; e++) {
		var sym = exports[e];
		exported[sym] = libEnv.find(new Symbol(sym));
	}
	libraryRegistry[key] = { exports: exported, env: libEnv };
	return key;
}

function scheme_include(path, env, ci) {
	var filepath = path.replace(/^"|"$/g, '');
	if (!NODE_FS) throw 'include: requires Node.js';
	var content = NODE_FS.readFileSync(filepath, 'utf8');
	var tok = new Tokenizer(content);
	while (tok.value() !== '' && tok.value() != null) {
		var tree = parse(tok);
		if (isdefine_library(tree)) process_define_library(tree);
		else trampoline(seval(tree, env, function (v) { return v; }));
	}
}

function init_r7rs_libraries(largeLibs) {
	var baseExports = {};
	for (var name in theGlobalEnv.vars) baseExports[name] = theGlobalEnv.vars[name];
	libraryRegistry['scheme base'] = { exports: baseExports, env: theGlobalEnv };
	libraryRegistry['scheme case-lambda'] = { exports: {}, env: theGlobalEnv };

	function exportNames(names) {
		var ex = {};
		for (var i = 0; i < names.length; i++) {
			var n = names[i];
			if (primitive_procedures[n]) ex[n] = ['primitive', primitive_procedures[n]];
			else if (theGlobalEnv.vars[n] !== undefined) ex[n] = theGlobalEnv.vars[n];
		}
		return ex;
	}

	if (largeLibs) {
		for (var libName in largeLibs) {
			libraryRegistry[libName] = { exports: exportNames(largeLibs[libName]), env: theGlobalEnv };
		}
	} else {
		// large 未ロード時の最小 fallback
		var htNames = ['make-hash-table', 'hash-table?', 'hash-table-ref', 'hash-table-set!',
			'hash-table-delete!', 'hash-table-contains?', 'hash-table-keys', 'hash-table-values'];
		libraryRegistry['scheme hash-table'] = { exports: exportNames(htNames), env: theGlobalEnv };
		var listNames = ['filter', 'fold-left', 'fold-right', 'find', 'any', 'every'];
		libraryRegistry['scheme list'] = { exports: exportNames(listNames), env: theGlobalEnv };
	}
}

// --- case-lambda --------------------------------------------------
function make_case_procedure(clauses, env) {
	return ['case-procedure', clauses, env];
}
function iscase_procedure(p) { return istagged_list(p, 'case-procedure'); }
function case_procedure_clauses(p) { return p[1]; }
function case_procedure_environment(p) { return p[2]; }

function params_accepts(params, argc) {
	if (params instanceof Symbol) return true;
	if (params instanceof Pair) {
		var n = 0, p = params;
		while (p instanceof Pair) { n++; p = p.cdr; }
		return (p != null) ? (argc >= n) : (argc === n);
	}
	if (params instanceof Array) return argc === params.length;
	return argc === 0;
}

function find_case_clause(clauses, argc) {
	for (var i = 0; i < clauses.length; i++) {
		if (params_accepts(clauses[i][0], argc)) return clauses[i];
	}
	throw 'case-lambda: wrong number of arguments';
}

// --- define-values / let-values 束縛分解 --------------------------
function bind_formals_to_env(formals, values, env) {
	if (formals instanceof Symbol) {
		env.add(formals.name, array_to_list(values));
		return;
	}
	if (formals instanceof Pair) {
		var p = formals, i = 0;
		while (p instanceof Pair) {
			var nm = (p.car instanceof Symbol) ? p.car.name : p.car;
			env.add(nm, values[i++]);
			p = p.cdr;
		}
		if (p != null) {
			var restName = (p instanceof Symbol) ? p.name : p;
			env.add(restName, array_to_list(values.slice(i)));
		}
		return;
	}
	if (formals instanceof Array) {
		for (var j = 0; j < formals.length; j++) {
			var name = (formals[j] instanceof Symbol) ? formals[j].name : formals[j];
			env.add(name, values[j]);
		}
	}
}

function values_to_array(v) {
	return (v instanceof Values) ? v.items.slice() : [v];
}

// --- R7RS 追加手続き ----------------------------------------------
var R7RS_PRIMITIVES = {
	'raise': function (args, k) { return dispatch_guard(args[0], guardHandlers.length - 1, k); },
	'filter': function (args) {
		var pred = args[0], lst = args[1], out = null, tail = null;
		while (lst instanceof Pair) {
			if (apply_sync(pred, [lst.car])) {
				var cell = new Pair(lst.car, null);
				if (out === null) { out = cell; tail = cell; } else { tail.cdr = cell; tail = cell; }
			}
			lst = lst.cdr;
		}
		return out;
	},
	'fold-left': function (args) {
		var f = args[0], init = args[1], lst = args[2], acc = init;
		while (lst instanceof Pair) { acc = apply_sync(f, [acc, lst.car]); lst = lst.cdr; }
		return acc;
	},
	'fold-right': function (args) {
		var f = args[0], init = args[1], lst = args[2];
		function fold(l) {
			if (!(l instanceof Pair)) return init;
			return apply_sync(f, [l.car, fold(l.cdr)]);
		}
		return fold(lst);
	},
	'find': function (args) {
		var pred = args[0], lst = args[1];
		while (lst instanceof Pair) {
			if (apply_sync(pred, [lst.car])) return lst.car;
			lst = lst.cdr;
		}
		return false;
	},
	'any': function (args) {
		var pred = args[0], lst = args[1];
		while (lst instanceof Pair) {
			if (apply_sync(pred, [lst.car])) return true;
			lst = lst.cdr;
		}
		return false;
	},
	'every': function (args) {
		var pred = args[0], lst = args[1];
		while (lst instanceof Pair) {
			if (!apply_sync(pred, [lst.car])) return false;
			lst = lst.cdr;
		}
		return true;
	},
	'make-hash-table': function (args) { return new HashTable(new Map(), 'eq'); },
	'hash-table?': function (args) { return args[0] instanceof HashTable; },
	'hash-table-ref': function (args) {
		var ht = args[0], key = args[1];
		if (ht.map.has(key)) return ht.map.get(key);
		if (args.length > 2) return args[2];
		throw 'hash-table-ref: key not found';
	},
	'hash-table-set!': function (args) { args[0].map.set(args[1], args[2]); return undefined; },
	'hash-table-delete!': function (args) { args[0].map.delete(args[1]); return undefined; },
	'hash-table-contains?': function (args) { return args[0].map.has(args[1]); },
	'hash-table-keys': function (args) {
		var keys = [], it = args[0].map.keys();
		var n = it.next();
		while (!n.done) { keys.push(n.value); n = it.next(); }
		return array_to_list(keys);
	},
	'hash-table-values': function (args) {
		var vals = [], it = args[0].map.values();
		var n = it.next();
		while (!n.done) { vals.push(n.value); n = it.next(); }
		return array_to_list(vals);
	},
	'record?': function (args) { return args[0] instanceof SRecord; }
};

// 同期 apply ヘルパ(高階リスト手続き用)
function apply_sync(proc, args) {
	if (isprimitive_procedure(proc)) return car(cdr(proc)).call(null, args);
	if (iscompound_procedure(proc)) {
		var env = extend_env(procedure_parameters(proc), args, procedure_environment(proc));
		return trampoline(eval_body(procedure_body(proc), env, function (v) { return v; }));
	}
	if (iscase_procedure(proc)) {
		var clause = find_case_clause(case_procedure_clauses(proc), args.length);
		var env2 = extend_env(clause[0], args, case_procedure_environment(proc));
		return trampoline(eval_body(clause[1], env2, function (v) { return v; }));
	}
	throw 'apply-sync: not a procedure';
}

(function () {
	for (var name in R7RS_PRIMITIVES) {
		primitive_procedures[name] = R7RS_PRIMITIVES[name];
		if (name === 'raise') primitive_procedures[name].cps = true;
	}
})();

var guardHandlers = [];

function dispatch_guard(obj, idx, k) {
	if (idx < 0) throw new SchemeCondition(obj);
	var h = guardHandlers[idx];
	return eval_guard_clauses(obj, h.clauses, h.env, k, function () {
		return dispatch_guard(obj, idx - 1, k);
	}, h.varSym);
}

// --- R7RS 特殊形式の述語 ------------------------------------------
isdefine_library = function (exp) { return istagged_list(exp, 'define-library'); };
isimport_form = function (exp) { return istagged_list(exp, 'import'); };
iscase_lambda = function (exp) { return istagged_list(exp, 'case-lambda'); };
isdefine_values = function (exp) { return istagged_list(exp, 'define-values'); };
islet_values = function (exp) { return istagged_list(exp, 'let-values'); };
islet_star_values = function (exp) { return istagged_list(exp, 'let*-values'); };
iscond_expand = function (exp) { return istagged_list(exp, 'cond-expand'); };
isguard = function (exp) { return istagged_list(exp, 'guard'); };
isdefine_record_type = function (exp) { return istagged_list(exp, 'define-record-type'); };
isinclude = function (exp) { return istagged_list(exp, 'include') || istagged_list(exp, 'include-ci'); };

// --- R7RS 評価器 --------------------------------------------------
eval_import = function (exp, env, k) {
	var specs = cdr(exp);
	if (specs != null) {
		for (var i = 0; i < specs.length; i++) import_bindings_into(parse_import_spec(specs[i]), env);
	}
	return bounce(function () { return k(undefined); });
};

eval_case_lambda = function (exp, env, k) {
	var clauses = cdr(exp);
	var parsed = [];
	if (clauses != null) {
		for (var i = 0; i < clauses.length; i++) {
			var cl = clauses[i];
			parsed.push([car(cl), cdr(cl)]);
		}
	}
	return bounce(function () { return k(make_case_procedure(parsed, env)); });
};

eval_define_values = function (exp, env, k) {
	var formals = car(cdr(exp));
	var expr = car(cdr(cdr(exp)));
	return seval(expr, env, function (vals) {
		var tmp = new Env(null);
		bind_formals_to_env(formals, values_to_array(vals), tmp);
		for (var nm in tmp.vars) env.add(nm, tmp.vars[nm]);
		return bounce(function () { return k(undefined); });
	});
};

eval_let_values = function (exp, env, k) {
	var bindings = car(cdr(exp));
	var body = cdr(cdr(exp));
	var newEnv = new Env(env);
	var bind = function (i) {
		if (bindings == null || i >= bindings.length) return eval_body(body, newEnv, k);
		var formal = car(bindings[i]);
		var expr = car(cdr(bindings[i]));
		return seval(expr, env, function (vals) {
			bind_formals_to_env(formal, values_to_array(vals), newEnv);
			return bind(i + 1);
		});
	};
	return bind(0);
};

eval_let_star_values = function (exp, env, k) {
	var bindings = car(cdr(exp));
	var body = cdr(cdr(exp));
	var newEnv = new Env(env);
	var bind = function (i) {
		if (bindings == null || i >= bindings.length) return eval_body(body, newEnv, k);
		var formal = car(bindings[i]);
		var expr = car(cdr(bindings[i]));
		return seval(expr, newEnv, function (vals) {
			bind_formals_to_env(formal, values_to_array(vals), newEnv);
			return bind(i + 1);
		});
	};
	return bind(0);
};

eval_cond_expand = function (exp, env, k) {
	var chosen = cond_expand_choose(cdr(exp));
	if (chosen == null || chosen.length === 0) return bounce(function () { return k(undefined); });
	if (chosen.length === 1) return seval(chosen[0], env, k);
	return eval_body(chosen, env, k);
};

eval_guard = function (exp, env, k) {
	var header = car(cdr(exp));
	var varSym = car(header);
	var clauses = cdr(header);
	var body = cdr(cdr(exp));
	guardHandlers.push({ clauses: clauses, varSym: varSym, env: env });
	if (body == null || body.length === 0) return bounce(function () { return k(undefined); });
	if (body.length === 1) {
		return seval(body[0], env, function (v) {
			guardHandlers.pop();
			return k(v);
		});
	}
	return eval_body(body, env, function (v) {
		guardHandlers.pop();
		return k(v);
	});
};

eval_guard_clauses = function (obj, clauses, env, k, onFail, varSym) {
	if (clauses == null || clauses.length === 0) return onFail();
	var cl = car(clauses);
	var rest = cdr(clauses);
	var tag = car(cl);
	var bindEnv = varSym ? extend_env([varSym], [obj], env) : extend_env([tag], [obj], env);
	if (tag === 'else' || tag_equals(tag, 'else')) {
		return eval_body(cdr(cl), bindEnv, k);
	}
	return seval(car(cl), bindEnv, function (test) {
		if (isTruthy(test)) return eval_body(cdr(cl), bindEnv, k);
		return eval_guard_clauses(obj, rest, env, k, onFail, varSym);
	});
};

eval_define_record_type = function (exp, env, k) {
	var typeName = (car(cdr(exp)) instanceof Symbol) ? car(cdr(exp)).name : String(car(cdr(exp)));
	var constrSpec = car(cdr(cdr(exp)));
	var predSym = car(cdr(cdr(cdr(exp))));
	var fieldSpecs = cdr(cdr(cdr(cdr(exp))));
	var constrName = car(constrSpec).name;
	var fieldNames = [];
	var fargs = cdr(constrSpec);
	if (fargs instanceof Array) {
		for (var i = 0; i < fargs.length; i++) fieldNames.push(fargs[i].name || fargs[i]);
	}
	var makeRec = function (args) {
		var fields = {};
		for (var j = 0; j < fieldNames.length; j++) fields[fieldNames[j]] = args[j];
		return new SRecord(typeName, fields);
	};
	env.add(constrName, ['primitive', function (a) { return makeRec(a); }]);
	var predName = (predSym instanceof Symbol) ? predSym.name : predSym;
	env.add(predName, ['primitive', function (a) { return a[0] instanceof SRecord && a[0].typeName === typeName; }]);
	if (fieldSpecs != null) {
		for (var fi = 0; fi < fieldSpecs.length; fi++) {
			var fs = fieldSpecs[fi];
			var fname = (car(fs) instanceof Symbol) ? car(fs).name : car(fs);
			var accName = (car(cdr(fs)) instanceof Symbol) ? car(cdr(fs)).name : car(cdr(fs));
			(function (field, acc, mutSym) {
				env.add(acc, ['primitive', function (a) { return a[0].fields[field]; }]);
				if (mutSym != null) {
					env.add(mutSym, ['primitive', function (a) {
						a[0].fields[field] = a[1];
						return undefined;
					}]);
				}
			})(fname, accName, (fs.length > 2) ? ((car(cdr(cdr(fs))) instanceof Symbol) ? car(cdr(cdr(fs))).name : car(cdr(cdr(fs)))) : null);
		}
	}
	return bounce(function () { return k(undefined); });
};

eval_include_form = function (exp, env, k) {
	var ci = istagged_list(exp, 'include-ci');
	scheme_include(String(car(cdr(exp))), env, ci);
	return bounce(function () { return k(undefined); });
};

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
isdefine_syntax = function (exp) {
	return istagged_list(exp, "define-syntax");
};
islet_syntax = function (exp) {
	return istagged_list(exp, "let-syntax");
};
isletrec_syntax = function (exp) {
	return istagged_list(exp, "letrec-syntax");
};
issyntax_rules = function (p) {
	return istagged_list(p, "syntax-rules");
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
	}
	// R7RS: (pred => proc) 節
	var actions = cond_actions(first);
	if (actions != null && actions.length >= 2 && tag_equals(actions[0], '=>')) {
		var temp = new Symbol('_cond' + Math.floor(Math.random() * 1e9));
		var proc = actions[1];
		return ['let', [[temp, cond_predicate(first)]],
			['if', temp, [proc, temp], expand_clauses(rest)]];
	}
	return make_if(cond_predicate(first),
		sequence_exp(cond_actions(first)),
		expand_clauses(rest));
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


// ===== evaluator.js =====
// evaluator.js — CPS 評価器 / マクロ / s_apply
// ==================================================================
// CPS 評価器
//   seval(exp, env, k): 式 exp を評価し、結果を継続 k に渡す。
//   返り値は必ず Bounce(またはトップレベル halt が返す最終値)で、
//   トランポリンが反復実行することでスタックを消費せず駆動する。
// ==================================================================

function debug_eval_enter(exp, env, k) { return null; }
function debug_apply_event(proc, args) {}
function debug_wrap_k(exp, env, k) { return k; }

function seval(exp, env, k) {
	var pauseB = debug_eval_enter(exp, env, k);
	if (pauseB) return pauseB;
	k = debug_wrap_k(exp, env, k);
	// 真偽値・空リストはそのまま
	if (typeof exp === 'boolean' || exp == null) {
		return bounce(function () { return k(exp); });
	}
	// 文字 / ベクタ / 多値 / プロミス / 有理数 / 複素数 はそのまま自己評価
	if (exp instanceof Char || exp instanceof SVector || exp instanceof Values || exp instanceof Promise || exp instanceof Rational || exp instanceof Complex) {
		return bounce(function () { return k(exp); });
	}
	if (typeof SBytevector !== 'undefined' && (exp instanceof SBytevector || exp instanceof Box || exp instanceof SText)) {
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
	// define-syntax
	if (isdefine_syntax(exp)) {
		var sName = car(cdr(exp)).name;
		var sSpec = car(cdr(cdr(exp)));
		env.add(sName, make_syntax_rules(sSpec, env));
		return bounce(function () { return k(sName); });
	}
	// let-syntax / letrec-syntax
	if (islet_syntax(exp) || isletrec_syntax(exp)) {
		return eval_let_syntax(exp, env, k);
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
	// R7RS 特殊形式
	if (iscase_lambda(exp)) return eval_case_lambda(exp, env, k);
	if (isdefine_values(exp)) return eval_define_values(exp, env, k);
	if (islet_values(exp)) return eval_let_values(exp, env, k);
	if (islet_star_values(exp)) return eval_let_star_values(exp, env, k);
	if (iscond_expand(exp)) return eval_cond_expand(exp, env, k);
	if (isguard(exp)) return eval_guard(exp, env, k);
	if (isdefine_record_type(exp)) return eval_define_record_type(exp, env, k);
	if (isinclude(exp)) return eval_include_form(exp, env, k);
	if (isimport_form(exp)) return eval_import(exp, env, k);
	if (isdefine_library(exp)) {
		process_define_library(exp);
		return bounce(function () { return k(undefined); });
	}
	// begin
	if (isbegin(exp)) {
		return eval_body(begin_actions(exp), env, k);
	}
	if (istagged_list(exp, 'macro-capture')) {
		return bounce(function () { return k(exp[1]); });
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
	if (target instanceof Pair) {
		// 可変長 define: (define (name . args) body) / (define (name a . rest) body)
		var pname = (target.car instanceof Symbol) ? target.car.name : target.car;
		var pparams = target.cdr; // Symbol(可変長) または不完全 Pair
		var pbody = cdr(cdr(exp));
		env.add(pname, make_procedure(pparams, pbody, env));
		return bounce(function () { return k(pname); });
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

// (let-syntax ((name (syntax-rules ...)) ...) body ...)
// (letrec-syntax ...) も同様に扱う(本実装では両者を同一視)
eval_let_syntax = function (exp, env, k) {
	var bindings = car(cdr(exp));
	var body = cdr(cdr(exp));
	var newEnv = new Env(env);
	if (bindings != null) {
		for (var i = 0; i < bindings.length; i++) {
			var nm = car(bindings[i]).name;
			var spec = car(cdr(bindings[i]));
			newEnv.add(nm, make_syntax_rules(spec, newEnv));
		}
	}
	return eval_body(body, newEnv, k);
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
// 本体は複数式を許す。
eval_let = function (exp, env, k) {
	if (car(cdr(exp)) instanceof Symbol) {
		return eval_named_let(exp, env, k);
	}
	var bindings = car(cdr(exp));
	var body = cdr(cdr(exp));
	var params = [];
	var argExprs = [];
	if (bindings != null) {
		for (var i = 0; i < bindings.length; i++) {
			params.push(car(bindings[i]));
			argExprs.push(car(cdr(bindings[i])));
		}
	}
	var lambda = ['lambda', params].concat(body);
	var app = [lambda].concat(argExprs);
	return seval(app, env, k);
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
			return eval_body(body, newEnv, k);
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
// quasiquote の結果は「本物の Pair リスト」を生成する。
function quasi_atom(tmpl) {
	if (typeof tmpl === 'string') return tmpl.replace(/\"/g, ''); // 文字列リテラルの引用符除去
	return tmpl;                                                  // Symbol / 数値 / 文字 等はそのまま
}
eval_quasi = function (tmpl, depth, env, k) {
	if (!(tmpl instanceof Array)) {
		return bounce(function () { return k(quasi_atom(tmpl)); });
	}
	// (unquote x)
	if (tmpl.length > 0 && tag_equals(tmpl[0], 'unquote')) {
		if (depth === 1) {
			return seval(tmpl[1], env, k);
		}
		return eval_quasi(tmpl[1], depth - 1, env, function (inner) {
			return bounce(function () { return k(new Pair(new Symbol('unquote'), new Pair(inner, null))); });
		});
	}
	// (quasiquote x) ネスト
	if (tmpl.length > 0 && tag_equals(tmpl[0], 'quasiquote')) {
		return eval_quasi(tmpl[1], depth + 1, env, function (inner) {
			return bounce(function () { return k(new Pair(new Symbol('quasiquote'), new Pair(inner, null))); });
		});
	}
	// 一般のリスト: 各要素を処理。depth===1 の unquote-splicing は展開する。
	return quasi_list(tmpl, 0, depth, env, k);
};

quasi_list = function (items, i, depth, env, k) {
	if (i >= items.length) {
		return bounce(function () { return k(null); });
	}
	var e = items[i];
	if (e instanceof Array && e.length > 0 && tag_equals(e[0], 'unquote-splicing') && depth === 1) {
		return seval(e[1], env, function (spliced) {
			return quasi_list(items, i + 1, depth, env, function (rest) {
				return bounce(function () { return k(append_pair(spliced, rest)); });
			});
		});
	}
	return eval_quasi(e, depth, env, function (head) {
		return quasi_list(items, i + 1, depth, env, function (rest) {
			return bounce(function () { return k(new Pair(head, rest)); });
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
					var d = datums[i];
					var matched = is_scheme_number(key)
						? (is_scheme_number(d) && num_eq(d, key))
						: (normalize_datum(d) == nkey);
					if (matched) {
						return eval_sequence(cdr(clause), env, k);
					}
				}
			}
			return loop(cdr(cs));
		};
		return loop(clauses);
	});
};

// 内部 define を letrec へ変換 (R5RS 準拠)
define_to_letrec_binding = function (def) {
	var target = car(cdr(def));
	if (target instanceof Array) {
		return [car(target), ['lambda', cdr(target)].concat(cdr(cdr(def)))];
	}
	if (target instanceof Pair) {
		return [target.car, ['lambda', target.cdr].concat(cdr(cdr(def)))];
	}
	return [target, car(cdr(cdr(def)))];
};

transform_internal_defines = function (exps) {
	if (exps == null || exps.length === 0) return exps;
	var defs = [];
	var i = 0;
	while (i < exps.length && isdefine(exps[i])) {
		defs.push(define_to_letrec_binding(exps[i]));
		i++;
	}
	if (defs.length === 0) return exps;
	return [['letrec', defs].concat(exps.slice(i))];
};

// 本体評価: 先頭の内部 define を letrec へ脱糖してから評価
eval_body = function (exps, env, k) {
	return eval_sequence(transform_internal_defines(exps), env, k);
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

// ==================================================================
// syntax-rules (パターンマッチ + 衛生的マクロ展開)
//   テンプレート導入の束縛は gensym、マクロ定義環境の自由変数は macro-capture で保持。
// ==================================================================

// エリプシスでマッチした列を区別するためのラッパ
function EllipsisMatch(items) { this.items = items; }

var ELLIPSIS = '...';
var WILDCARD = '_';

// 識別子の名前を取り出す(Symbol でも文字列でも)。識別子でなければ null。
function id_name(x) {
	if (x instanceof Symbol) return x.name;
	if (typeof x === 'string') return x;
	return null;
}
function is_ellipsis(x) { return id_name(x) === ELLIPSIS; }

// 変換器を生成: (syntax-rules (lit ...) (pat tmpl) ...)
make_syntax_rules = function (spec, env) {
	var litList = car(cdr(spec));
	var literals = [];
	if (litList != null) {
		for (var i = 0; i < litList.length; i++) {
			literals.push(id_name(litList[i]));
		}
	}
	var rules = cdr(cdr(spec));
	return ["syntax-rules", literals, rules, env];
};

// パターン変数を収集(リテラル/.../ _ を除く識別子)
function collect_pattern_vars(pat, literals, acc) {
	if (pat instanceof Array) {
		for (var i = 0; i < pat.length; i++) collect_pattern_vars(pat[i], literals, acc);
		return acc;
	}
	if (pat instanceof Pair) {
		collect_pattern_vars(pat.car, literals, acc);
		collect_pattern_vars(pat.cdr, literals, acc);
		return acc;
	}
	var nm = id_name(pat);
	if (nm === null) return acc;
	if (nm === ELLIPSIS || nm === WILDCARD) return acc;
	if (literals.indexOf(nm) >= 0) return acc;
	acc[nm] = true;
	return acc;
}

// 完全リストの Array 表現へ(不完全リストなら null)
function sr_proper_array(form) {
	if (form instanceof Array) return form;
	if (form instanceof Pair) {
		var a = [], p = form;
		while (p instanceof Pair) { a.push(p.car); p = p.cdr; }
		return p === null ? a : null;
	}
	return null;
}

// マッチ: 成功で bindings(オブジェクト)に追記して true、失敗で false。
function sr_match(pat, form, literals, bindings) {
	var nm = id_name(pat);
	// 識別子パターン
	if (nm !== null && !(pat instanceof Array)) {
		if (nm === WILDCARD) return true;
		if (literals.indexOf(nm) >= 0) {
			// リテラル: 同名の識別子にのみマッチ
			return id_name(form) === nm;
		}
		// パターン変数
		bindings[nm] = form;
		return true;
	}
	// ドット対パターン (a . b)
	if (pat instanceof Pair) {
		if (form instanceof Pair) {
			if (!sr_match(pat.car, form.car, literals, bindings)) return false;
			return sr_match(pat.cdr, form.cdr, literals, bindings);
		}
		var arr = sr_proper_array(form);
		if (arr === null || arr.length === 0) return false;
		if (!sr_match(pat.car, arr[0], literals, bindings)) return false;
		var rest;
		if (arr.length === 1) rest = null;
		else if (arr.length === 2) rest = arr[1];
		else rest = array_to_list(arr.slice(1));
		return sr_match(pat.cdr, rest, literals, bindings);
	}
	// リストパターン
	if (pat instanceof Array) {
		var inp;
		if (form instanceof Array) inp = form;
		else if (form == null) inp = [];
		else {
			var proper = sr_proper_array(form);
			if (proper === null) return false;
			inp = proper;
		}
		return sr_match_list(pat, inp, literals, bindings);
	}
	// リテラルデータ(数値など)
	return sequal(pat, form);
}

function sr_match_list(pat, inp, literals, bindings) {
	for (var i = 0; i < pat.length; i++) {
		// 次が ... ならエリプシス
		if (i + 1 < pat.length && is_ellipsis(pat[i + 1])) {
			var sub = pat[i];
			var fixedAfter = pat.length - (i + 2);
			var available = inp.length - i - fixedAfter;
			if (available < 0) return false;
			// エリプシスにマッチする部分列を収集
			var subVars = collect_pattern_vars(sub, literals, {});
			var collected = {};
			for (var v in subVars) collected[v] = [];
			for (var j = 0; j < available; j++) {
				var sb = {};
				if (!sr_match(sub, inp[i + j], literals, sb)) return false;
				for (var v2 in subVars) collected[v2].push(sb[v2]);
			}
			for (var v3 in subVars) bindings[v3] = new EllipsisMatch(collected[v3]);
			// エリプシス後の固定パターンをマッチ
			var rest = inp.slice(i + available);
			var restPat = pat.slice(i + 2);
			return sr_match_list(restPat, rest, literals, bindings);
		}
		if (i >= inp.length) return false;
		if (!sr_match(pat[i], inp[i], literals, bindings)) return false;
	}
	return inp.length === pat.length;
}

// テンプレート中で使われているエリプシス変数名を集める
function ellipsis_vars_in(tmpl, bindings, acc) {
	if (tmpl instanceof Array) {
		for (var i = 0; i < tmpl.length; i++) ellipsis_vars_in(tmpl[i], bindings, acc);
		return acc;
	}
	if (tmpl instanceof Pair) {
		ellipsis_vars_in(tmpl.car, bindings, acc);
		ellipsis_vars_in(tmpl.cdr, bindings, acc);
		return acc;
	}
	var nm = id_name(tmpl);
	if (nm !== null && bindings[nm] instanceof EllipsisMatch) acc[nm] = true;
	return acc;
}

var sr_gensym_counter = 0;

function sr_fresh_name(base) {
	sr_gensym_counter++;
	return '%syn' + sr_gensym_counter + '%' + base;
}

function sr_pvar_set(bindings) {
	var m = {};
	for (var k in bindings) m[k] = true;
	return m;
}

// マッチ結果の Pair リストを評価器が扱える配列 AST へ
function sr_binding_value(val) {
	if (val instanceof EllipsisMatch) {
		for (var i = 0; i < val.items.length; i++) val.items[i] = sr_binding_value(val.items[i]);
		return val;
	}
	if (val instanceof Pair) {
		var proper = sr_proper_array(val);
		if (proper !== null) {
			for (var j = 0; j < proper.length; j++) proper[j] = sr_binding_value(proper[j]);
			proper.__sr_datum__ = true;
			return proper;
		}
		return ['cons', sr_binding_value(val.car), sr_binding_value(val.cdr)];
	}
	return val;
}

// テンプレートへ挿入: ドット対マッチ由来のリストは quote する
function sr_insert_value(val) {
	if (val instanceof Array && val.__sr_datum__) {
		var q = [];
		for (var i = 0; i < val.length; i++) q.push(val[i]);
		return ['quote', q];
	}
	return val;
}

function sr_bind_id(name, pvars, literals, scope) {
	if (!name || pvars[name] || literals.indexOf(name) >= 0) return;
	scope[name] = sr_fresh_name(name);
}

function sr_bind_params(params, pvars, literals, scope) {
	if (params instanceof Symbol) {
		sr_bind_id(params.name, pvars, literals, scope);
		return;
	}
	if (params instanceof Array) {
		for (var i = 0; i < params.length; i++) {
			var n = id_name(params[i]);
			if (n) sr_bind_id(n, pvars, literals, scope);
		}
		return;
	}
	if (params instanceof Pair) {
		var p = params;
		while (p instanceof Pair) {
			sr_bind_id(id_name(p.car), pvars, literals, scope);
			p = p.cdr;
		}
		if (p instanceof Symbol) sr_bind_id(p.name, pvars, literals, scope);
	}
}

function sr_bind_let_bindings(binds, pvars, literals, scope) {
	if (binds == null) return;
	for (var i = 0; i < binds.length; i++) {
		var nm = id_name(car(binds[i]));
		if (nm) sr_bind_id(nm, pvars, literals, scope);
	}
}

function sr_bind_define_target(target, pvars, literals, scope) {
	if (target instanceof Array) {
		sr_bind_id(id_name(car(target)), pvars, literals, scope);
	} else if (target instanceof Pair) {
		sr_bind_id(id_name(target.car), pvars, literals, scope);
	} else {
		sr_bind_id(id_name(target), pvars, literals, scope);
	}
}

// 衛生的テンプレート展開(scope: 導入束縛の改名, exports: defEnv 由来の捕捉)
function sr_expand_scoped(tmpl, bindings, literals, defEnv, scope, exports, pvars) {
	scope = scope || {};
	exports = exports || {};
	pvars = pvars || sr_pvar_set(bindings);

	var nm = id_name(tmpl);
	if (nm !== null && !(tmpl instanceof Array)) {
		if (pvars[nm]) {
			var val = sr_binding_value(bindings[nm]);
			if (val instanceof EllipsisMatch) return val.items.length ? val.items[0] : null;
			return sr_insert_value(val);
		}
		if (literals.indexOf(nm) >= 0) return tmpl;
		if (scope[nm]) return new Symbol(scope[nm]);
		var bound = defEnv.tryFind(nm);
		if (bound !== undefined) {
			if (!exports[nm]) exports[nm] = { name: sr_fresh_name(nm), val: bound };
			return new Symbol(exports[nm].name);
		}
		return tmpl;
	}
	if (tmpl instanceof Array) {
		var tag = id_name(tmpl[0]);
		var childScope = {};
		for (var sk in scope) childScope[sk] = scope[sk];

		if (tag === 'lambda' && tmpl.length >= 2) {
			sr_bind_params(tmpl[1], pvars, literals, childScope);
		} else if ((tag === 'let' || tag === 'let*' || tag === 'letrec') && tmpl.length >= 2) {
			sr_bind_let_bindings(tmpl[1], pvars, literals, childScope);
		} else if (tag === 'define' && tmpl.length >= 2) {
			sr_bind_define_target(tmpl[1], pvars, literals, childScope);
		}

		var out = [];
		for (var i = 0; i < tmpl.length; i++) {
			if (i + 1 < tmpl.length && is_ellipsis(tmpl[i + 1])) {
				var sub = tmpl[i];
				var evars = ellipsis_vars_in(sub, bindings, {});
				var names = Object.keys(evars);
				var n = names.length > 0 ? bindings[names[0]].items.length : 0;
				for (var j = 0; j < n; j++) {
					var sb = {};
					for (var key in bindings) sb[key] = bindings[key];
					for (var t = 0; t < names.length; t++) sb[names[t]] = bindings[names[t]].items[j];
					out.push(sr_expand_scoped(sub, sb, literals, defEnv, childScope, exports, pvars));
				}
				i++;
			} else {
				out.push(sr_expand_scoped(tmpl[i], bindings, literals, defEnv, childScope, exports, pvars));
			}
		}
		return out;
	}
	if (tmpl instanceof Pair) {
		return new Pair(
			sr_expand_scoped(tmpl.car, bindings, literals, defEnv, scope, exports, pvars),
			sr_expand_scoped(tmpl.cdr, bindings, literals, defEnv, scope, exports, pvars)
		);
	}
	return tmpl;
}

function sr_wrap_exports(expanded, exports) {
	var keys = Object.keys(exports);
	if (keys.length === 0) return expanded;
	var binds = [];
	for (var i = 0; i < keys.length; i++) {
		binds.push([new Symbol(exports[keys[i]].name), ['macro-capture', exports[keys[i]].val]]);
	}
	return ['let', binds, expanded];
}

// syntax-rules マクロを展開する。form は呼び出し全体 (keyword arg ...)。
expand_syntax_rules = function (transformer, form) {
	var literals = transformer[1];
	var rules = transformer[2];
	var defEnv = transformer[3];
	for (var r = 0; r < rules.length; r++) {
		var pattern = car(rules[r]);
		var template = car(cdr(rules[r]));
		var bindings = {};
		var patRest = (pattern instanceof Array) ? pattern.slice(1) : [];
		var formRest = (form instanceof Array) ? form.slice(1) : [];
		if (sr_match_list(patRest, formRest, literals, bindings)) {
			var exports = {};
			var expanded = sr_expand_scoped(template, bindings, literals, defEnv, {}, exports);
			return sr_wrap_exports(expanded, exports);
		}
	}
	throw ('no matching syntax-rules clause for ' + scheme_repr(form, true));
};

eval_application = function (exp, env, k) {
	var op = operator(exp);
	// マクロ / syntax-rules 呼び出しか? (演算子が識別子の場合)
	if (op instanceof Symbol || typeof op === 'string') {
		var bound = env.tryFind(op);
		if (bound && ismacro(bound)) {
			return expand_macro(bound, operands(exp), function (expanded) {
				// マクロ本体が list/cons/quasiquote で構築したコードは Pair なので AST へ変換
				return seval(to_ast(expanded), env, k);
			});
		}
		if (bound && issyntax_rules(bound)) {
			var expanded2 = expand_syntax_rules(bound, exp);
			return seval(expanded2, env, k);
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
	debug_apply_event(procedure, args);
	if (isprimitive_procedure(procedure)) {
		return apply_primitive_procedure(procedure, args, k);
	}
	if (iscontinuation(procedure)) {
		var capturedK = procedure[1];
		var targetWind = procedure[2] || [];
		var value = args.length ? args[0] : undefined;
		return wind_transfer(targetWind, function () {
			return bounce(function () { return capturedK(value); });
		});
	}
	if (iscompound_procedure(procedure)) {
		var newEnv = extend_env(
			procedure_parameters(procedure),
			args,
			procedure_environment(procedure));
		return eval_body(procedure_body(procedure), newEnv, k);
	}
	if (iscase_procedure(procedure)) {
		var clause = find_case_clause(case_procedure_clauses(procedure), args.length);
		var caseEnv = extend_env(clause[0], args, case_procedure_environment(procedure));
		return eval_body(clause[1], caseEnv, k);
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


// ===== js_interop.js =====
// js_interop.js — JavaScript 相互運用
// ==================================================================
// JsValue で JS オブジェクト・関数を Scheme から透過的に操作する。
//   (js-global) / (js-ref obj "prop") / (js-set! obj "prop" val)
//   (js-call obj "method" arg ...) / (js-invoke fn arg ...) / (js-new Ctor arg ...)
//   (js->scheme x) / (scheme->js x)
// ==================================================================

function JsValue(v) { this.val = v; }

function is_js_value(x) { return x instanceof JsValue; }

var scheme_command_line_argv = null;

function scheme_set_command_line(argv) {
	scheme_command_line_argv = argv == null ? null : argv.slice();
}

function js_host_global() {
	if (typeof globalThis !== 'undefined') return globalThis;
	if (typeof global !== 'undefined') return global;
	if (typeof window !== 'undefined') return window;
	return {};
}

function js_key(k) {
	if (typeof k === 'number') return k;
	if (k instanceof Symbol) return k.name;
	if (k instanceof Char) return k.ch;
	return String(k);
}

function scheme_to_js(x) {
	if (x === null) return null;
	if (x === true || x === false) return x;
	if (typeof x === 'number' || typeof x === 'string') return x;
	if (x instanceof Char) return x.ch;
	if (x instanceof Symbol) return x.name;
	if (is_js_value(x)) return x.val;
	if (is_scheme_number(x)) {
		if (x instanceof Complex) return { re: scheme_to_js(x.re), im: scheme_to_js(x.im) };
		if (is_exact(x)) return Number(x.n) / Number(x.d);
		return +x;
	}
	if (x instanceof Pair) {
		var arr = [], p = x;
		while (p instanceof Pair) { arr.push(scheme_to_js(p.car)); p = p.cdr; }
		if (p !== null) arr.push(scheme_to_js(p));
		return arr;
	}
	if (x instanceof SVector) {
		var out = [];
		for (var i = 0; i < x.items.length; i++) out.push(scheme_to_js(x.items[i]));
		return out;
	}
	if (isprimitive_procedure(x) || iscompound_procedure(x) || iscase_procedure(x)) {
		return function () {
			var args = [];
			for (var j = 0; j < arguments.length; j++) args.push(js_to_scheme(arguments[j]));
			return scheme_to_js(apply_sync(x, args));
		};
	}
	if (ismacro(x) || issyntax_rules(x) || iscontinuation(x)) {
		throw 'scheme->js: cannot export ' + scheme_repr(x, true);
	}
	return x;
}

function js_to_scheme(v) {
	if (v === undefined || v === null) return null;
	if (v === true || v === false) return v;
	if (typeof v === 'number') return v;
	if (typeof v === 'string') return v;
	if (typeof v === 'bigint') return exact_int(v);
	if (is_js_value(v)) return v;
	if (Array.isArray(v)) {
		var lst = null;
		for (var i = v.length - 1; i >= 0; i--) lst = new Pair(js_to_scheme(v[i]), lst);
		return lst;
	}
	return new JsValue(v);
}

var JS_INTEROP_PRIMITIVES = {
	'js-value?': function (args) { return is_js_value(args[0]); },
	'js-global': function () { return new JsValue(js_host_global()); },
	'js-ref': function (args) {
		var obj = scheme_to_js(args[0]);
		var key = js_key(args[1]);
		return js_to_scheme(obj[key]);
	},
	'js-set!': function (args) {
		var obj = scheme_to_js(args[0]);
		obj[js_key(args[1])] = scheme_to_js(args[2]);
		return undefined;
	},
	'js-call': function (args) {
		var obj = scheme_to_js(args[0]);
		var name = js_key(args[1]);
		var fn = obj[name];
		if (typeof fn !== 'function') throw ('js-call: not a function: ' + name);
		var callArgs = [];
		for (var i = 2; i < args.length; i++) callArgs.push(scheme_to_js(args[i]));
		return js_to_scheme(fn.apply(obj, callArgs));
	},
	'js-invoke': function (args) {
		var fn = scheme_to_js(args[0]);
		if (typeof fn !== 'function') throw 'js-invoke: not a function';
		var callArgs = [];
		for (var i = 1; i < args.length; i++) callArgs.push(scheme_to_js(args[i]));
		return js_to_scheme(fn.apply(undefined, callArgs));
	},
	'js-new': function (args) {
		var Ctor = scheme_to_js(args[0]);
		if (typeof Ctor !== 'function') throw 'js-new: not a constructor';
		var callArgs = [];
		for (var j = 1; j < args.length; j++) callArgs.push(scheme_to_js(args[j]));
		return js_to_scheme(Reflect.construct(Ctor, callArgs));
	},
	'js->scheme': function (args) { return js_to_scheme(args[0]); },
	'scheme->js': function (args) { return new JsValue(scheme_to_js(args[0])); }
};

function scheme_get_command_line() {
	if (scheme_command_line_argv !== null) {
		return array_to_list(scheme_command_line_argv);
	}
	var args = (typeof process !== 'undefined' && process.argv) ? process.argv.slice(2) : [];
	return array_to_list(args);
}

(function () {
	for (var name in JS_INTEROP_PRIMITIVES) {
		primitive_procedures[name] = JS_INTEROP_PRIMITIVES[name];
	}
})();

// scheme_repr 用 (primitives.js の scheme_repr より前に読み込まれるため、後からパッチ)
var _js_repr_patched = false;
function patch_scheme_repr_for_js() {
	if (_js_repr_patched) return;
	_js_repr_patched = true;
	var orig = scheme_repr;
	scheme_repr = function (x, writeMode) {
		if (is_js_value(x)) {
			var tag = Object.prototype.toString.call(x.val);
			if (typeof x.val === 'function') return '#<js:function>';
			return '#<js:' + tag.slice(8, -1) + '>';
		}
		return orig(x, writeMode);
	};
}


// ===== debugger.js =====
// debugger.js — ステップ実行・評価トレース
// ==================================================================
// CPS 評価器 (seval / s_apply) にフックし、式ごとの評価過程を記録する。
//   scheme_debug_start(code) -> セッション (step / continue / getEvents)
//   scheme_debug_trace(code) -> 全ステップを記録したトレース (同期)
// ==================================================================

var PAUSE_SENTINEL = { __scheme_debug_pause__: true };

var activeDebugSession = null;

function debug_value_repr(v) {
	if (v === undefined) return '#<undefined>';
	if (v === true) return '#t';
	if (v === false) return '#f';
	if (v === null) return '()';
	if (typeof v === 'number' || typeof v === 'string') return scheme_repr(v, true);
	if (v instanceof Symbol) return v.name;
	if (iscompound_procedure(v) || isprimitive_procedure(v) || iscase_procedure(v)) return '#<procedure>';
	if (ismacro(v) || issyntax_rules(v)) return '#<macro>';
	if (iscontinuation(v)) return '#<continuation>';
	if (typeof is_js_value !== 'undefined' && is_js_value(v)) return scheme_repr(v, true);
	try { return scheme_repr(v, true); } catch (e) { return '#<value>'; }
}

function debug_classify_exp(exp) {
	if (exp == null || typeof exp === 'boolean') return 'literal';
	if (typeof exp === 'number' || typeof exp === 'string') return 'literal';
	if (isVariable(exp)) return 'variable';
	if (isquoted(exp)) return 'quote';
	if (isassignment(exp)) return 'set!';
	if (isdefine(exp)) return 'define';
	if (isdefine_macro(exp)) return 'define-macro';
	if (isdefine_syntax(exp)) return 'define-syntax';
	if (islet_syntax(exp) || isletrec_syntax(exp)) return 'let-syntax';
	if (islet(exp)) return 'let';
	if (islet_star(exp)) return 'let*';
	if (isletrec(exp)) return 'letrec';
	if (isdo(exp)) return 'do';
	if (isquasiquote(exp)) return 'quasiquote';
	if (isdelay(exp)) return 'delay';
	if (isif(exp)) return 'if';
	if (isand(exp)) return 'and';
	if (isor(exp)) return 'or';
	if (iscase(exp)) return 'case';
	if (islambda(exp)) return 'lambda';
	if (iscase_lambda(exp)) return 'case-lambda';
	if (isbegin(exp)) return 'begin';
	if (iscond(exp)) return 'cond';
	if (isapplication(exp)) return 'application';
	if (self_evaluating(exp)) return 'literal';
	if (exp instanceof Char || exp instanceof SVector || exp instanceof Rational || exp instanceof Complex) return 'literal';
	if (istagged_list(exp, 'macro-capture')) return 'macro-capture';
	return 'other';
}

function debug_env_snapshot(env, maxFrames) {
	maxFrames = maxFrames || 8;
	var frames = [];
	var e = env;
	while (e && frames.length < maxFrames) {
		var vars = {};
		for (var name in e.vars) {
			if (!Object.prototype.hasOwnProperty.call(e.vars, name)) continue;
			vars[name] = debug_value_repr(e.vars[name]);
		}
		frames.push(vars);
		e = e.parent;
	}
	return frames;
}

function debug_normalize_result(v) {
	if (v instanceof Rational && v.d === 1n) return Number(v.n);
	if (is_scheme_number(v)) return +v;
	return v;
}

function debug_record_event(session, evt) {
	evt.id = session.events.length;
	session.events.push(evt);
	session.currentEvent = evt;
}

function debug_should_pause(session) {
	if (session.mode === 'run') return false;
	if (session.mode === 'step-in') return true;
	if (session.mode === 'step-over') {
		return session.depth <= session.stepOverDepth;
	}
	if (session.mode === 'step-out') {
		return session.depth <= session.stepOutDepth;
	}
	return false;
}

function debug_eval_enter(exp, env, k) {
	var session = activeDebugSession;
	if (!session) return null;
	if (session.skipNext) {
		session.skipNext = false;
		return null;
	}

	session.depth++;
	var evt = {
		phase: 'eval',
		depth: session.depth,
		type: debug_classify_exp(exp),
		source: scheme_repr(exp, true),
		env: debug_env_snapshot(env)
	};
	debug_record_event(session, evt);

	if (session.mode === 'run') return null;

	if (debug_should_pause(session)) {
		session.mode = 'paused';
		session.resumeState = { exp: exp, env: env, k: k };
		return bounce(function () { return PAUSE_SENTINEL; });
	}
	return null;
}

function debug_eval_return(exp, env, value) {
	var session = activeDebugSession;
	if (!session) return;
	debug_record_event(session, {
		phase: 'return',
		depth: session.depth,
		type: debug_classify_exp(exp),
		source: scheme_repr(exp, true),
		value: debug_value_repr(value)
	});
	session.depth--;
}

function debug_apply_event(proc, args) {
	var session = activeDebugSession;
	if (!session) return;
	var argStrs = [];
	for (var i = 0; i < args.length; i++) argStrs.push(debug_value_repr(args[i]));
	debug_record_event(session, {
		phase: 'apply',
		depth: session.depth,
		procedure: debug_value_repr(proc),
		arguments: argStrs
	});
}

function debug_wrap_k(exp, env, k) {
	return function (value) {
		debug_eval_return(exp, env, value);
		return k(value);
	};
}

function debug_trampoline_until_pause(b, session) {
	activeDebugSession = session;
	while (b instanceof Bounce) {
		b = b.thunk();
		if (b === PAUSE_SENTINEL) {
			session.status = 'paused';
			return session;
		}
	}
	session.status = 'done';
	session.result = debug_normalize_result(b);
	session._pending = null;
	return session;
}

function debug_resume_session(session, nextMode) {
	if (session.status !== 'paused' || !session.resumeState) return session;
	session.mode = nextMode || 'step-in';
	session.skipNext = true;
	session.status = 'running';
	var st = session.resumeState;
	session.resumeState = null;
	var b = seval(st.exp, st.env, debug_wrap_k(st.exp, st.env, st.k));
	return debug_trampoline_until_pause(b, session);
}

function SchemeDebugSession(code, options) {
	this.code = code;
	this.options = options || {};
	this.events = [];
	this.currentEvent = null;
	this.depth = 0;
	this.mode = this.options.mode || 'step-in';
	this.status = 'idle';
	this.result = null;
	this.error = null;
	this.stepOverDepth = 0;
	this.stepOutDepth = 0;
	this.resumeState = null;
	this.skipNext = false;
	this._trees = [];
	this._treeIndex = 0;
	this._topK = null;

	var tokenizer = new Tokenizer(code);
	while (tokenizer.value() !== '' && tokenizer.value() != null) {
		this._trees.push(parse(tokenizer));
	}
}

SchemeDebugSession.prototype.getState = function () {
	return {
		status: this.status,
		mode: this.mode,
		depth: this.depth,
		eventCount: this.events.length,
		current: this.currentEvent,
		result: this.status === 'done' ? debug_value_repr(debug_normalize_result(this.result)) : null,
		error: this.error
	};
};

SchemeDebugSession.prototype.getEvents = function () {
	return this.events.slice();
};

SchemeDebugSession.prototype._evalNext = function () {
	var self = this;
	if (this._treeIndex >= this._trees.length) {
		return bounce(function () { return self.result; });
	}
	var tree = this._trees[this._treeIndex++];
	if (isdefine_library(tree)) {
		process_define_library(tree);
		return this._evalNext();
	}
	if (isimport_form(tree)) {
		return eval_import(tree, theGlobalEnv, function (v) {
			self.result = v;
			return self._evalNext();
		});
	}
	return seval(tree, theGlobalEnv, debug_wrap_k(tree, theGlobalEnv, function (v) {
		self.result = v;
		return self._evalNext();
	}));
};

SchemeDebugSession.prototype._runTopLevel = function () {
	var self = this;
	try {
		var b = this._evalNext();
		return debug_trampoline_until_pause(b, this);
	} catch (e) {
		this.status = 'error';
		this.error = String(e);
		return this;
	}
};

SchemeDebugSession.prototype.start = function () {
	activeDebugSession = this;
	this.events = [];
	this.depth = 0;
	this._treeIndex = 0;
	this.status = 'running';
	return this._runTopLevel();
};

SchemeDebugSession.prototype.step = function () {
	if (this.status === 'idle') return this.start();
	if (this.status === 'done' || this.status === 'error') return this;
	return debug_resume_session(this, 'step-in');
};

SchemeDebugSession.prototype.stepOver = function () {
	if (this.status === 'idle') {
		this.stepOverDepth = 1;
		return this.start();
	}
	if (this.status === 'paused') {
		this.stepOverDepth = this.depth;
		return debug_resume_session(this, 'step-over');
	}
	return this;
};

SchemeDebugSession.prototype.stepOut = function () {
	if (this.status === 'paused') {
		this.stepOutDepth = Math.max(0, this.depth - 1);
		return debug_resume_session(this, 'step-out');
	}
	return this;
};

SchemeDebugSession.prototype.continue = function () {
	if (this.status === 'idle') {
		this.mode = 'run';
		return this.start();
	}
	if (this.status === 'paused') {
		return debug_resume_session(this, 'run');
	}
	return this;
};

function scheme_debug_start(code, options) {
	return new SchemeDebugSession(code, options);
}

// 同期: 全評価ステップを記録 (再生用)
function scheme_debug_trace(code) {
	var session = new SchemeDebugSession(code, { mode: 'run' });
	activeDebugSession = session;
	session.start();
	activeDebugSession = null;
	return {
		events: session.getEvents(),
		result: debug_normalize_result(session.result),
		error: session.error,
		status: session.status
	};
}

// トレースを前後に辿るヘルパ
function SchemeTraceWalker(trace) {
	this.trace = trace;
	this.index = 0;
}
SchemeTraceWalker.prototype.current = function () {
	return this.trace.events[this.index] || null;
};
SchemeTraceWalker.prototype.next = function () {
	if (this.index < this.trace.events.length - 1) this.index++;
	return this.current();
};
SchemeTraceWalker.prototype.prev = function () {
	if (this.index > 0) this.index--;
	return this.current();
};
SchemeTraceWalker.prototype.go = function (i) {
	this.index = Math.max(0, Math.min(i, this.trace.events.length - 1));
	return this.current();
};

function scheme_trace_walker(trace) {
	return new SchemeTraceWalker(trace);
}


// ===== init.js =====
// init.js — グローバル初期化 / r7rs_large ロード
// プリミティブとグローバル定数を登録
var SBytevector, Box, SText;
(function () {
	var largeLibMap = null;
	var getLargeInstaller = function () {
		if (typeof require !== 'undefined') {
			try { return require('./r7rs_large.js'); } catch (e) { return null; }
		}
		if (typeof window !== 'undefined' && window.install_r7rs_large) return window.install_r7rs_large;
		return null;
	};
	var installer = getLargeInstaller();
	if (installer) {
		var largeResult = installer({
			primitive_procedures: primitive_procedures,
			apply_sync: apply_sync,
			exact_int: exact_int,
			to_jsint: to_jsint,
			ck_num: ck_num,
			is_exact: is_exact,
			make_rat: make_rat,
			array_to_list: array_to_list,
			list_to_array: list_to_array,
			sequal: sequal,
			seqv: seqv,
			Char: Char,
			Pair: Pair,
			SVector: SVector,
			Values: Values,
			scheme_repr: scheme_repr,
			scheme_output: scheme_output,
			port_write_string: port_write_string,
			out_port: out_port
		});
		if (largeResult && largeResult.types) {
			SBytevector = largeResult.types.SBytevector;
			Box = largeResult.types.Box;
			SText = largeResult.types.SText;
		}
		if (largeResult && largeResult.libs) largeLibMap = largeResult.libs;
	}
	for (var i in primitive_procedures) {
		regist_global(i, ["primitive", primitive_procedures[i]]);
	}
	// r7rs_large は別モジュールのため CLI 引数上書きはここで差し替える
	primitive_procedures['command-line'] = function () { return scheme_get_command_line(); };
	regist_global('command-line', ['primitive', primitive_procedures['command-line']]);
	patch_scheme_repr_for_js();
	regist_global('#t', true);
	regist_global('#f', false);
	regist_global('nil', null);
	init_r7rs_libraries(largeLibMap);
})();


// ===== parser.js =====
// parser.js — Tokenizer / parse
Tokenizer = function (code) {
	this.point = 0;
	this.code = code;
	this.current = null;
	this.next();
};

Tokenizer.prototype.value = function () {
	return this.current;
};

// #; の次の 1 つの datum を読み飛ばし、続くトークン先頭の位置を返す
Tokenizer.prototype.skip_datum = function (start) {
	var sub = new Tokenizer(this.code.slice(start));
	if (sub.value() === '' || sub.value() == null) return start;
	parse(sub);
	return start + sub.tokenStart;
};

Tokenizer.prototype.next = function () {
	var inQuote = false;
	var token = "";
	// 先頭の空白・コメントを読み飛ばす(; / #|...|# / #;datum)
	while (this.point < this.code.length) {
		var wc = this.code.charAt(this.point);
		if (wc === ' ' || wc === '\n' || wc === '\t' || wc === '\r') {
			this.point++;
			continue;
		}
		if (wc === ';') {
			while (this.point < this.code.length && this.code.charAt(this.point) !== '\n') this.point++;
			continue;
		}
		if (wc === '#' && this.point + 1 < this.code.length) {
			var nc = this.code.charAt(this.point + 1);
			if (nc === '|') {
				this.point += 2;
				while (this.point + 1 < this.code.length) {
					if (this.code.charAt(this.point) === '|' && this.code.charAt(this.point + 1) === '#') {
						this.point += 2;
						break;
					}
					this.point++;
				}
				continue;
			}
			if (nc === ';') {
				this.point += 2;
				this.point = this.skip_datum(this.point);
				continue;
			}
		}
		break;
	}
	// read 用: このトークンの開始位置(空白/コメント除去後)を記録
	this.tokenStart = this.point;
	loop:
	for (var i = this.point; i < this.code.length; i++) {
		var c = this.code.charAt(i);

		switch (c) {
			case ";":
				// 文字列外の ; は行コメント開始。現在のトークンで区切る。
				if (inQuote) { token += c; break; }
				break loop;
			case "\"":
				inQuote = !inQuote;
				token += c;
				break;
			case "(":
			case ")":
			case "'":
			case "`":
				// 文字列内なら通常の文字として扱う(括弧やクォートを含む文字列を壊さない)
				if (inQuote) {
					token += c;
					break;
				}
				if (token.length > 0)
					break loop;
				i++;
				token = c;
				break loop;
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

	// 数値(整数・有理数・小数・基数/正確さ接頭辞)
	var parsedNum = parse_number(token);
	if (parsedNum !== null) {
		return this.current = parsedNum;
	}
	//symbolのチェック
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
// シンボルはインターン(名前ごとに一意のインスタンス)する。
// これにより (eq? 'a 'a) や memq/assq がシンボルでも正しく動作する。
var SYMBOL_TABLE = {};
function Symbol(str) {
	var existing = SYMBOL_TABLE[str];
	if (existing) return existing;
	this.tag = TAG_SYMBOL;
	this.name = str;
	SYMBOL_TABLE[str] = this;
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
	"define-syntax": true,
	"syntax-rules": true,
	"let-syntax": true,
	"letrec-syntax": true,
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
	"define-library": true,
	"import": true,
	"export": true,
	"case-lambda": true,
	"define-values": true,
	"let-values": true,
	"let*-values": true,
	"cond-expand": true,
	"guard": true,
	"define-record-type": true,
	"include": true,
	"include-ci": true,
	"=>": true,
	"`": true,
	",": true,
	",@": true
};

// ドット対の区切り '.' か?(単独のドットのみ。1.5 等の数値は parse_number 済み)
function is_dot_token(v) {
	return v === '.' || (v instanceof Symbol && v.name === '.');
}

parse = function (tokenizer) {

	var ret;
	if (tokenizer.value() == "(") {
		if (tokenizer.next() == ")") {
			tokenizer.next();
			ret = null;
		} else {
			var elems = [];
			var dottedTail = null;
			var dotted = false;
			// 厳密比較を使う: 数値 0 は loose比較だと 0 == "" が真になり要素が脱落する
			while (tokenizer.value() !== "" && tokenizer.value() !== ")") {
				// ドット対 (a b . c): '.' の後ろの 1 要素が cdr(末尾)になる
				if (is_dot_token(tokenizer.value())) {
					tokenizer.next();
					dottedTail = parse(tokenizer);
					dotted = true;
					break;
				}
				elems[elems.length] = parse(tokenizer);
			}
			if (tokenizer.value() == ")")
				tokenizer.next();
			if (dotted) {
				// 不完全リストを本物の Pair で構築して返す(引用データ用)
				var lst = dottedTail;
				for (var di = elems.length - 1; di >= 0; di--) lst = new Pair(elems[di], lst);
				ret = lst;
			} else {
				ret = elems;
			}
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


// ===== runtime.js =====
// runtime.js — scheme() / REPL / エクスポート
var _callback_ = function (readystatechange) {
	if (readystatechange.target.readyState == 4) { // DONE
		if (readystatechange.target.status == 200) { // OK
			return regist_global('*callback*', readystatechange.target.responseText);
		} else {
			return regist_global('*callback*', readystatechange.target.responseText);
		}
	}
};

scheme = function (code) {
	var tokenizer = new Tokenizer(code);
	var result = null;
	try {
		while (tokenizer.value() !== "" && tokenizer.value() != null) {
			var tree = parse(tokenizer);
			if (isdefine_library(tree)) {
				result = process_define_library(tree);
			} else if (isimport_form(tree)) {
				result = trampoline(eval_import(tree, theGlobalEnv, function (v) { return v; }));
			} else {
				result = trampoline(seval(tree, theGlobalEnv, function (v) { return v; }));
			}
		}
	} catch (e) {
		result = e;
	}
	return result;
};

// 評価して値を返す。エラー時は例外を投げ、display 出力は stdout へ流す。
scheme_run = function (code) {
	var port = make_string_output_port();
	var savedOut = current_output_port_obj;
	current_output_port_obj = port;
	var result = null;
	try {
		var tokenizer = new Tokenizer(code);
		while (tokenizer.value() !== '' && tokenizer.value() != null) {
			var tree = parse(tokenizer);
			if (isdefine_library(tree)) {
				result = process_define_library(tree);
			} else if (isimport_form(tree)) {
				result = trampoline(eval_import(tree, theGlobalEnv, function (v) { return v; }));
			} else {
				result = trampoline(seval(tree, theGlobalEnv, function (v) { return v; }));
			}
		}
	} catch (e) {
		if (port.buffer) scheme_output(port.buffer);
		current_output_port_obj = savedOut;
		throw e;
	}
	current_output_port_obj = savedOut;
	if (port.buffer) scheme_output(port.buffer);
	return result;
};

// Node.js: .scm ファイルを読み込んで評価
scheme_run_file = function (filePath, options) {
	options = options || {};
	if (!NODE_FS) throw 'scheme_run_file: requires Node.js';
	var code = NODE_FS.readFileSync(filePath, 'utf8');
	if (options.argv) scheme_set_command_line(options.argv);
	return scheme_run(code);
};

// JavaScript からグローバル束縛を操作
scheme_set_global = function (name, value) {
	var v = (is_js_value(value) || value instanceof Symbol || value instanceof Pair
		|| is_scheme_number(value) || typeof value === 'boolean' || value === null
		|| typeof value === 'string') ? value : js_to_scheme(value);
	theGlobalEnv.add(String(name), v);
	return v;
};

scheme_get_global = function (name) {
	return theGlobalEnv.find(new Symbol(String(name)));
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

// ------------------------------------------------------------------
// ブラウザ / 埋め込み用 REPL API
//   scheme_repl_eval(code) -> { ok, value, output, error }
//   scheme_input_complete(code) -> 括弧が閉じた 1 式か
// ------------------------------------------------------------------
scheme_input_complete = function (code) {
	return sexpr_complete_p(code);
};

scheme_repl_eval = function (code) {
	var port = make_string_output_port();
	var savedOut = current_output_port_obj;
	current_output_port_obj = port;
	var result = null;
	try {
		var tokenizer = new Tokenizer(code);
		while (tokenizer.value() !== '' && tokenizer.value() != null) {
			var tree = parse(tokenizer);
			result = trampoline(seval(tree, theGlobalEnv, function (v) { return v; }));
		}
		return { ok: true, value: result, output: port.buffer, error: null };
	} catch (e) {
		return { ok: false, value: null, output: port.buffer, error: String(e) };
	} finally {
		current_output_port_obj = savedOut;
	}
};

// DOM 要素に REPL UI を組み立てる(ブラウザ用)
//   opts: { prompt, welcome, onEval }
scheme_repl_ui = function (container, opts) {
	if (typeof document === 'undefined') throw 'scheme_repl_ui: requires a browser';
	opts = opts || {};
	var promptStr = opts.prompt || 'scheme> ';
	var contPrompt = opts.continuationPrompt || '...... ';

	container.innerHTML = '';
	container.classList.add('scheme-repl');

	var transcript = document.createElement('pre');
	transcript.className = 'scheme-repl-transcript';
	transcript.setAttribute('aria-live', 'polite');

	var inputRow = document.createElement('div');
	inputRow.className = 'scheme-repl-input-row';

	var promptEl = document.createElement('span');
	promptEl.className = 'scheme-repl-prompt';
	promptEl.textContent = promptStr;

	var input = document.createElement('textarea');
	input.className = 'scheme-repl-input';
	input.setAttribute('rows', '1');
	input.setAttribute('spellcheck', 'false');
	input.setAttribute('autocapitalize', 'off');
	input.setAttribute('autocomplete', 'off');

	var toolbar = document.createElement('div');
	toolbar.className = 'scheme-repl-toolbar';
	var runBtn = document.createElement('button');
	runBtn.type = 'button';
	runBtn.textContent = '実行';
	var clearBtn = document.createElement('button');
	clearBtn.type = 'button';
	clearBtn.textContent = 'クリア';
	toolbar.appendChild(runBtn);
	toolbar.appendChild(clearBtn);

	inputRow.appendChild(promptEl);
	inputRow.appendChild(input);
	container.appendChild(transcript);
	container.appendChild(inputRow);
	container.appendChild(toolbar);

	var history = [];
	var histIdx = -1;
	var buffer = '';
	var continuation = false;

	function appendTranscript(text, className) {
		var span = document.createElement('span');
		if (className) span.className = className;
		span.textContent = text;
		transcript.appendChild(span);
		transcript.scrollTop = transcript.scrollHeight;
	}

	function appendLine(line, className) {
		appendTranscript(line + '\n', className);
	}

	function resizeInput() {
		input.style.height = 'auto';
		input.style.height = Math.min(input.scrollHeight, 160) + 'px';
	}

	function showWelcome() {
		if (opts.welcome !== false) {
			appendLine('scheme.js REPL — Enter で実行 / Shift+Enter で改行 / ↑↓ で履歴', 'scheme-repl-meta');
		}
	}

	function formatValue(v) {
		if (v === undefined) return '';
		return scheme_repr(v, true);
	}

	function submit() {
		var piece = input.value;
		if (!continuation) buffer = '';
		buffer += (buffer && piece ? '\n' : '') + piece;
		input.value = '';
		resizeInput();

		if (!scheme_input_complete(buffer)) {
			continuation = true;
			promptEl.textContent = contPrompt;
			input.focus();
			return;
		}

		var code = buffer;
		buffer = '';
		continuation = false;
		promptEl.textContent = promptStr;

		if (code.trim() === '') {
			input.focus();
			return;
		}

		history.push(code);
		histIdx = history.length;
		appendTranscript(promptStr, 'scheme-repl-prompt-echo');
		appendLine(code, 'scheme-repl-input-echo');

		var res = scheme_repl_eval(code);
		if (opts.onEval) opts.onEval(res, code);

		if (res.output) appendTranscript(res.output, 'scheme-repl-out');
		if (res.ok) {
			var shown = formatValue(res.value);
			if (shown !== '') appendLine(shown, 'scheme-repl-value');
		} else {
			appendLine('error: ' + res.error, 'scheme-repl-error');
		}
		input.focus();
	}

	input.addEventListener('keydown', function (e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		} else if (e.key === 'ArrowUp' && !e.shiftKey && input.selectionStart === 0) {
			if (history.length && histIdx > 0) {
				e.preventDefault();
				histIdx--;
				input.value = history[histIdx];
				resizeInput();
			}
		} else if (e.key === 'ArrowDown' && !e.shiftKey) {
			if (history.length && histIdx < history.length - 1) {
				e.preventDefault();
				histIdx++;
				input.value = history[histIdx];
				resizeInput();
			} else if (histIdx === history.length - 1) {
				e.preventDefault();
				histIdx = history.length;
				input.value = '';
				resizeInput();
			}
		}
	});
	input.addEventListener('input', resizeInput);

	runBtn.addEventListener('click', submit);
	clearBtn.addEventListener('click', function () {
		transcript.textContent = '';
		showWelcome();
		input.focus();
	});

	showWelcome();
	input.focus();

	return {
		submit: submit,
		clear: function () { clearBtn.click(); },
		getTranscript: function () { return transcript; },
		getInput: function () { return input; }
	};
};

// ------------------------------------------------------------------
// 対話 REPL(Node.js の stdin から read して評価)
//   scheme_repl() または node schemInp.js で起動。
// ------------------------------------------------------------------
scheme_repl = function (prompt) {
	if (!HAS_STDIN) throw 'scheme_repl: interactive stdin requires Node.js';
	prompt = (prompt === undefined) ? '> ' : prompt;
	scheme_output('scheme.js REPL (Ctrl-D で終了)\n');
	while (true) {
		scheme_output(prompt);
		var datum;
		try {
			datum = port_read(STDIN_PORT);
		} catch (e) {
			scheme_output('read error: ' + e + '\n');
			continue;
		}
		if (datum === EOF_OBJECT) {
			scheme_output('\n');
			break;
		}
		try {
			var result = trampoline(seval(to_ast(datum), theGlobalEnv, function (v) { return v; }));
			scheme_output(scheme_repr(result, true) + '\n');
		} catch (e) {
			scheme_output('error: ' + e + '\n');
		}
	}
};

// 直接実行時: 引数があれば .scm 実行、なければ REPL
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
	var cliArgs = process.argv.slice(2);
	if (cliArgs.length === 0) {
		scheme_repl();
	} else {
		try {
			scheme_set_command_line(cliArgs);
			scheme_run_file(require('path').resolve(cliArgs[0]), { argv: cliArgs });
		} catch (e) {
			scheme_output('error: ' + e + '\n');
			process.exit(1);
		}
	}
}

// ブラウザから REPL API を利用できるようにグローバルへ公開
if (typeof window !== 'undefined') {
	window.scheme_repr = scheme_repr;
	window.scheme_repl_eval = scheme_repl_eval;
	window.scheme_input_complete = scheme_input_complete;
	window.scheme_repl_ui = scheme_repl_ui;
	window.scheme_debug_start = scheme_debug_start;
	window.scheme_debug_trace = scheme_debug_trace;
}

// Node.js から利用できるようにエクスポート (ブラウザ環境では無視される)
if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		scheme: scheme,
		scheme_run: scheme_run,
		scheme_run_file: scheme_run_file,
		scheme_eval: scheme_eval,
		repr: scheme_repr,
		scheme_repl: scheme_repl,
		scheme_repl_eval: scheme_repl_eval,
		scheme_input_complete: scheme_input_complete,
		scheme_repl_ui: scheme_repl_ui,
		// JS 相互運用
		toScheme: js_to_scheme,
		fromScheme: scheme_to_js,
		jsWrap: js_to_scheme,
		jsUnwrap: scheme_to_js,
		setCommandLineArguments: scheme_set_command_line,
		setGlobal: scheme_set_global,
		getGlobal: scheme_get_global,
		JsValue: JsValue,
		isJsValue: is_js_value,
		// デバッガ
		scheme_debug_start: scheme_debug_start,
		scheme_debug_trace: scheme_debug_trace,
		scheme_trace_walker: scheme_trace_walker,
		SchemeDebugSession: SchemeDebugSession,
		SchemeTraceWalker: SchemeTraceWalker
	};
}


