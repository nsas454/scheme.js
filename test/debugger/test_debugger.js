const S = require('../../index.js');
let pass = 0, fail = 0;

function t(label, ok, detail) {
	if (ok) pass++; else fail++;
	console.log((ok ? 'OK  ' : 'NG  ') + label + (detail ? ' => ' + detail : ''));
}

function num(v) {
	if (typeof v === 'number') return v;
	if (v && v.n !== undefined) return Number(v.n) / Number(v.d || 1n);
	return v;
}

console.log('--- scheme_debug_trace ---');
const trace = S.scheme_debug_trace('(+ 1 2)');
t('trace 完了', trace.status === 'done' && num(trace.result) === 3, 'result=' + trace.result);
t('eval イベントあり', trace.events.some(function (e) { return e.phase === 'eval'; }),
	'events=' + trace.events.length);
t('apply イベントあり', trace.events.some(function (e) { return e.phase === 'apply' }),
	null);
t('(+ 1 2) を評価', trace.events.some(function (e) {
	return e.phase === 'eval' && e.type === 'application' && e.source === '(+ 1 2)';
}), null);

console.log('--- scheme_debug_start ステップ ---');
const sess = S.scheme_debug_start('(+ 1 2)');
sess.start();
t('初回で paused', sess.status === 'paused', sess.status);
t('最初の式', sess.currentEvent && sess.currentEvent.type === 'application', sess.currentEvent && sess.currentEvent.source);
sess.continue();
t('continue で完了', sess.status === 'done' && num(sess.result) === 3, 'result=' + num(sess.result));

console.log('--- step-in ---');
const s2 = S.scheme_debug_start('(* 2 3)');
s2.start();
var steps = 0;
while (s2.status === 'paused' && steps < 50) {
	steps++;
	s2.step();
}
t('step-in で完了', s2.status === 'done' && num(s2.result) === 6, 'steps=' + steps + ' result=' + num(s2.result));
t('複数 eval イベント', s2.getEvents().filter(function (e) { return e.phase === 'eval'; }).length >= 3,
	'evals=' + s2.getEvents().filter(function (e) { return e.phase === 'eval'; }).length);

console.log('--- trace walker ---');
const tr = S.scheme_debug_trace('(define x 5) (+ x 1)');
const w = S.scheme_trace_walker(tr);
t('walker 初期', w.current().phase === 'eval', w.current().source);
w.next();
t('walker next', w.index === 1, 'index=' + w.index);
w.prev();
t('walker prev', w.index === 0, 'index=' + w.index);

console.log('--- 環境スナップショット ---');
const tr2 = S.scheme_debug_trace('(define x 10) (+ x 1)');
var xEvt = null;
for (var i = 0; i < tr2.events.length; i++) {
	if (tr2.events[i].phase === 'eval' && tr2.events[i].type === 'variable' && tr2.events[i].source === 'x') {
		xEvt = tr2.events[i];
	}
}
t('x 参照時に x=10', xEvt && xEvt.env && xEvt.env[0] && xEvt.env[0].x === '10',
	xEvt ? JSON.stringify(xEvt.env[0]) : 'no event');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
