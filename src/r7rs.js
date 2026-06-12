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
