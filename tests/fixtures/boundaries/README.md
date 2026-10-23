# Boundary rule fixture

A miniature copy of the real folder layout used by `tests/lint/boundaries.test.ts`.
Files named `ok-*.ts` must lint clean; files named `bad-*.ts` must each report exactly
one `boundaries/dependencies` error. This folder is excluded from the main lint run and
from TypeScript compilation.
