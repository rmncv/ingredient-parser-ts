# Contributing

Thanks for your interest in improving **ingredient-parser-ts**! This document
covers how to get set up and what we expect from contributions.

## Development setup

Requires Node.js >= 20.

```bash
git clone https://github.com/rmncv/ingredient-parser-ts.git
cd ingredient-parser-ts
npm install
npm run build
npm test
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run build` | Compile `src/` to `dist/` and copy runtime data assets. |
| `npm test` | Run the full Vitest suite (unit + parity). |
| `npm run typecheck` | Type-check without emitting. |

## Parity with the upstream library

This project is a behavioral port of the Python
[`ingredient-parser`](https://github.com/strangetom/ingredient-parser). Parity
is verified against a corpus generated from the original library (see the
`tests/parity/` suite and the generators under `tools/`). **Changes must not
regress parity.** If a change intentionally diverges, document why in the code
and in your pull request.

## Making changes

1. Fork the repo and create a branch from `main`.
2. Write or update tests for your change (this project is test-driven — new
   behavior needs coverage, bug fixes need a regression test).
3. Ensure `npm run build`, `npm run typecheck`, and `npm test` all pass.
4. Keep the diff focused; match the surrounding code style.
5. Open a pull request describing the change and its motivation.

## Reporting bugs

Please open an issue with the ingredient sentence that reproduces the problem,
the output you got, and the output you expected.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
