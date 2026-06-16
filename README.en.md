# scheme.js

A Scheme interpreter implemented in JavaScript.

**Languages:** [English](README.en.md) · [日本語](../README.md)

[![npm version](https://img.shields.io/npm/v/@nsas454/scheme-js.svg)](https://www.npmjs.com/package/@nsas454/scheme-js)

```bash
npm install @nsas454/scheme-js
```

Beyond basic syntax, it supports **closures**, **macros (`define-macro`)**, and **continuations (`call/cc`)**. Continuations are implemented with CPS (continuation-passing style) and a trampoline, so captured continuations are first-class: storable in variables and re-invokable multiple times.

## Features

- Lexical scoping with true closures
- Lisp-style macros via `define-macro` (arguments passed unevaluated)
- First-class continuations via `call/cc` (re-entrant, reusable)
- Trampoline-driven evaluation — deep recursion is unlikely to overflow the stack
- Runs in browsers and on Node.js

## Project layout

```
scheme.js/
├── index.js           # npm entry (require('@nsas454/scheme-js'))
├── bin/scheme-js.js   # CLI
├── src/               # Source (edit here)
├── dist/              # Build output (node scripts/build.js)
├── sicp-repl.html     # SICP exercise REPL
├── debug.html         # Step debugger UI
├── demo.html / repl.html
├── test/              # Tests (r5rs / js-interop / debugger / sicp)
└── docs/              # Documentation (en / ja)
```

**Detailed usage:** [docs/en/USAGE.md](docs/en/USAGE.md)  
**Architecture:** [docs/en/ARCHITECTURE.md](docs/en/ARCHITECTURE.md)  
**Doc index:** [docs/README.md](docs/README.md)

### Build

```bash
node scripts/build.js   # src/ → dist/schemInp.js
npm test                # build + all tests
```

## Quick start

### npm / Node.js

```js
const {
  scheme, scheme_run, repr,
  toScheme, fromScheme,
  setGlobal, getGlobal
} = require('@nsas454/scheme-js');

console.log(scheme('(+ 1 2 3)'));           // 6
scheme_run('(display "hello\\n")');

setGlobal('config', { retries: 3 });
scheme('(js-ref config "retries")');        // 3

scheme('(define (double x) (* x 2))');
const double = fromScheme(getGlobal('double'));
double(21);                                 // 42
```

### CLI

```bash
npm install -g @nsas454/scheme-js
scheme-js examples/hello.scm
scheme-js -e "(display (+ 1 2))"    # => 3
scheme-js                           # interactive REPL
```

### Browser

**Online demos:** https://nsas454.github.io/scheme.js/

![SICP exercise REPL demo](docs/assets/sicp-repl-demo.gif)

```html
<script src="dist/r7rs_large.js"></script>
<script src="dist/schemInp.js"></script>
<script type="text/scheme">
  (display (+ 1 2 3))
  (define (make-adder n) (lambda (x) (+ x n)))
  (display ((make-adder 5) 10))
</script>
```

### JavaScript interop (Scheme side)

Sugar macros registered at startup: `jsdot`, `jsdot!`, `jslog`, `jsnew`, `js-window`.

```scheme
(jsdot (js-ref js-window "Math") abs -3)   ; => 3
(jslog "hello" 42)
(jsdot! (jsnew Date 0) getFullYear)
```

### Step debugger (for learning)

**Browser UI:** open `debug.html` (F10 = step, F5 = continue)

```js
const { scheme_debug_start } = require('@nsas454/scheme-js');
const sess = scheme_debug_start('(+ 1 2)');
sess.start();
sess.step();
sess.continue();
```

### SICP exercise REPL

Run selected exercises from [*Structure and Interpretation of Computer Programs*](https://mitpress.mit.edu/9780262510875/structure-and-interpretation-of-computer-programs/) by chapter.

- **Online:** https://nsas454.github.io/scheme.js/sicp-repl.html
- 32 exercises across chapters 1–5
- Direct link: `?ch=1&ex=1.7`

## Supported syntax & features

### Special forms

`define`, `lambda`, `set!`, `if`, `cond`, `case`, `and`, `or`, `let`, named `let`, `let*`, `letrec`, `do`, `begin`, `quote`, `quasiquote`, `delay`, `define-macro`, `define-syntax` / `syntax-rules`, `let-syntax` / `letrec-syntax`

### Built-in procedures (highlights)

- Arithmetic, comparisons, exact/inexact numbers, rationals, complex numbers
- Lists: `cons`, `car`, `cdr`, `map`, `apply`, `set-car!`, `set-cdr!`, dotted pairs
- Strings, characters, vectors
- `call/cc`, `dynamic-wind`, `values`, `call-with-values`, `force`, `eval`
- I/O: `display`, `write`, `read`, string ports; file ports on Node.js

## Examples

### Closures

```scheme
(define (make-counter)
  (let ((c 0))
    (lambda () (set! c (+ c 1)) c)))
(define cnt (make-counter))
(cnt)   ; => 1
(cnt)   ; => 2
```

### Macros

```scheme
(define-syntax swap!
  (syntax-rules ()
    ((_ a b) (let ((tmp a)) (set! a b) (set! b tmp)))))
(define x 1) (define y 2)
(swap! x y) (list x y)   ; => (2 1)
```

### Continuations

```scheme
(call/cc (lambda (k) (+ 1 (k 10))))   ; => 10

(define saved #f)
(+ 100 (call/cc (lambda (k) (set! saved k) 1)))   ; => 101
(saved 10)   ; => 110
```

### Numeric tower

```scheme
(* 1000000000000 1000000000000)   ; exact big integer
(+ 1/3 1/6)                       ; => 1/2
(* 3+4i 1+2i)                     ; complex arithmetic
```

## R5RS / R7RS status

### R5RS (supported)

- Hygienic `syntax-rules` macros (ellipsis, nested patterns, `let-syntax`)
- Numeric tower (big integers, rationals, floats, complex numbers)
- I/O ports (string ports; file ports on Node.js)
- True `Pair` cells, dotted pairs, mutation (`set-car!` / `set-cdr!`)
- `dynamic-wind` with continuations
- R5RS-compliant internal `define` (desugared to `letrec`)

### R7RS (supported)

- `define-library` / `import` / `export`
- `case-lambda`, `define-values`, `let-values`, `guard` / `raise`
- `define-record-type`, hash tables
- R7RS-large subset: bytevector, unicode, sort, streams, generators, etc.

Run tests:

```bash
npm test
```

See [README.md](README.md) for the full Japanese reference (complete procedure lists and more examples).

## Publishing to npm (maintainers)

Package name: **`@nsas454/scheme-js`** (scoped; unscoped `scheme-js` conflicts with existing `schemejs`).

```bash
npm login
npm test
npm publish --access public --otp=XXXXXX
```

GitHub Actions workflow **Publish npm package** uses the `NPM_TOKEN` secret.

## License

MIT License. Copyright (c) 2014 Shuichi Yukimoto.
