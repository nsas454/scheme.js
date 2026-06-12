#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const schemeJs = require('../index.js');

function usage() {
	console.log(
		'Usage: scheme-js [options] [file.scm] [args...]\n' +
		'\n' +
		'Options:\n' +
		'  -e, --eval CODE   evaluate CODE\n' +
		'  -h, --help        show this help\n' +
		'  -v, --version     show version\n' +
		'\n' +
		'With no file or -e, starts an interactive REPL.\n' +
		'Script arguments are available via (import (scheme process-context)) command-line.'
	);
}

function fail(msg) {
	process.stderr.write('error: ' + msg + '\n');
	process.exit(1);
}

function run(code, argv) {
	if (argv) schemeJs.setCommandLineArguments(argv);
	try {
		schemeJs.scheme_run(code);
	} catch (e) {
		fail(e);
	}
}

function main() {
	const args = process.argv.slice(2);
	let evalCode = null;
	let scriptFile = null;
	let scriptArgs = [];

	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === '-h' || a === '--help') {
			usage();
			return;
		}
		if (a === '-v' || a === '--version') {
			console.log(require('../package.json').version);
			return;
		}
		if (a === '-e' || a === '--eval') {
			evalCode = args[++i];
			if (evalCode === undefined) fail('missing argument for ' + a);
			scriptArgs = args.slice(i + 1);
			break;
		}
		if (a.startsWith('-')) fail('unknown option: ' + a);
		scriptFile = a;
		scriptArgs = args.slice(i + 1);
		break;
	}

	if (evalCode !== null) {
		run(evalCode, ['-e'].concat(scriptArgs.length ? [evalCode] : [], scriptArgs));
		return;
	}

	if (scriptFile) {
		const abs = path.resolve(scriptFile);
		if (!fs.existsSync(abs)) fail('no such file: ' + scriptFile);
		try {
			schemeJs.setCommandLineArguments([scriptFile].concat(scriptArgs));
			schemeJs.scheme_run_file(abs, { argv: [scriptFile].concat(scriptArgs) });
		} catch (e) {
			fail(e);
		}
		return;
	}

	try {
		schemeJs.scheme_repl();
	} catch (e) {
		fail(e);
	}
}

main();
