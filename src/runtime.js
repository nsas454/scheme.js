// runtime.js — scheme() / REPL / エクスポート
var _callback_ = function (readystatechange) {
	if (readystatechange.target.readyState == 4) { // DONE
		if (readystatechange.target.status == 200) { // OK
			return regist_global('*callback*', readystatechange.target.responseText);
		} else {
			return regist_global('*callback*', readystatechange.target.responseText);
		}
	}
};

scheme = function (code) {
	var tokenizer = new Tokenizer(code);
	var result = null;
	try {
		while (tokenizer.value() !== "" && tokenizer.value() != null) {
			var tree = parse(tokenizer);
			if (isdefine_library(tree)) {
				result = process_define_library(tree);
			} else if (isimport_form(tree)) {
				result = trampoline(eval_import(tree, theGlobalEnv, function (v) { return v; }));
			} else {
				result = trampoline(seval(tree, theGlobalEnv, function (v) { return v; }));
			}
		}
	} catch (e) {
		result = e;
	}
	return result;
};

// 評価して値を返す。エラー時は例外を投げ、display 出力は stdout へ流す。
scheme_run = function (code) {
	var port = make_string_output_port();
	var savedOut = current_output_port_obj;
	current_output_port_obj = port;
	var result = null;
	try {
		var tokenizer = new Tokenizer(code);
		while (tokenizer.value() !== '' && tokenizer.value() != null) {
			var tree = parse(tokenizer);
			if (isdefine_library(tree)) {
				result = process_define_library(tree);
			} else if (isimport_form(tree)) {
				result = trampoline(eval_import(tree, theGlobalEnv, function (v) { return v; }));
			} else {
				result = trampoline(seval(tree, theGlobalEnv, function (v) { return v; }));
			}
		}
	} catch (e) {
		if (port.buffer) scheme_output(port.buffer);
		current_output_port_obj = savedOut;
		throw e;
	}
	current_output_port_obj = savedOut;
	if (port.buffer) scheme_output(port.buffer);
	return result;
};

// Node.js: .scm ファイルを読み込んで評価
scheme_run_file = function (filePath, options) {
	options = options || {};
	if (!NODE_FS) throw 'scheme_run_file: requires Node.js';
	var code = NODE_FS.readFileSync(filePath, 'utf8');
	if (options.argv) scheme_set_command_line(options.argv);
	return scheme_run(code);
};

// JavaScript からグローバル束縛を操作
scheme_set_global = function (name, value) {
	var v = (is_js_value(value) || value instanceof Symbol || value instanceof Pair
		|| is_scheme_number(value) || typeof value === 'boolean' || value === null
		|| typeof value === 'string') ? value : js_to_scheme(value);
	theGlobalEnv.add(String(name), v);
	return v;
};

scheme_get_global = function (name) {
	return theGlobalEnv.find(new Symbol(String(name)));
};
// ------------------------------------------------------------------
// ブラウザ連携: <script type="text/scheme"> ... </script> を自動実行
//   ページ内の Scheme スクリプトブロックを上から順に評価する。
//   src 属性があれば外部ファイルを読み込んで実行する。
//   例:
//     <script src="schemInp.js"></script>
//     <script type="text/scheme">
//       (display (+ 1 2 3))
//     </script>
//     <script type="text/scheme" src="hello.scm"></script>
// ------------------------------------------------------------------
var SCHEME_SCRIPT_TYPES = {
	'text/scheme': true,
	'text/x-scheme': true,
	'application/scheme': true,
	'text/lisp': true
};

// 外部ファイルを同期取得する (スクリプトの実行順序を保つため)
fetch_scheme_source = function (url) {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', url, false);
	xhr.send(null);
	if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 0) {
		return xhr.responseText;
	}
	throw ('Failed to load scheme source: ' + url + ' (status ' + xhr.status + ')');
};

// ページ内の Scheme スクリプトを順番に実行する
run_scheme_scripts = function () {
	var scripts = document.getElementsByTagName('script');
	// getElementsByTagName は live なので配列にコピーしてから処理する
	var list = [];
	for (var i = 0; i < scripts.length; i++) {
		var type = (scripts[i].type || '').toLowerCase();
		if (SCHEME_SCRIPT_TYPES[type]) {
			list.push(scripts[i]);
		}
	}
	for (var j = 0; j < list.length; j++) {
		var el = list[j];
		if (el.getAttribute('data-scheme-evaluated')) {
			continue;
		}
		var code = el.src ? fetch_scheme_source(el.src) : (el.textContent || el.innerText || '');
		var result = scheme(code);
		el.setAttribute('data-scheme-evaluated', 'true');
		// 評価結果を data 属性に残しておく (デバッグ用)
		try {
			el.setAttribute('data-scheme-result', String(result));
		} catch (e) { /* ignore */ }
	}
};

// DOM 構築完了後に自動実行する (ブラウザ環境のときのみ)
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run_scheme_scripts);
	} else {
		run_scheme_scripts();
	}
}

// ------------------------------------------------------------------
// ブラウザ / 埋め込み用 REPL API
//   scheme_repl_eval(code) -> { ok, value, output, error }
//   scheme_input_complete(code) -> 括弧が閉じた 1 式か
// ------------------------------------------------------------------
scheme_input_complete = function (code) {
	return sexpr_complete_p(code);
};

scheme_repl_eval = function (code) {
	var port = make_string_output_port();
	var savedOut = current_output_port_obj;
	current_output_port_obj = port;
	var result = null;
	try {
		var tokenizer = new Tokenizer(code);
		while (tokenizer.value() !== '' && tokenizer.value() != null) {
			var tree = parse(tokenizer);
			result = trampoline(seval(tree, theGlobalEnv, function (v) { return v; }));
		}
		return { ok: true, value: result, output: port.buffer, error: null };
	} catch (e) {
		return { ok: false, value: null, output: port.buffer, error: String(e) };
	} finally {
		current_output_port_obj = savedOut;
	}
};

// DOM 要素に REPL UI を組み立てる(ブラウザ用)
//   opts: { prompt, welcome, onEval }
scheme_repl_ui = function (container, opts) {
	if (typeof document === 'undefined') throw 'scheme_repl_ui: requires a browser';
	opts = opts || {};
	var promptStr = opts.prompt || 'scheme> ';
	var contPrompt = opts.continuationPrompt || '...... ';

	container.innerHTML = '';
	container.classList.add('scheme-repl');

	var transcript = document.createElement('pre');
	transcript.className = 'scheme-repl-transcript';
	transcript.setAttribute('aria-live', 'polite');

	var inputRow = document.createElement('div');
	inputRow.className = 'scheme-repl-input-row';

	var promptEl = document.createElement('span');
	promptEl.className = 'scheme-repl-prompt';
	promptEl.textContent = promptStr;

	var input = document.createElement('textarea');
	input.className = 'scheme-repl-input';
	input.setAttribute('rows', '1');
	input.setAttribute('spellcheck', 'false');
	input.setAttribute('autocapitalize', 'off');
	input.setAttribute('autocomplete', 'off');

	var toolbar = document.createElement('div');
	toolbar.className = 'scheme-repl-toolbar';
	var runBtn = document.createElement('button');
	runBtn.type = 'button';
	runBtn.textContent = '実行';
	var clearBtn = document.createElement('button');
	clearBtn.type = 'button';
	clearBtn.textContent = 'クリア';
	toolbar.appendChild(runBtn);
	toolbar.appendChild(clearBtn);

	inputRow.appendChild(promptEl);
	inputRow.appendChild(input);
	container.appendChild(transcript);
	container.appendChild(inputRow);
	container.appendChild(toolbar);

	var history = [];
	var histIdx = -1;
	var buffer = '';
	var continuation = false;

	function appendTranscript(text, className) {
		var span = document.createElement('span');
		if (className) span.className = className;
		span.textContent = text;
		transcript.appendChild(span);
		transcript.scrollTop = transcript.scrollHeight;
	}

	function appendLine(line, className) {
		appendTranscript(line + '\n', className);
	}

	function resizeInput() {
		input.style.height = 'auto';
		input.style.height = Math.min(input.scrollHeight, 160) + 'px';
	}

	function showWelcome() {
		if (opts.welcome !== false) {
			appendLine('scheme.js REPL — Enter で実行 / Shift+Enter で改行 / ↑↓ で履歴', 'scheme-repl-meta');
		}
	}

	function formatValue(v) {
		if (v === undefined) return '';
		return scheme_repr(v, true);
	}

	function submit() {
		var piece = input.value;
		if (!continuation) buffer = '';
		buffer += (buffer && piece ? '\n' : '') + piece;
		input.value = '';
		resizeInput();

		if (!scheme_input_complete(buffer)) {
			continuation = true;
			promptEl.textContent = contPrompt;
			input.focus();
			return;
		}

		var code = buffer;
		buffer = '';
		continuation = false;
		promptEl.textContent = promptStr;

		if (code.trim() === '') {
			input.focus();
			return;
		}

		history.push(code);
		histIdx = history.length;
		appendTranscript(promptStr, 'scheme-repl-prompt-echo');
		appendLine(code, 'scheme-repl-input-echo');

		var res = scheme_repl_eval(code);
		if (opts.onEval) opts.onEval(res, code);

		if (res.output) appendTranscript(res.output, 'scheme-repl-out');
		if (res.ok) {
			var shown = formatValue(res.value);
			if (shown !== '') appendLine(shown, 'scheme-repl-value');
		} else {
			appendLine('error: ' + res.error, 'scheme-repl-error');
		}
		input.focus();
	}

	input.addEventListener('keydown', function (e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		} else if (e.key === 'ArrowUp' && !e.shiftKey && input.selectionStart === 0) {
			if (history.length && histIdx > 0) {
				e.preventDefault();
				histIdx--;
				input.value = history[histIdx];
				resizeInput();
			}
		} else if (e.key === 'ArrowDown' && !e.shiftKey) {
			if (history.length && histIdx < history.length - 1) {
				e.preventDefault();
				histIdx++;
				input.value = history[histIdx];
				resizeInput();
			} else if (histIdx === history.length - 1) {
				e.preventDefault();
				histIdx = history.length;
				input.value = '';
				resizeInput();
			}
		}
	});
	input.addEventListener('input', resizeInput);

	runBtn.addEventListener('click', submit);
	clearBtn.addEventListener('click', function () {
		transcript.textContent = '';
		showWelcome();
		input.focus();
	});

	showWelcome();
	input.focus();

	return {
		submit: submit,
		clear: function () { clearBtn.click(); },
		getTranscript: function () { return transcript; },
		getInput: function () { return input; }
	};
};

// ------------------------------------------------------------------
// 対話 REPL(Node.js の stdin から read して評価)
//   scheme_repl() または node schemInp.js で起動。
// ------------------------------------------------------------------
scheme_repl = function (prompt) {
	if (!HAS_STDIN) throw 'scheme_repl: interactive stdin requires Node.js';
	prompt = (prompt === undefined) ? '> ' : prompt;
	scheme_output('scheme.js REPL (Ctrl-D で終了)\n');
	while (true) {
		scheme_output(prompt);
		var datum;
		try {
			datum = port_read(STDIN_PORT);
		} catch (e) {
			scheme_output('read error: ' + e + '\n');
			continue;
		}
		if (datum === EOF_OBJECT) {
			scheme_output('\n');
			break;
		}
		try {
			var result = trampoline(seval(to_ast(datum), theGlobalEnv, function (v) { return v; }));
			scheme_output(scheme_repr(result, true) + '\n');
		} catch (e) {
			scheme_output('error: ' + e + '\n');
		}
	}
};

// 直接実行時: 引数があれば .scm 実行、なければ REPL
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
	var cliArgs = process.argv.slice(2);
	if (cliArgs.length === 0) {
		scheme_repl();
	} else {
		try {
			scheme_set_command_line(cliArgs);
			scheme_run_file(require('path').resolve(cliArgs[0]), { argv: cliArgs });
		} catch (e) {
			scheme_output('error: ' + e + '\n');
			process.exit(1);
		}
	}
}

// ブラウザから REPL API を利用できるようにグローバルへ公開
if (typeof window !== 'undefined') {
	window.scheme_repr = scheme_repr;
	window.scheme_repl_eval = scheme_repl_eval;
	window.scheme_input_complete = scheme_input_complete;
	window.scheme_repl_ui = scheme_repl_ui;
	window.scheme_debug_start = scheme_debug_start;
	window.scheme_debug_trace = scheme_debug_trace;
}

// Node.js から利用できるようにエクスポート (ブラウザ環境では無視される)
if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		scheme: scheme,
		scheme_run: scheme_run,
		scheme_run_file: scheme_run_file,
		scheme_eval: scheme_eval,
		repr: scheme_repr,
		scheme_repl: scheme_repl,
		scheme_repl_eval: scheme_repl_eval,
		scheme_input_complete: scheme_input_complete,
		scheme_repl_ui: scheme_repl_ui,
		// JS 相互運用
		toScheme: js_to_scheme,
		fromScheme: scheme_to_js,
		jsWrap: js_to_scheme,
		jsUnwrap: scheme_to_js,
		setCommandLineArguments: scheme_set_command_line,
		setGlobal: scheme_set_global,
		getGlobal: scheme_get_global,
		JsValue: JsValue,
		isJsValue: is_js_value,
		// デバッガ
		scheme_debug_start: scheme_debug_start,
		scheme_debug_trace: scheme_debug_trace,
		scheme_trace_walker: scheme_trace_walker,
		SchemeDebugSession: SchemeDebugSession,
		SchemeTraceWalker: SchemeTraceWalker
	};
}

