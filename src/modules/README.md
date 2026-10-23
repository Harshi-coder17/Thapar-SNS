# Feature modules

One folder per module (`identity`, `societies`, `events`, `findmates`, `studymaterial`, `archive`,
`faculty`, `calendar`, `placement`, `admin`), added in the slice that delivers each one.

Rules (enforced by `eslint/boundaries.mjs`, see `docs/architecture/modules.md`):

- Other code may import a module only through its `index.ts`.
- A module may import shared code (`src/shared`), its own files, and other modules' `index.ts`.
- A module's tables are read and written only by that module.
