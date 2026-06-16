# scheme.js Usage Guide

**Languages:** [English](USAGE.md) · [日本語](../ja/USAGE.md)

This guide covers the **@nsas454/scheme-js** npm package. For architecture and module layout, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Table of contents

1. [Install & build](#1-install--build)
2. [Node.js / npm API](#2-nodejs--npm-api)
3. [CLI (scheme-js command)](#3-cli-scheme-js-command)
4. [Browser usage](#4-browser-usage)
5. [REPL](#5-repl)
6. [JavaScript interop](#6-javascript-interop)
7. [Step execution & debugger](#7-step-execution--debugger)
8. [I/O ports](#8-io-ports)
9. [R7RS libraries](#9-r7rs-libraries)
10. [FAQ](#10-faq)

---

## 1. Install & build

### Install from npm

```bash
npm install @nsas454/scheme-js
```

Global CLI:

```bash
npm install -g @nsas454/scheme-js
scheme-js --help
```

### Clone and develop

```bash
git clone https://github.com/nsas454/scheme.js.git
cd scheme.js
npm install          # prepare script builds dist/
npm test             # build + all tests
```

Manual build:

```bash
node scripts/build.js   # src/ → dist/schemInp.js, dist/r7rs_large.js
```

**Always edit `src/`.** Do not edit `dist/` directly — it is generated.

---

## 2. Node.js / npm API

```js
const S = require('@nsas454/scheme-js');
```

### Evaluation

| Function | Description |
| --- | --- |
| `scheme(code)` | Evaluate string; return last value. Errors returned as **strings** (no throw) |
| `scheme_run(code)` | Same, but `display` goes to stdout; errors **throw** |
| `scheme_run_file(path, opts?)` | Load and evaluate a `.scm` file (Node.js only) |
| `scheme_eval(sexp, env?)` | Evaluate parsed AST (advanced) |
| `repr(value, writeMode?)` | Stringify a Scheme value |

```js
console.log(S.scheme('(+ 1 2 3)'));            // 6
S.scheme('(define (sq x) (* x x))');
console.log(S.scheme('(sq 9)'));                 // 81
S.scheme_run('(display "hello\\n")');
S.scheme_run_file('examples/hello.scm');
```

**When to use which:** `scheme` for quick experiments; `scheme_run` for scripts (natural I/O, throws on error).

### REPL (Node.js)

| Function | Description |
| --- | --- |
| `scheme_repl(prompt?)` | Interactive stdin REPL (Ctrl-D to exit) |
| `scheme_repl_eval(code)` | Single evaluation → `{ ok, value, output, error }` |
| `scheme_input_complete(code)` | Check if parentheses are balanced |
| `scheme_repl_ui(container, opts?)` | Build browser REPL UI in a DOM element |

### JavaScript interop

| Function | Description |
| --- | --- |
| `setGlobal(name, jsValue)` | Bind a JS value in Scheme global env |
| `getGlobal(name)` | Read Scheme global binding |
| `toScheme(v)` / `jsWrap(v)` | JS → Scheme (`JsValue` wrapper for objects) |
| `fromScheme(v)` / `jsUnwrap(v)` | Scheme → JS (procedures become functions) |
| `setCommandLineArguments(argv)` | Override CLI argv for `command-line` |

### Debugger

| Function | Description |
| --- | --- |
| `scheme_debug_start(code, opts?)` | Create a step-debug session |
| `scheme_debug_trace(code)` | Record all evaluation events synchronously |
| `scheme_trace_walker(trace)` | Walk forward/back through a trace |

---

## 3. CLI (scheme-js command)

```bash
scheme-js                     # interactive REPL
scheme-js program.scm         # run file
scheme-js program.scm a b     # with arguments
scheme-js -e "(+ 1 2)"
scheme-js --version
scheme-js --help
```

Script arguments (R7RS):

```scheme
(import (scheme process-context))
(display (command-line))
(newline)
```

Exit codes: `0` success, `1` on evaluation error or missing file.

Local development:

```bash
node bin/scheme-js.js examples/hello.scm
```

---

## 4. Browser usage

### 4.1 `<script type="text/scheme">`

```html
<script src="dist/r7rs_large.js"></script>
<script src="dist/schemInp.js"></script>
<pre id="scheme-output"></pre>
<script type="text/scheme">
  (display (+ 1 2 3))
</script>
```

Supported `type` values: `text/scheme`, `text/x-scheme`, `application/scheme`, `text/lisp`.

> External `.scm` via `src=` uses sync XHR — may fail under `file://`. Use a local HTTP server or inline code.

**Online demos:** https://nsas454.github.io/scheme.js/

| Page | URL |
| --- | --- |
| Demo | /demo.html |
| REPL | /repl.html |
| SICP exercises | /sicp-repl.html |
| Debugger | /debug.html |

### 4.2 Call `scheme()` from JavaScript

```html
<script src="dist/schemInp.js"></script>
<script>
  console.log(scheme("(+ 10 20)"));  // 30
</script>
```

---

## 5. REPL

### Node.js terminal

```bash
scheme-js
# or
node -e "require('@nsas454/scheme-js').scheme_repl()"
```

### Browser REPL UI

```html
<div id="repl"></div>
<script src="dist/schemInp.js"></script>
<script>
  scheme_repl_ui(document.getElementById('repl'));
</script>
```

| Key | Action |
| --- | --- |
| Enter | Submit (continues on unbalanced parens) |
| Shift+Enter | New line |
| ↑ / ↓ | History |

---

## 6. JavaScript interop

### 6.1 Sugar syntax (recommended)

Registered at startup:

| Form | Meaning |
| --- | --- |
| `(jsdot obj field)` | Property access |
| `(jsdot obj method arg ...)` | Method call |
| `(jsdot! obj method)` | Method with no args |
| `(jslog arg ...)` | `console.log` |
| `(jsnew Class arg ...)` | `new Class(...)` |

`js-window` is an alias for `(js-global)`.

```scheme
(jslog "hello")
(define cfg (js-object (cons "retries" 3)))
(jsdot cfg retries)   ; => 3
```

> Use **`jsdot`**, not `( . obj field )` — the latter conflicts with dotted pairs `(a . b)`.

### 6.2 Low-level API (Scheme → JS)

`js-ref`, `js-set!`, `js-get`, `js-call`, `js-invoke`, `js-apply`, `js-new`, `js-object`, `js-array`, `js-length`, `js-typeof`, `js-in?`, `scheme->js`, `js->scheme`, etc.

### 6.3 JavaScript → Scheme

```js
const S = require('@nsas454/scheme-js');
S.setGlobal('config', { host: 'localhost', port: 8080 });
S.scheme('(jsdot config host)');   // "localhost"

S.scheme('(define (add a b) (+ a b))');
const add = S.fromScheme(S.getGlobal('add'));
add(10, 32);   // 42
```

---

## 7. Step execution & debugger

Hooks into the CPS evaluator to record **eval / apply / return** events.

### 7.1 Browser UI (`debug.html`)

| Key / button | Action |
| --- | --- |
| F10 / Step | Advance one step |
| F5 / Continue | Run to completion |
| Reset | Restart session |

### 7.2 JavaScript API

```js
const S = require('@nsas454/scheme-js');
const sess = S.scheme_debug_start('(+ 1 2)');
sess.start();
console.log(sess.currentEvent);  // { phase: 'eval', source: '(+ 1 2)', ... }
sess.step();
sess.continue();
console.log(sess.result);          // 3
```

### 7.3 Trace recording

```js
const trace = S.scheme_debug_trace('(define x 5) (+ x 1)');
const w = S.scheme_trace_walker(trace);
w.current();
w.next();
```

| phase | When |
| --- | --- |
| `eval` | Before evaluating an expression |
| `apply` | Procedure application |
| `return` | After evaluation completes |

---

## 8. I/O ports

```scheme
;; String output port
(call-with-output-string
  (lambda (p) (display "x=" p) (write 42 p)))   ; => "x=42"

;; String input port
(define ip (open-input-string "(+ 1 2 3)"))
(eval (read ip))   ; => 6
```

File ports (`open-input-file`, etc.) work on **Node.js only**.

---

## 9. R7RS libraries

```scheme
(define-library (example)
  (export greet)
  (import (scheme base))
  (begin (define (greet) "hello")))

(import (example))
(greet)   ; => "hello"
```

Load `dist/r7rs_large.js` before `dist/schemInp.js` in the browser for R7RS-large libraries (unicode, bytevector, sort, etc.).

---

## 10. FAQ

### Q. `scheme()` returns a Rational object

Exact integers may be stored as rationals internally. Use `repr()` for display.

### Q. External `.scm` won't load in the browser

Use an HTTP server (`python3 -m http.server`) instead of `file://`.

### Q. Test locally before npm publish

```bash
npm link
scheme-js examples/hello.scm
```

### Q. Run tests only

```bash
npm test
```

---

## Related docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — layout, build, modules
- [README.en.md](../../README.en.md) — syntax reference, R5RS/R7RS status, examples
- [README.md](../README.md) — documentation index (en / ja)
