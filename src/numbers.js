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
