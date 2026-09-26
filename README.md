# daytojest-catalog

Public joke catalog for the DayToJest app. The app fetches
`https://raw.githubusercontent.com/El-miguelito/daytojest-catalog/master/jokes.json`
at boot (best-effort) and also ships a snapshot of it.

## Add jokes

1. Branch. Append entries to `jokes.json` with the next free `seed_key`
   per category (`noir-0043`, `noir-0044`, …). **Never** reuse or renumber a
   key.
2. Bump `catalog_version` by 1.
3. Open a PR. CI runs `node scripts/validate.mjs`.
4. Merge. Existing installs pick it up on their next boot.

## Retire a joke

Delete its entry, bump `catalog_version`, PR, merge. The app marks it
`retired` (kept in albums where already unlocked, never drawn again). Its
`seed_key` is gone for good.

## Rules enforced by CI

- `seed_key` matches `^[a-z_]+-\d{4}$`, unique, never below the category's
  highest existing sequence for a *new* key.
- `category` ∈ `dad_joke, noir, coquin, pueril`.
- `rarity` ∈ `commune, rare, epique, legendaire`.
- `catalog_version` strictly greater than `master`'s.
- Near-duplicate `content` → warning only.
