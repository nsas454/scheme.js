/**
 * R7RS-large (Red Edition 中心) 標準ライブラリ手続き
 * install(ctx) で schemInp.js に統合する。
 */
function install(ctx) {
	var pp = ctx.primitive_procedures;
	var applySync = ctx.apply_sync;
	var exactInt = ctx.exact_int;
	var toJsInt = ctx.to_jsint;
	var ckNum = ctx.ck_num;
	var isExact = ctx.is_exact;
	var makeRat = ctx.make_rat;
	var arrayToList = ctx.array_to_list;
	var listToArray = ctx.list_to_array;
	var sequal = ctx.sequal;
	var seqv = ctx.seqv;

	function SBytevector(u8) { this.u8 = u8; }
	function Box(val) { this.val = val; }
	function SText(s) { this.s = s; Object.freeze(this); }

	ctx.SBytevector = SBytevector;
	ctx.Box = Box;
	ctx.SText = SText;

	function str(v) { return String(v); }
	function chr(v) { return v instanceof ctx.Char ? v.ch : String(v); }

	// --- bytevector ------------------------------------------------
	function bvLen(b) { return b.u8.length; }
	function bvRef(b, i) { return exactInt(BigInt(b.u8[toJsInt(i)])); }
	function bvSet(b, i, v) { b.u8[toJsInt(i)] = toJsInt(v) & 0xff; }

	var BYTEVECTOR = {
		'bytevector?': function (a) { return a[0] instanceof SBytevector; },
		'make-bytevector': function (a) {
			var n = toJsInt(a[0]), fill = a.length > 1 ? (toJsInt(a[1]) & 0xff) : 0;
			var u8 = new Uint8Array(n);
			if (a.length > 1) u8.fill(fill);
			return new SBytevector(u8);
		},
		'bytevector-length': function (a) { return exactInt(BigInt(bvLen(a[0]))); },
		'bytevector-u8-ref': function (a) { return bvRef(a[0], a[1]); },
		'bytevector-u8-set!': function (a) { bvSet(a[0], a[1], a[2]); return undefined; },
		'bytevector-copy': function (a) { return new SBytevector(a[0].u8.slice()); },
		'bytevector-append': function (a) {
			var parts = [], total = 0;
			for (var i = 0; i < a.length; i++) { parts.push(a[i].u8); total += a[i].u8.length; }
			var out = new Uint8Array(total), pos = 0;
			for (var j = 0; j < parts.length; j++) { out.set(parts[j], pos); pos += parts[j].length; }
			return new SBytevector(out);
		},
		'bytevector->list': function (a) {
			var u8 = a[0].u8, lst = null;
			for (var i = u8.length - 1; i >= 0; i--) lst = new ctx.Pair(exactInt(BigInt(u8[i])), lst);
			return lst;
		},
		'list->bytevector': function (a) {
			var arr = listToArray(a[0]), u8 = new Uint8Array(arr.length);
			for (var i = 0; i < arr.length; i++) u8[i] = toJsInt(arr[i]) & 0xff;
			return new SBytevector(u8);
		},
		'utf8->string': function (a) {
			return new TextDecoder('utf-8').decode(a[0].u8);
		},
		'string->utf8': function (a) {
			return new SBytevector(new TextEncoder().encode(str(a[0])));
		}
	};

	// --- unicode / string (SRFI 13 + Unicode) ----------------------
	var UNICODE = {
		'string-normalize-nfd': function (a) { return str(a[0]).normalize('NFD'); },
		'string-normalize-nfc': function (a) { return str(a[0]).normalize('NFC'); },
		'string-normalize-nfkd': function (a) { return str(a[0]).normalize('NFKD'); },
		'string-normalize-nfkc': function (a) { return str(a[0]).normalize('NFKC'); },
		'string-foldcase': function (a) { return str(a[0]).toLowerCase(); },
		'char-foldcase': function (a) { return new ctx.Char(chr(a[0]).toLowerCase()); },
		'string-titlecase': function (a) {
			var s = str(a[0]);
			return s.replace(/\p{L}+/gu, function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
		},
		'char-titlecase': function (a) { return new ctx.Char(chr(a[0]).toUpperCase()); },
		'string-null?': function (a) { return str(a[0]).length === 0; },
		'string-fill!': function (a) {
			var c = chr(a[1]), n = str(a[0]).length, s = '';
			for (var i = 0; i < n; i++) s += c;
			return s;
		},
		'string-copy!': function (a) {
			var target = str(a[0]), src = str(a[1]);
			var tstart = a.length > 2 ? toJsInt(a[2]) : 0;
			var sstart = a.length > 3 ? toJsInt(a[3]) : 0;
			var send = a.length > 4 ? toJsInt(a[4]) : src.length;
			var arr = target.split('');
			for (var i = sstart, j = tstart; i < send; i++, j++) arr[j] = src.charAt(i);
			return arr.join('');
		},
		'string-set!': function (a) {
			var s = str(a[0]), k = toJsInt(a[1]), c = chr(a[2]);
			return s.substring(0, k) + c + s.substring(k + 1);
		},
		'string-map': function (a) {
			var proc = a[0], s = str(a[1]), out = '';
			for (var i = 0; i < s.length; i++) {
				var r = applySync(proc, [new ctx.Char(s.charAt(i))]);
				out += (r instanceof ctx.Char) ? r.ch : str(r);
			}
			return out;
		},
		'string-for-each': function (a) {
			var proc = a[0], s = str(a[1]);
			for (var i = 0; i < s.length; i++) applySync(proc, [new ctx.Char(s.charAt(i))]);
			return undefined;
		},
		'string-index': function (a) {
			var s = str(a[0]), c = chr(a[1]), start = a.length > 2 ? toJsInt(a[2]) : 0;
			var i = s.indexOf(c, start);
			return i < 0 ? false : exactInt(BigInt(i));
		},
		'string-index-right': function (a) {
			var s = str(a[0]), c = chr(a[1]);
			var i = s.lastIndexOf(c);
			return i < 0 ? false : exactInt(BigInt(i));
		},
		'string-skip': function (a) {
			var s = str(a[0]), pred = a[1], start = a.length > 2 ? toJsInt(a[2]) : 0;
			for (var i = start; i < s.length; i++) {
				if (!applySync(pred, [new ctx.Char(s.charAt(i))])) return exactInt(BigInt(i));
			}
			return false;
		},
		'string-skip-right': function (a) {
			var s = str(a[0]), pred = a[1];
			for (var i = s.length - 1; i >= 0; i--) {
				if (!applySync(pred, [new ctx.Char(s.charAt(i))])) return exactInt(BigInt(i));
			}
			return false;
		},
		'string-count': function (a) {
			var s = str(a[0]), c = chr(a[1]), n = 0;
			for (var i = 0; i < s.length; i++) if (s.charAt(i) === c) n++;
			return exactInt(BigInt(n));
		},
		'string-contains': function (a) {
			var hay = str(a[0]), needle = str(a[1]);
			var i = hay.indexOf(needle);
			return i < 0 ? false : exactInt(BigInt(i));
		},
		'string-prefix-length': function (a) {
			var s1 = str(a[0]), s2 = str(a[1]), n = Math.min(s1.length, s2.length), i = 0;
			while (i < n && s1.charAt(i) === s2.charAt(i)) i++;
			return exactInt(BigInt(i));
		}
	};

	// --- vector (SRFI 133) -----------------------------------------
	var VECTOR = {
		'vector-empty?': function (a) { return a[0].items.length === 0; },
		'vector-map': function (a) {
			var proc = a[0], src = a[1].items, out = [];
			for (var i = 0; i < src.length; i++) out.push(applySync(proc, [src[i]]));
			return new ctx.SVector(out);
		},
		'vector-for-each': function (a) {
			var proc = a[0], src = a[1].items;
			for (var i = 0; i < src.length; i++) applySync(proc, [src[i]]);
			return undefined;
		},
		'vector-append': function (a) {
			var out = [];
			for (var i = 0; i < a.length; i++) out = out.concat(a[i].items);
			return new ctx.SVector(out);
		},
		'vector->string': function (a) {
			var s = '';
			for (var i = 0; i < a[0].items.length; i++) {
				var x = a[0].items[i];
				s += (x instanceof ctx.Char) ? x.ch : str(x);
			}
			return s;
		},
		'string->vector': function (a) {
			var s = str(a[0]), out = [];
			for (var i = 0; i < s.length; i++) out.push(new ctx.Char(s.charAt(i)));
			return new ctx.SVector(out);
		}
	};

	// --- list (SRFI 1 拡張) ----------------------------------------
	function listTake(lst, n) {
		var out = null, tail = null;
		while (n-- > 0 && lst instanceof ctx.Pair) {
			var c = new ctx.Pair(lst.car, null);
			if (!out) { out = c; tail = c; } else { tail.cdr = c; tail = c; }
			lst = lst.cdr;
		}
		return out;
	}
	function listDrop(lst, n) {
		while (n-- > 0 && lst instanceof ctx.Pair) lst = lst.cdr;
		return lst;
	}

	var LIST = {
		'xcons': function (a) { return new ctx.Pair(a[1], a[0]); },
		'cons*': function (a) {
			var lst = a[a.length - 1], i = a.length - 2;
			while (i >= 0) lst = new ctx.Pair(a[i], lst);
			return lst;
		},
		'count': function (a) {
			var pred = a[0], lst = a[1], n = 0;
			while (lst instanceof ctx.Pair) { if (applySync(pred, [lst.car])) n++; lst = lst.cdr; }
			return exactInt(BigInt(n));
		},
		'remove': function (a) {
			var x = a[0], lst = a[1], out = null, tail = null;
			while (lst instanceof ctx.Pair) {
				if (!sequal(x, lst.car)) {
					var c = new ctx.Pair(lst.car, null);
					if (!out) { out = c; tail = c; } else { tail.cdr = c; tail = c; }
				}
				lst = lst.cdr;
			}
			return out;
		},
		'remq': function (a) {
			var x = a[0], lst = a[1], out = null, tail = null;
			while (lst instanceof ctx.Pair) {
				if (!seqv(x, lst.car)) {
					var c = new ctx.Pair(lst.car, null);
					if (!out) { out = c; tail = c; } else { tail.cdr = c; tail = c; }
				}
				lst = lst.cdr;
			}
			return out;
		},
		'remv': function (a) { return LIST['remq'](a); },
		'filter-map': function (a) {
			var proc = a[0], lst = a[1], out = null, tail = null;
			while (lst instanceof ctx.Pair) {
				var r = applySync(proc, [lst.car]);
				if (r !== false) {
					var c = new ctx.Pair(r, null);
					if (!out) { out = c; tail = c; } else { tail.cdr = c; tail = c; }
				}
				lst = lst.cdr;
			}
			return out;
		},
		'partition': function (a) {
			var pred = a[0], lst = a[1], yes = null, ytail = null, no = null, ntail = null;
			while (lst instanceof ctx.Pair) {
				var c = new ctx.Pair(lst.car, null);
				if (applySync(pred, [lst.car])) {
					if (!yes) { yes = c; ytail = c; } else { ytail.cdr = c; ytail = c; }
				} else {
					if (!no) { no = c; ntail = c; } else { ntail.cdr = c; ntail = c; }
				}
				lst = lst.cdr;
			}
			return new ctx.Pair(yes, no);
		},
		'reduce': function (a) {
			var f = a[0], init = a[1], lst = a[2], acc = init;
			while (lst instanceof ctx.Pair) { acc = applySync(f, [acc, lst.car]); lst = lst.cdr; }
			return acc;
		},
		'reduce-right': function (a) {
			var f = a[0], init = a[1], lst = a[2];
			function go(l) { return (l instanceof ctx.Pair) ? applySync(f, [l.car, go(l.cdr)]) : init; }
			return go(lst);
		},
		'find-tail': function (a) {
			var pred = a[0], lst = a[1];
			while (lst instanceof ctx.Pair) {
				if (applySync(pred, [lst.car])) return lst;
				lst = lst.cdr;
			}
			return false;
		},
		'take': function (a) { return listTake(a[1], toJsInt(a[0])); },
		'drop': function (a) { return listDrop(a[1], toJsInt(a[0])); },
		'last': function (a) {
			var lst = a[0], last = false;
			while (lst instanceof ctx.Pair) { last = lst.car; lst = lst.cdr; }
			return last;
		},
		'first': function (a) { return a[0] instanceof ctx.Pair ? a[0].car : false; },
		'second': function (a) { return a[0] instanceof ctx.Pair && a[0].cdr instanceof ctx.Pair ? a[0].cdr.car : false; },
		'third': function (a) {
			var p = a[0];
			return (p instanceof ctx.Pair && p.cdr instanceof ctx.Pair && p.cdr.cdr instanceof ctx.Pair) ? p.cdr.cdr.car : false;
		},
		'list-tabulate': function (a) {
			var n = toJsInt(a[0]), proc = a[1], out = null, tail = null;
			for (var i = 0; i < n; i++) {
				var c = new ctx.Pair(applySync(proc, [exactInt(BigInt(i))]), null);
				if (!out) { out = c; tail = c; } else { tail.cdr = c; tail = c; }
			}
			return out;
		},
		'list-copy-tree': function (a) {
			function copy(l) {
				if (!(l instanceof ctx.Pair)) return l;
				return new ctx.Pair(copy(l.car), copy(l.cdr));
			}
			return copy(a[0]);
		},
		'concatenate': function (a) {
			var out = null;
			for (var i = 0; i < a.length; i++) {
				var l = a[i];
				if (!out) out = l;
				else {
					var p = out;
					while (p instanceof ctx.Pair && p.cdr instanceof ctx.Pair) p = p.cdr;
					if (p instanceof ctx.Pair) p.cdr = l;
				}
			}
			return out;
		}
	};

	// --- hash-table (SRFI 125 拡張) --------------------------------
	var HASH = {
		'hash-table-size': function (a) { return exactInt(BigInt(a[0].map.size)); },
		'hash-table-clear!': function (a) { a[0].map.clear(); return undefined; },
		'hash-table-update!': function (a) {
			var ht = a[0], key = a[1], proc = a[2];
			var cur = ht.map.has(key) ? ht.map.get(key) : (a.length > 3 ? a[3] : undefined);
			ht.map.set(key, applySync(proc, [cur]));
			return undefined;
		},
		'equal-hash': function (a) {
			var h = 0, s = JSON.stringify(a[0], function (_, v) {
				if (v && v.typeName) return ['record', v.typeName, v.fields];
				return v;
			});
			for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
			return exactInt(BigInt(Math.abs(h)));
		},
		'string-hash': function (a) {
			var s = str(a[0]), h = 0;
			for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
			return exactInt(BigInt(Math.abs(h)));
		}
	};

	// --- sort (SRFI 132) -------------------------------------------
	function compareValues(a, b, less) {
		if (less) return applySync(less, [a, b]);
		if (typeof a === 'number' && typeof b === 'number') return a - b;
		if (isExact(a) && isExact(b)) return Number(a.n * b.d - b.n * a.d);
		return str(a) < str(b) ? -1 : (str(a) > str(b) ? 1 : 0);
	}
	function listSort(less, lst) {
		var arr = listToArray(lst);
		arr.sort(function (x, y) { return compareValues(x, y, less); });
		return arrayToList(arr);
	}
	function vectorSort(less, vec) {
		var items = vec.items.slice();
		items.sort(function (x, y) { return compareValues(x, y, less); });
		return new ctx.SVector(items);
	}
	function isSorted(less, lst) {
		var prev = null, first = true;
		while (lst instanceof ctx.Pair) {
			if (!first && compareValues(prev, lst.car, less) > 0) return false;
			prev = lst.car; first = false; lst = lst.cdr;
		}
		return true;
	}

	var SORT = {
		'list-sort': function (a) { return listSort(a.length > 1 ? a[0] : null, a[a.length - 1]); },
		'list-stable-sort': function (a) { return listSort(a.length > 1 ? a[0] : null, a[a.length - 1]); },
		'vector-sort!': function (a) {
			var less = a.length > 1 ? a[0] : null, vec = a[a.length - 1];
			vec.items.sort(function (x, y) { return compareValues(x, y, less); });
			return undefined;
		},
		'vector-sort': function (a) { return vectorSort(a.length > 1 ? a[0] : null, a[a.length - 1]); },
		'sorted?': function (a) { return isSorted(a.length > 1 ? a[0] : null, a[a.length - 1]); }
	};

	// --- division (R7RS) -------------------------------------------
	function r7rsDiv(a, b) {
		a = ckNum(a, 'div'); b = ckNum(b, 'div');
		if (isExact(a) && isExact(b)) {
			if (b.n === 0n) throw 'division by zero';
			var num = a.n * b.d, den = b.n * a.d;
			if (den < 0n) { num = -num; den = -den; }
			var q = num / den, r = num % den;
			if (r !== 0n && num < 0n) q -= 1n;
			return makeRat(q, 1n);
		}
		var af = +a, bf = +b, qf = Math.trunc(af / bf);
		if (af / bf !== qf && af < 0) qf -= 1;
		return qf;
	}
	function r7rsMod(a, b) {
		a = ckNum(a, 'mod'); b = ckNum(b, 'mod');
		var q = r7rsDiv(a, b);
		if (isExact(a) && isExact(b) && isExact(q)) {
			// mod = a - q*b
			return makeRat(a.n * b.d - q.n * b.n * a.d, a.d * b.d);
		}
		return +a - (+q) * (+b);
	}
	var DIVISION = {
		'div': function (a) { return r7rsDiv(a[0], a[1]); },
		'mod': function (a) { return r7rsMod(a[0], a[1]); },
		'div-and-mod': function (a) { return new ctx.Values([r7rsDiv(a[0], a[1]), r7rsMod(a[0], a[1])]); },
		'div0': function (a) {
			var x = ckNum(a[0], 'div0'), y = ckNum(a[1], 'div0');
			if ((isExact(y) && y.n === 0n) || y === 0) return 0;
			return r7rsDiv(x, y);
		},
		'mod0': function (a) {
			var x = ckNum(a[0], 'mod0'), y = ckNum(a[1], 'mod0');
			if ((isExact(y) && y.n === 0n) || y === 0) return x;
			return r7rsMod(x, y);
		},
		'exact-integer-sqrt': function (a) {
			var n = ckNum(a[0], 'exact-integer-sqrt');
			var ni = isExact(n) ? n.n / n.d : BigInt(Math.trunc(n));
			if (ni < 0n) throw 'exact-integer-sqrt: negative';
			var x = ni, y = (x + 1n) / 2n;
			while (y < x) { x = y; y = (x + ni / x) / 2n; }
			var r = ni - x * x;
			return new ctx.Values([exactInt(x), exactInt(r)]);
		}
	};

	// --- inexact ---------------------------------------------------
	var INEXACT = {
		'finite?': function (a) { return typeof a[0] === 'number' && isFinite(a[0]); },
		'infinite?': function (a) { return typeof a[0] === 'number' && !isFinite(a[0]); },
		'nan?': function (a) { return typeof a[0] === 'number' && isNaN(a[0]); },
		'+nan.0': function () { return NaN; },
		'+inf.0': function () { return Infinity; },
		'-inf.0': function () { return -Infinity; }
	};

	// --- random ----------------------------------------------------
	var _randSeed = Date.now() % 2147483647;
	function lcg() { _randSeed = (_randSeed * 48271) % 2147483647; return _randSeed; }
	var RANDOM = {
		'random-integer': function (a) {
			var n = toJsInt(a[0]);
			if (n <= 0) return exactInt(0n);
			return exactInt(BigInt(lcg() % n));
		},
		'random-real': function () { return lcg() / 2147483647; },
		'random-sample': function (a) {
			var n = toJsInt(a[0]), lst = a[1], len = 0, p = lst;
			while (p instanceof ctx.Pair) { len++; p = p.cdr; }
			var out = null, tail = null;
			for (var i = 0; i < n && len > 0; i++) {
				var k = lcg() % len, q = lst, idx = 0;
				while (idx < k && q instanceof ctx.Pair) { q = q.cdr; idx++; }
				if (q instanceof ctx.Pair) {
					var c = new ctx.Pair(q.car, null);
					if (!out) { out = c; tail = c; } else { tail.cdr = c; tail = c; }
				}
			}
			return out;
		}
	};

	// --- process-context / time ------------------------------------
	var PROCESS = {
		'command-line': function () {
			var args = (typeof process !== 'undefined' && process.argv) ? process.argv.slice(2) : [];
			return arrayToList(args);
		},
		'get-environment-variable': function (a) {
			if (typeof process === 'undefined' || !process.env) return false;
			var v = process.env[str(a[0])];
			return v === undefined ? false : v;
		},
		'emergency-exit': function (a) {
			if (typeof process !== 'undefined') process.exit(a.length ? toJsInt(a[0]) : 1);
			return undefined;
		},
		'exit': function (a) {
			if (typeof process !== 'undefined') process.exit(a.length ? toJsInt(a[0]) : 0);
			return undefined;
		}
	};
	var TIME = {
		'current-second': function () { return exactInt(BigInt(Math.floor(Date.now() / 1000))); },
		'jiffies': function () { return exactInt(BigInt(Date.now())); }
	};

	// --- box -------------------------------------------------------
	var BOX = {
		'box': function (a) { return new Box(a[0]); },
		'box?': function (a) { return a[0] instanceof Box; },
		'unbox': function (a) { return a[0].val; },
		'set-box!': function (a) { a[0].val = a[1]; return undefined; }
	};

	// --- generator (SRFI 121 抜粋) ---------------------------------
	function makeGenerator(thunk) { return { _gen: true, thunk: thunk, done: false, val: undefined }; }
	function genRun(g) {
		if (g.done) return false;
		g.val = g.thunk();
		if (g.val === false || g.val === null) { g.done = true; return false; }
		return true;
	}
	var GENERATOR = {
		'make-iota-generator': function (a) {
			var count = toJsInt(a[0]), start = a.length > 1 ? toJsInt(a[1]) : 0, step = a.length > 2 ? toJsInt(a[2]) : 1;
			var i = 0;
			return makeGenerator(function () { return i < count ? exactInt(BigInt(start + step * i++)) : false; });
		},
		'make-list-generator': function (a) {
			var lst = a[0];
			return makeGenerator(function () {
				if (lst instanceof ctx.Pair) { var v = lst.car; lst = lst.cdr; return v; }
				return false;
			});
		},
		'generator?': function (a) { return !!(a[0] && a[0]._gen); },
		'generator-next!': function (a) {
			return genRun(a[0]) ? a[0].val : false;
		},
		'g-for-each': function (a) {
			var proc = a[0], g = a[1];
			while (genRun(g)) applySync(proc, [g.val]);
			return undefined;
		},
		'g-collect': function (a) {
			var g = a[0], out = null, tail = null;
			while (genRun(g)) {
				var c = new ctx.Pair(g.val, null);
				if (!out) { out = c; tail = c; } else { tail.cdr = c; tail = c; }
			}
			return out;
		}
	};

	// --- stream (SRFI 41 抜粋) ------------------------------------
	var STREAM_NULL = { _stream: true, empty: true };
	function streamCons(x, s) { return { _stream: true, empty: false, car: x, cdr: s }; }
	function streamForce(s) {
		if (!s._stream) return s;
		if (s.empty) return STREAM_NULL;
		if (s._forced) return s._val;
		if (typeof s.cdr === 'function') { s._val = s.cdr(); s._forced = true; return s._val; }
		return s.cdr;
	}
	var STREAM = {
		'stream-null': STREAM_NULL,
		'stream-cons': function (a) { return streamCons(a[0], a[1]); },
		'stream?': function (a) { return !!(a[0] && a[0]._stream); },
		'stream-null?': function (a) { return a[0]._stream && a[0].empty; },
		'stream-pair?': function (a) { return a[0]._stream && !a[0].empty; },
		'stream-car': function (a) { return a[0].car; },
		'stream-cdr': function (a) { return streamForce(a[0]); },
		'stream-lambda': function () { return STREAM['stream-cons']; }
	};

	// --- text (SRFI 135 抜粋) --------------------------------------
	var TEXT = {
		'text?': function (a) { return a[0] instanceof SText; },
		'textual?': function (a) { return typeof a[0] === 'string' || a[0] instanceof SText; },
		'string->text': function (a) { return new SText(str(a[0])); },
		'text->string': function (a) { return a[0] instanceof SText ? a[0].s : str(a[0]); },
		'text-length': function (a) { return exactInt(BigInt(a[0].s.length)); },
		'text-ref': function (a) { return new ctx.Char(a[0].s.charAt(toJsInt(a[1]))); },
		'text=': function (a) { return a[0].s === a[1].s; }
	};

	// --- write -----------------------------------------------------
	var WRITE = {
		'write-simple': function (a) {
			var s = ctx.scheme_repr(a[0], true);
			if (a.length > 1) ctx.port_write_string(ctx.out_port(a[1]), s);
			else ctx.scheme_output(s);
			return undefined;
		}
	};

	// --- 統合 ------------------------------------------------------
	var ALL = {};
	function merge(obj) { for (var k in obj) ALL[k] = obj[k]; }
	merge(BYTEVECTOR); merge(UNICODE); merge(VECTOR); merge(LIST);
	merge(HASH); merge(SORT); merge(DIVISION); merge(INEXACT);
	merge(RANDOM); merge(PROCESS); merge(TIME); merge(BOX);
	merge(GENERATOR); merge(STREAM); merge(TEXT); merge(WRITE);

	for (var name in ALL) pp[name] = ALL[name];

	// ライブラリ export 名リスト (Red Edition + small 分割)
	var LIBS = {
		'scheme bytevector': Object.keys(BYTEVECTOR),
		'scheme unicode': Object.keys(UNICODE),
		'scheme string': ['string-map', 'string-for-each', 'string-index', 'string-index-right',
			'string-skip', 'string-skip-right', 'string-count', 'string-contains', 'string-prefix-length',
			'string-null?', 'string-fill!', 'string-copy!', 'string-set!'],
		'scheme vector': Object.keys(VECTOR).concat(['vector-copy', 'vector-copy!', 'vector-fill!']),
		'scheme list': Object.keys(LIST).concat(['filter', 'fold-left', 'fold-right', 'find', 'any', 'every']),
		'scheme hash-table': Object.keys(HASH).concat(['make-hash-table', 'hash-table?', 'hash-table-ref',
			'hash-table-set!', 'hash-table-delete!', 'hash-table-contains?', 'hash-table-keys', 'hash-table-values']),
		'scheme sort': Object.keys(SORT),
		'scheme division': Object.keys(DIVISION),
		'scheme inexact': Object.keys(INEXACT),
		'scheme random': Object.keys(RANDOM),
		'scheme process-context': Object.keys(PROCESS),
		'scheme time': Object.keys(TIME),
		'scheme box': Object.keys(BOX),
		'scheme generator': Object.keys(GENERATOR),
		'scheme stream': Object.keys(STREAM),
		'scheme text': Object.keys(TEXT),
		'scheme write': Object.keys(WRITE).concat(['display', 'write', 'newline']),
		'scheme char': ['char-foldcase', 'char-titlecase', 'char-ci=?', 'char-ci<?', 'char-ci>?',
			'char-ci<=?', 'char-ci>=?', 'char-upcase', 'char-downcase'],
		'scheme cxr': ['caar', 'cadr', 'cdar', 'cddr', 'caaar', 'caadr', 'cadar', 'caddr',
			'cdaar', 'cdadr', 'cddar', 'cdddr', 'cadddr'],
		'scheme complex': ['make-rectangular', 'make-polar', 'real-part', 'imag-part', 'magnitude', 'angle'],
		'scheme eval': ['eval'],
		'scheme read': ['read', 'read-char', 'peek-char', 'read-line', 'eof-object?'],
		'scheme file': ['open-input-file', 'open-output-file', 'call-with-input-file', 'call-with-output-file',
			'with-input-from-file', 'with-output-to-file', 'file-exists?'],
		'scheme lazy': ['delay', 'force'],
		'scheme load': ['load']
	};

	// (scheme red) — Red Edition 全ライブラリ
	var red = [];
	for (var lib in LIBS) red = red.concat(LIBS[lib]);
	LIBS['scheme red'] = red.filter(function (v, i, a) { return a.indexOf(v) === i; });

	return { libs: LIBS, types: { SBytevector: SBytevector, Box: Box, SText: SText } };
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = install;
}
if (typeof window !== 'undefined') {
	window.install_r7rs_large = install;
}
