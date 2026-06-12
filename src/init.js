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
