// debugger.js — ステップ実行・評価トレース
// ==================================================================
// CPS 評価器 (seval / s_apply) にフックし、式ごとの評価過程を記録する。
//   scheme_debug_start(code) -> セッション (step / continue / getEvents)
//   scheme_debug_trace(code) -> 全ステップを記録したトレース (同期)
// ==================================================================

var PAUSE_SENTINEL = { __scheme_debug_pause__: true };

var activeDebugSession = null;

function debug_value_repr(v) {
	if (v === undefined) return '#<undefined>';
	if (v === true) return '#t';
	if (v === false) return '#f';
	if (v === null) return '()';
	if (typeof v === 'number' || typeof v === 'string') return scheme_repr(v, true);
	if (v instanceof Symbol) return v.name;
	if (iscompound_procedure(v) || isprimitive_procedure(v) || iscase_procedure(v)) return '#<procedure>';
	if (ismacro(v) || issyntax_rules(v)) return '#<macro>';
	if (iscontinuation(v)) return '#<continuation>';
	if (typeof is_js_value !== 'undefined' && is_js_value(v)) return scheme_repr(v, true);
	try { return scheme_repr(v, true); } catch (e) { return '#<value>'; }
}

function debug_classify_exp(exp) {
	if (exp == null || typeof exp === 'boolean') return 'literal';
	if (typeof exp === 'number' || typeof exp === 'string') return 'literal';
	if (isVariable(exp)) return 'variable';
	if (isquoted(exp)) return 'quote';
	if (isassignment(exp)) return 'set!';
	if (isdefine(exp)) return 'define';
	if (isdefine_macro(exp)) return 'define-macro';
	if (isdefine_syntax(exp)) return 'define-syntax';
	if (islet_syntax(exp) || isletrec_syntax(exp)) return 'let-syntax';
	if (islet(exp)) return 'let';
	if (islet_star(exp)) return 'let*';
	if (isletrec(exp)) return 'letrec';
	if (isdo(exp)) return 'do';
	if (isquasiquote(exp)) return 'quasiquote';
	if (isdelay(exp)) return 'delay';
	if (isif(exp)) return 'if';
	if (isand(exp)) return 'and';
	if (isor(exp)) return 'or';
	if (iscase(exp)) return 'case';
	if (islambda(exp)) return 'lambda';
	if (iscase_lambda(exp)) return 'case-lambda';
	if (isbegin(exp)) return 'begin';
	if (iscond(exp)) return 'cond';
	if (isapplication(exp)) return 'application';
	if (self_evaluating(exp)) return 'literal';
	if (exp instanceof Char || exp instanceof SVector || exp instanceof Rational || exp instanceof Complex) return 'literal';
	if (istagged_list(exp, 'macro-capture')) return 'macro-capture';
	return 'other';
}

function debug_env_snapshot(env, maxFrames) {
	maxFrames = maxFrames || 8;
	var frames = [];
	var e = env;
	while (e && frames.length < maxFrames) {
		var vars = {};
		for (var name in e.vars) {
			if (!Object.prototype.hasOwnProperty.call(e.vars, name)) continue;
			vars[name] = debug_value_repr(e.vars[name]);
		}
		frames.push(vars);
		e = e.parent;
	}
	return frames;
}

function debug_normalize_result(v) {
	if (v instanceof Rational && v.d === 1n) return Number(v.n);
	if (is_scheme_number(v)) return +v;
	return v;
}

function debug_record_event(session, evt) {
	evt.id = session.events.length;
	session.events.push(evt);
	session.currentEvent = evt;
}

function debug_should_pause(session) {
	if (session.mode === 'run') return false;
	if (session.mode === 'step-in') return true;
	if (session.mode === 'step-over') {
		return session.depth <= session.stepOverDepth;
	}
	if (session.mode === 'step-out') {
		return session.depth <= session.stepOutDepth;
	}
	return false;
}

function debug_eval_enter(exp, env, k) {
	var session = activeDebugSession;
	if (!session) return null;
	if (session.skipNext) {
		session.skipNext = false;
		return null;
	}

	session.depth++;
	var evt = {
		phase: 'eval',
		depth: session.depth,
		type: debug_classify_exp(exp),
		source: scheme_repr(exp, true),
		env: debug_env_snapshot(env)
	};
	debug_record_event(session, evt);

	if (session.mode === 'run') return null;

	if (debug_should_pause(session)) {
		session.mode = 'paused';
		session.resumeState = { exp: exp, env: env, k: k };
		return bounce(function () { return PAUSE_SENTINEL; });
	}
	return null;
}

function debug_eval_return(exp, env, value) {
	var session = activeDebugSession;
	if (!session) return;
	debug_record_event(session, {
		phase: 'return',
		depth: session.depth,
		type: debug_classify_exp(exp),
		source: scheme_repr(exp, true),
		value: debug_value_repr(value)
	});
	session.depth--;
}

function debug_apply_event(proc, args) {
	var session = activeDebugSession;
	if (!session) return;
	var argStrs = [];
	for (var i = 0; i < args.length; i++) argStrs.push(debug_value_repr(args[i]));
	debug_record_event(session, {
		phase: 'apply',
		depth: session.depth,
		procedure: debug_value_repr(proc),
		arguments: argStrs
	});
}

function debug_wrap_k(exp, env, k) {
	return function (value) {
		debug_eval_return(exp, env, value);
		return k(value);
	};
}

function debug_trampoline_until_pause(b, session) {
	activeDebugSession = session;
	while (b instanceof Bounce) {
		b = b.thunk();
		if (b === PAUSE_SENTINEL) {
			session.status = 'paused';
			return session;
		}
	}
	session.status = 'done';
	session.result = debug_normalize_result(b);
	session._pending = null;
	return session;
}

function debug_resume_session(session, nextMode) {
	if (session.status !== 'paused' || !session.resumeState) return session;
	session.mode = nextMode || 'step-in';
	session.skipNext = true;
	session.status = 'running';
	var st = session.resumeState;
	session.resumeState = null;
	var b = seval(st.exp, st.env, debug_wrap_k(st.exp, st.env, st.k));
	return debug_trampoline_until_pause(b, session);
}

function SchemeDebugSession(code, options) {
	this.code = code;
	this.options = options || {};
	this.events = [];
	this.currentEvent = null;
	this.depth = 0;
	this.mode = this.options.mode || 'step-in';
	this.status = 'idle';
	this.result = null;
	this.error = null;
	this.stepOverDepth = 0;
	this.stepOutDepth = 0;
	this.resumeState = null;
	this.skipNext = false;
	this._trees = [];
	this._treeIndex = 0;
	this._topK = null;

	var tokenizer = new Tokenizer(code);
	while (tokenizer.value() !== '' && tokenizer.value() != null) {
		this._trees.push(parse(tokenizer));
	}
}

SchemeDebugSession.prototype.getState = function () {
	return {
		status: this.status,
		mode: this.mode,
		depth: this.depth,
		eventCount: this.events.length,
		current: this.currentEvent,
		result: this.status === 'done' ? debug_value_repr(debug_normalize_result(this.result)) : null,
		error: this.error
	};
};

SchemeDebugSession.prototype.getEvents = function () {
	return this.events.slice();
};

SchemeDebugSession.prototype._evalNext = function () {
	var self = this;
	if (this._treeIndex >= this._trees.length) {
		return bounce(function () { return self.result; });
	}
	var tree = this._trees[this._treeIndex++];
	if (isdefine_library(tree)) {
		process_define_library(tree);
		return this._evalNext();
	}
	if (isimport_form(tree)) {
		return eval_import(tree, theGlobalEnv, function (v) {
			self.result = v;
			return self._evalNext();
		});
	}
	return seval(tree, theGlobalEnv, debug_wrap_k(tree, theGlobalEnv, function (v) {
		self.result = v;
		return self._evalNext();
	}));
};

SchemeDebugSession.prototype._runTopLevel = function () {
	var self = this;
	try {
		var b = this._evalNext();
		return debug_trampoline_until_pause(b, this);
	} catch (e) {
		this.status = 'error';
		this.error = String(e);
		return this;
	}
};

SchemeDebugSession.prototype.start = function () {
	activeDebugSession = this;
	this.events = [];
	this.depth = 0;
	this._treeIndex = 0;
	this.status = 'running';
	return this._runTopLevel();
};

SchemeDebugSession.prototype.step = function () {
	if (this.status === 'idle') return this.start();
	if (this.status === 'done' || this.status === 'error') return this;
	return debug_resume_session(this, 'step-in');
};

SchemeDebugSession.prototype.stepOver = function () {
	if (this.status === 'idle') {
		this.stepOverDepth = 1;
		return this.start();
	}
	if (this.status === 'paused') {
		this.stepOverDepth = this.depth;
		return debug_resume_session(this, 'step-over');
	}
	return this;
};

SchemeDebugSession.prototype.stepOut = function () {
	if (this.status === 'paused') {
		this.stepOutDepth = Math.max(0, this.depth - 1);
		return debug_resume_session(this, 'step-out');
	}
	return this;
};

SchemeDebugSession.prototype.continue = function () {
	if (this.status === 'idle') {
		this.mode = 'run';
		return this.start();
	}
	if (this.status === 'paused') {
		return debug_resume_session(this, 'run');
	}
	return this;
};

function scheme_debug_start(code, options) {
	return new SchemeDebugSession(code, options);
}

// 同期: 全評価ステップを記録 (再生用)
function scheme_debug_trace(code) {
	var session = new SchemeDebugSession(code, { mode: 'run' });
	activeDebugSession = session;
	session.start();
	activeDebugSession = null;
	return {
		events: session.getEvents(),
		result: debug_normalize_result(session.result),
		error: session.error,
		status: session.status
	};
}

// トレースを前後に辿るヘルパ
function SchemeTraceWalker(trace) {
	this.trace = trace;
	this.index = 0;
}
SchemeTraceWalker.prototype.current = function () {
	return this.trace.events[this.index] || null;
};
SchemeTraceWalker.prototype.next = function () {
	if (this.index < this.trace.events.length - 1) this.index++;
	return this.current();
};
SchemeTraceWalker.prototype.prev = function () {
	if (this.index > 0) this.index--;
	return this.current();
};
SchemeTraceWalker.prototype.go = function (i) {
	this.index = Math.max(0, Math.min(i, this.trace.events.length - 1));
	return this.current();
};

function scheme_trace_walker(trace) {
	return new SchemeTraceWalker(trace);
}
