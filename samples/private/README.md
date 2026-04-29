# samples/private/

This directory is for **real `.udf` files used during local development**.

It is **gitignored** — nothing under this directory is ever committed except this README. Real UDF files contain personal data (names, case numbers, judicial registry IDs), and committing them would leak that data into the public repository.

## What goes here

Drop any real `.udf` file you want to test the viewer against. The app's tests and dev launch will not depend on these files; they exist purely for ad-hoc manual testing.

## What does NOT go here

Sanitized test fixtures used by the automated test suite. Those live under [`../fixtures/`](../fixtures/) and **are** committed.

## How the gitignore works

The repo root `.gitignore` contains:

```gitignore
samples/private/
!samples/private/README.md
```

The first line excludes the entire directory; the second line re-includes only this README so the explanation stays visible in clones. If you add new files here, `git status` should not see them. If it does, the gitignore is broken — stop and fix it before staging anything.
