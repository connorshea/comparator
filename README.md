# comparator

Compares ESLint and Oxlint violations on a target repository to evaluate how well Oxlint covers your existing ESLint rules.

NOTE: **Only run this tool on repositories you trust. It will install dependencies and run code from the target repo.**

## What it does

1. Clones the target repository and installs its dependencies
2. Runs ESLint using the repo's existing config
3. Migrates the ESLint config to an Oxlint config (using `oxlint-tsgolint`)
4. Runs Oxlint with the migrated config
5. Compares violations and reports matches, mismatches, and unsupported rules

## Usage

```bash
pnpm run compare <repo-url> [--branch <branch>] [--type-aware]
```

**Options:**
- `--branch <branch>` — check out a specific branch (defaults to the repo's default branch)
- `--type-aware` — enable type-aware linting in Oxlint

**Example:**
```bash
pnpm run compare https://github.com/some-org/some-repo
pnpm run compare https://github.com/some-org/some-repo --branch main --type-aware
```

## Output

The report shows:
- Violations only found by ESLint (potential gaps in Oxlint coverage)
- Violations only found by Oxlint (potential false positives or extras)
- Matched violations (found by both)
- Unsupported rules that were skipped
- A summary with match percentage and tool versions

## Example

An example from porting the `renovatebot/renovate` repo:

```
=== Oxlint vs ESLint Comparison ===
Repository: https://github.com/renovatebot/renovate

ESLint violations (supported rules only): 0
Oxlint violations: 19
Matched violations: 0

--- Only in ESLint (0 violations) ---
  (none)

--- Only in Oxlint (19 violations) ---
  test/docs/documentation.spec.ts:228:41  jest/valid-describe-callback
  lib/config/global.spec.ts:9:5  jest/valid-expect
  lib/config/inherit.spec.ts:9:5  jest/valid-expect
  lib/modules/manager/index.spec.ts:29:7  vitest/no-conditional-tests
  lib/modules/datasource/deb/index.spec.ts:280:7  vitest/hoisted-apis-on-top
  lib/modules/datasource/crate/index.spec.ts:322:7  vitest/hoisted-apis-on-top
  lib/modules/manager/haskell-cabal/extract.spec.ts:91:5  jest/no-standalone-expect
  lib/modules/manager/haskell-cabal/index.spec.ts:32:5  jest/no-standalone-expect
  lib/util/git/index.spec.ts:40:28  jest/valid-describe-callback
  lib/config/presets/internal/index.spec.ts:32:7  vitest/no-conditional-tests
  lib/config/options/index.spec.ts:55:7  vitest/no-conditional-tests
  lib/config/options/index.spec.ts:75:7  vitest/no-conditional-tests
  lib/config/options/index.spec.ts:83:13  vitest/no-conditional-tests
  lib/modules/versioning/docker/index.ts:84:7  @typescript-eslint/prefer-optional-chain
  lib/modules/versioning/index.ts:24:9  @typescript-eslint/prefer-optional-chain
  lib/modules/datasource/docker/index.ts:667:20  @typescript-eslint/no-unnecessary-type-assertion
  lib/modules/manager/npm/post-update/rules.ts:26:23  @typescript-eslint/prefer-optional-chain
  lib/modules/manager/homebrew/extract.ts:24:7  @typescript-eslint/prefer-optional-chain
  lib/workers/repository/update/pr/index.ts:605:7  @typescript-eslint/prefer-optional-chain

--- Unsupported Rules (skipped, 1 total) ---
  import-x/no-unresolved

Summary: Migration ported 178 rules (99.4% of 179 total). ESLint reported no violations.
Versions: ESLint 9.39.2, Oxlint 1.49.0, oxlint-tsgolint 0.14.1
```

Example repos I have tested the tool on:

- https://github.com/renovatebot/renovate (use Node 24.11.0)
- https://github.com/microsoft/vscode (use Node 22.22.0)
- https://github.com/mastodon/mastodon (note that the ESLint config for Mastodon is _weird_ and intentionally excludes all js/jsx files from linting in a way that Oxlint doesn't manage to migrate correctly, so the results are a bit wonky)


## TODO

- [ ] Add a `--js-plugins` flag, unfortunately I'm unsure how successful it'll be since so many repos use local plugins that can't be migrated automatically right now.
