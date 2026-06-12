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
