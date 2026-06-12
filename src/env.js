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
