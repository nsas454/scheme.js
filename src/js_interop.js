// js_interop.js — JavaScript 相互運用
// ==================================================================
// JsValue で JS オブジェクト・関数を Scheme から透過的に操作する。
//
// 低レベル API:
//   js-global / js-ref / js-set! / js-call / js-invoke / js-new
//   js-get / js-apply / js-array / js-object / js-typeof / js-in?
//
// 糖衣構文 (起動時に define-syntax 登録):
//   (. obj field)           → (js-ref obj "field")
//   (. obj method arg ...)  → (js-call obj "method" arg ...)
//   (jslog arg ...)        → console.log
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

function js_collect_args(args, start) {
	var out = [];
	for (var i = start; i < args.length; i++) out.push(scheme_to_js(args[i]));
	return out;
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

function js_pair_entries(args) {
	var obj = {};
	for (var i = 0; i < args.length; i++) {
		var pair = args[i];
		var k, v;
		if (pair instanceof Pair) {
			k = js_key(pair.car);
			v = scheme_to_js(pair.cdr);
		} else if (pair instanceof Array && pair.length >= 2) {
			k = js_key(pair[0]);
			v = scheme_to_js(pair[1]);
		} else {
			throw 'js-object: expected (key . value) pairs';
		}
		obj[k] = v;
	}
	return obj;
}

var JS_INTEROP_PRIMITIVES = {
	'js-value?': function (args) { return is_js_value(args[0]); },
	'js?': function (args) {
		var x = args[0];
		if (x === null || x === true || x === false) return true;
		if (typeof x === 'number' || typeof x === 'string') return true;
		return is_js_value(x);
	},
	'js-null?': function (args) {
		if (args[0] === null) return true;
		return is_js_value(args[0]) && (args[0].val === null || args[0].val === undefined);
	},
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
	'js-get': function (args) {
		var cur = scheme_to_js(args[0]);
		for (var i = 1; i < args.length; i++) {
			if (cur == null) return null;
			cur = cur[js_key(args[i])];
		}
		return js_to_scheme(cur);
	},
	'js-call': function (args) {
		var obj = scheme_to_js(args[0]);
		var name = js_key(args[1]);
		var fn = obj[name];
		if (typeof fn !== 'function') throw ('js-call: not a function: ' + name);
		return js_to_scheme(fn.apply(obj, js_collect_args(args, 2)));
	},
	'js-invoke': function (args) {
		var fn = scheme_to_js(args[0]);
		if (typeof fn !== 'function') throw 'js-invoke: not a function';
		return js_to_scheme(fn.apply(undefined, js_collect_args(args, 1)));
	},
	'js-apply': function (args) {
		var fn = scheme_to_js(args[0]);
		if (typeof fn !== 'function') throw 'js-apply: not a function';
		var rest = js_collect_args(args, 1);
		var callArgs = rest.length === 1 && Array.isArray(rest[0]) ? rest[0] : rest;
		return js_to_scheme(fn.apply(undefined, callArgs));
	},
	'js-new': function (args) {
		var Ctor = scheme_to_js(args[0]);
		if (typeof Ctor !== 'function') throw 'js-new: not a constructor';
		return js_to_scheme(Reflect.construct(Ctor, js_collect_args(args, 1)));
	},
	'js-array': function (args) {
		return new JsValue(js_collect_args(args, 0));
	},
	'js-object': function (args) {
		return new JsValue(js_pair_entries(args));
	},
	'js-length': function (args) {
		var v = scheme_to_js(args[0]);
		if (v == null) return 0;
		if (typeof v.length === 'number') return v.length;
		throw 'js-length: no length property';
	},
	'js-typeof': function (args) {
		var v = scheme_to_js(args[0]);
		return typeof v;
	},
	'js-in?': function (args) {
		var obj = scheme_to_js(args[0]);
		var key = js_key(args[1]);
		if (obj == null || (typeof obj !== 'object' && typeof obj !== 'function')) return false;
		return Object.prototype.hasOwnProperty.call(obj, key);
	},
	'js-instanceof?': function (args) {
		var v = scheme_to_js(args[0]);
		var Ctor = scheme_to_js(args[1]);
		if (typeof Ctor !== 'function') throw 'js-instanceof?: not a constructor';
		return v instanceof Ctor;
	},
	'js-unwrap': function (args) {
		var v = args[0];
		return is_js_value(v) ? v.val : scheme_to_js(v);
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

// scheme_repr 用
var _js_repr_patched = false;
function patch_scheme_repr_for_js() {
	if (_js_repr_patched) return;
	_js_repr_patched = true;
	var orig = scheme_repr;
	scheme_repr = function (x, writeMode) {
		if (is_js_value(x)) {
			var v = x.val;
			if (typeof v === 'function') return '#<js:function>';
			if (Array.isArray(v)) return '#<js:Array[' + v.length + ']>';
			var tag = Object.prototype.toString.call(v);
			return '#<js:' + tag.slice(8, -1) + '>';
		}
		return orig(x, writeMode);
	};
}

// 糖衣構文 (jsdot / jslog / jsnew) をグローバル登録 (parser 読込後に runtime から呼ぶ)
function install_js_syntax() {
	if (install_js_syntax.done) return;
	install_js_syntax.done = true;
	// ref: (jsdot obj field)  /  call: (jsdot obj method arg ...)
	var forms = [
		'(define-syntax jsdot ' +
		'(syntax-rules () ' +
		'((_ obj name) (js-ref obj (quote name))) ' +
		'((_ obj name arg1 arg ...) (js-call obj (quote name) arg1 arg ...))))',
		'(define-syntax jsdot! ' +
		'(syntax-rules () ' +
		'((_ obj name) (js-call obj (quote name)))))',
		'(define-syntax jslog ' +
		'(syntax-rules () ' +
		'((_ arg ...) (js-call (js-ref (js-global) "console") "log" arg ...))))',
		'(define-syntax jsnew ' +
		'(syntax-rules () ' +
		'((_ Class arg ...) (js-new (js-ref (js-global) (quote Class)) arg ...))))',
		'(define js-window (js-global))'
	];
	for (var i = 0; i < forms.length; i++) {
		var tokenizer = new Tokenizer(forms[i]);
		while (tokenizer.value() !== '' && tokenizer.value() != null) {
			var tree = parse(tokenizer);
			trampoline(seval(tree, theGlobalEnv, function (v) { return v; }));
		}
	}
}
install_js_syntax.done = false;
