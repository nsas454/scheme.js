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
