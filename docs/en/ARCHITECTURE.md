# scheme.js Architecture

**Languages:** [English](ARCHITECTURE.md) · [日本語](../ja/ARCHITECTURE.md)

## Documentation

| File | Description |
| --- | --- |
| [USAGE.md](USAGE.md) | **Usage guide** |
| [ARCHITECTURE.md](ARCHITECTURE.md) | This file (layout, build, module dependencies) |
| [README.en.md](../../README.en.md) | Overview, feature list, code examples |
| [README.md](../README.md) | Documentation index (en / ja) |

---

## Directory layout

```
scheme.js/
├── index.js             # npm entry (require('@nsas454/scheme-js'))
├── bin/scheme-js.js     # CLI
├── src/                 # Source (edit here)
│   ├── core.js          # Pair, list ops, trampoline
│   ├── env.js           # Environment, closures, lambda
│   ├── continuations.js # dynamic-wind, call/cc
│   ├── primitives.js    # Core primitives, R5RS procedures
│   ├── numbers.js       # Numeric tower, NUMERIC_PRIMITIVES
│   ├── io.js            # I/O ports, read/write
│   ├── r7rs.js          # R7RS small (libraries, special forms)
│   ├── r7rs_large.js    # R7RS large (Red Edition)
│   ├── evaluator.js     # CPS evaluator, macros, s_apply
│   ├── js_interop.js    # JavaScript interop
│   ├── debugger.js      # Step execution, evaluation trace
│   ├── init.js          # Global initialization
│   ├── parser.js        # Tokenizer, parse
│   └── runtime.js       # scheme(), REPL, exports
├── dist/                # Build output (scripts/build.js)
│   ├── schemInp.js      # Browser / Node bundle
│   └── r7rs_large.js
├── examples/            # Sample .scm files
├── test/
│   ├── r5rs/            # R5RS / R7RS conformance tests
│   ├── js-interop/      # JS interop tests
│   ├── sicp/            # SICP exercise tests
│   └── debugger/        # Debugger tests
├── sicp-repl.html       # SICP exercise REPL
├── debug.html           # Step debugger UI
├── demo.html / repl.html
├── scripts/
│   └── build.js         # Concatenate src → dist
└── docs/                # Documentation (en / ja)
```

---

## Build

```bash
node scripts/build.js
# or
npm run build
```

`src/*.js` modules are concatenated in order into `dist/schemInp.js`.
Modules share a single `var` scope (legacy global style).

`npm install` runs the `prepare` script to build automatically.

---

## Module dependency (load order)

```
core → env → continuations → primitives → numbers → io
  → r7rs → evaluator → js_interop → debugger → init → parser → runtime
```

### Module roles

| Module | Role |
| --- | --- |
| `core.js` | `Pair`, `bounce` / `trampoline`, list conversion |
| `env.js` | `Env`, closures, special-form predicates |
| `continuations.js` | `call/cc`, `dynamic-wind` stack |
| `evaluator.js` | CPS `seval`, macro expansion, `s_apply` |
| `js_interop.js` | `js-ref`, etc., `JsValue`, CLI argv override |
| `debugger.js` | Hooks on `seval` / `s_apply`, step execution |
| `runtime.js` | Public API, REPL, `module.exports` |

---

## Evaluation model

```
Source string
  → Tokenizer / parse (parser.js)
  → AST (JavaScript arrays)
  → seval (CPS, evaluator.js)
       ↓ Bounce chain
  → trampoline (core.js) iterates
  → Result value
```

- **Data** (runtime lists) use `Pair`; **code** (AST) uses `Array`
- Macro expansion happens in `eval_application`; expanded forms re-enter `seval`
- Debugger records events at `seval` entry and `s_apply` ([USAGE.md §7](USAGE.md#7-step-execution--debugger))

---

## Tests

```bash
npm test
```

Individual suites:

```bash
node scripts/build.js
node test/r5rs/test_r5rs_extra.js
node test/r5rs/test_syntax_rules.js
node test/r5rs/test_r7rs.js
node test/r5rs/test_r7rs_large.js
node test/js-interop/test_js_interop.js
node test/debugger/test_debugger.js
node test/sicp/test_sicp_exercises.js
```

---

## Debugger (implementation notes)

The CPS evaluator `seval` / `s_apply` is hooked to record **eval / return / apply** events per expression.

- **Live stepping**: `scheme_debug_start(code)` → `step()` / `continue()` / `stepOver()` / `stepOut()`
- **Trace recording**: `scheme_debug_trace(code)` → replay with `scheme_trace_walker`
- **UI**: `debug.html`

On pause, `resumeState` stores `{ exp, env, k }` and resumes by continuing `seval` with the saved CPS continuation `k`.

See [USAGE.md §7](USAGE.md#7-step-execution--debugger) for walkthrough examples.
