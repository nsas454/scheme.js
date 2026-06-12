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
