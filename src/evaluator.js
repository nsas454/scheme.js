// evaluator.js — CPS 評価器 / マクロ / s_apply
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
