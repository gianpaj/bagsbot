# Reliability Hardening Audit

Tracks reliability/correctness findings across the bagsbot trading path
(SDK → live-trade/quote → positions → execution) and the test suite, with a
prioritized status for each. Severity: **P0** (data loss / crash / silent money
error) > **P1** (recoverable failure handled poorly) > **P2** (robustness /
defensive gap).

Status legend: `FIXED` (with regression test) · `OPEN` · `INVESTIGATING`.

---

## Test-suite stability

### TS-1 — Five leaked unhandled rejections from `retry.test.ts` — `FIXED`

- **Severity:** P1 (test-suite instability; masks real leaks)
- **Where:** `src/utils/retry.test.ts` (tests at the former lines 132/134,
  144/147, 161/164, 213/215, 332/334)
- **Failure mode:** Each of the 5 affected tests called
  `await vi.runAllTimersAsync()` **before** attaching a rejection handler to the
  `retry()` promise (`await expect(promise).rejects…` or `try { await promise }`).
  Flushing the fake timers drives the retry loop to exhaustion, so the promise
  **rejects during the flush while no `.catch` is yet registered**. Node/Vitest
  flags it as an unhandled rejection, producing `5 errors` in `npx vitest run`
  even though every test "passed".
- **Root cause:** test ordering, not a bug in `src/utils/retry.ts`. The retry
  source correctly rejects with `RetryExhaustedError` / the non-retryable error;
  the leak is purely that the consumer (the test) attached its handler one tick
  too late. Confirmed by correlation: the only `runAllTimersAsync()`-then-`await`
  tests that did **not** leak (lines 292/293, 318/319) are the ones whose
  promise *resolves* rather than rejects.
- **Fix:** attach the handler synchronously *before* flushing timers — capture
  `const assertion = expect(promise).rejects.toThrow(…)` (or
  `const captured = promise.then(() => undefined, (e) => e)`) prior to
  `await vi.runAllTimersAsync()`, then `await` it afterward. No assertion was
  weakened or deleted; the same conditions are still verified.
- **Verification:** `npx vitest run` now reports **0 errors** (previously
  `5 errors`); 1000 passed / 3 skipped unchanged. `npx tsc --noEmit` clean.
  `npx eslint src` unchanged at the 68-error baseline.

---

## Trade-path findings (audit in progress)

The full execution-path audit is ongoing. Confirmed findings so far:

### TP-1 — Non-atomic positions write can corrupt `positions.json` — `FIXED`

- **Severity:** P0 (persistent data loss for live position state)
- **Where:** `src/positions/storage.ts` (`PositionStorage.save`)
- **Failure mode:** `save()` called `writeFileSync(filePath, …)` directly against
  the live `~/.bagsbot/positions.json`. A crash, power loss, or a second writer
  interleaving mid-write left the file **truncated / half-written**. On the
  next startup `load()` (`storage.ts:80`) hits the `SyntaxError` branch and
  throws `Invalid JSON in positions storage`, so the bot could no longer read
  any of its open positions — silent loss of money-bearing state.
- **Fix:** `save()` now serializes to a temp sibling (`positions.json.tmp`) and
  then `renameSync`s it over the target. `renameSync` is atomic on POSIX, so a
  concurrent reader always observes either the complete old or the complete new
  file, and a failure during the temp write damages only the throwaway temp —
  never the live file. `load()` was intentionally left throwing on genuine
  corruption (not weakened), since atomic writes remove the truncation source.
- **Regression tests:** `src/positions/storage.test.ts` →
  `atomic write (TP-1 regression)`:
  - *“should write to a temp sibling then rename over the target”* — asserts the
    payload is written to `*.tmp` (never directly to `positions.json`) and
    `renameSync(tmp, target)` is called, leaving no temp behind.
  - *“should not corrupt existing positions when a write fails partway”* —
    seeds a good file, makes the next write truncate-and-throw (ENOSPC), and
    asserts the live `positions.json` is still intact and loadable afterward.
  Both fail against the pre-fix source (verified via `git stash`) and pass
  after. The `fs` mocks in `storage.test.ts` and `manager.test.ts` gained a
  `renameSync` implementation that mirrors an atomic in-memory rename.
- **Verification:** `npx vitest run` → 1002 passed / 3 skipped, **0 errors**;
  `npx tsc --noEmit` clean; `npx eslint src` unchanged at the 68-error baseline.

### TP-2 — Unvalidated quote `expectedOutput` poisons trade math — `FIXED`

- **Severity:** P1 (silent money-correctness error in the live execution path)
- **Where:** `src/trading/executor.ts` (`getQuote`, `executeSwap`), originating in
  `src/sdk/adapter.ts:60` (`expectedOutput: Number(quoteResponse.outAmount)`).
- **Failure mode:** The Bags SDK adapter coerces the quote fields with `Number()`.
  A missing/undefined `outAmount` becomes `NaN`; a `"0"` (or a token with no
  liquidity) becomes `0`. That value flowed unchecked into `executor.getQuote`’s
  returned `TradeQuote.expectedOutput`, and then into `executeSwap`:
  `executedPrice = prepared.quote.inputAmount / prepared.quote.expectedOutput`
  (`executor.ts:467`) and `tokensReceived = prepared.quote.expectedOutput`. With
  `expectedOutput = 0` the executed price is `Infinity`; with `NaN` it is `NaN`.
  Either value is then stored as the position entry price and propagates through
  every PnL/sizing calculation in `PositionManager` — a silent, persistent
  money-math corruption with no error raised.
- **Fix:** Validate the quote at the single chokepoint. `getQuote` now rejects any
  quote whose `expectedOutput` is not a finite number `> 0`, or whose
  `priceImpact` is not finite, throwing a `TradeError` (the existing catch wraps
  it). As defense in depth, `executeSwap` re-checks `expectedOutput` before the
  division and returns a failed `TradeResult` (without signing or submitting) if
  it is non-finite/non-positive, so a hand-built `PreparedSwap` cannot bypass the
  guard either. A legitimate `priceImpact` of `0` (e.g. the Jupiter fallback
  route, `JUPITER/datapi`) is explicitly still accepted.
- **Regression tests:** `src/trading/executor.test.ts` →
  - `getQuote > invalid-quote rejection (TP-2 regression)` — parametrized over
    `expectedOutput ∈ {0, negative, NaN, Infinity}` (each rejected as
    `TradeError` / `invalid expectedOutput`), a `priceImpact = NaN` rejection, and
    a positive control asserting `priceImpact = 0` is still accepted.
  - `executeSwap > should refuse to execute when the prepared quote has invalid
    expectedOutput` — asserts a bad `PreparedSwap` short-circuits to
    `success: false` **without** calling `walletManager.sign` or
    `sendAndConfirmTransaction`.
  All six new tests fail against the pre-fix source (verified via
  `git stash push -- src/trading/executor.ts`) and pass after.
- **Verification:** `npx vitest run` → 1009 passed / 3 skipped, **0 errors**;
  `npx tsc --noEmit` clean; `npx eslint src` at the 68-error baseline.

### TP-3 — Hung SDK network call blocks the trade path indefinitely — `FIXED`

- **Severity:** P1 (liveness: a single stuck request stalls quoting/execution).
- **Where:** `src/trading/executor.ts` (`getQuote`, `prepareSwap`, `executeSwap`),
  via the `retry()` calls wrapping `tradeService.getQuote` /
  `tradeService.prepareSwap` / `tradeService.sendAndConfirmTransaction`. Root
  capability gap in `src/utils/retry.ts`.
- **Failure mode:** Each SDK call (`@bagsfm/bags-sdk` HTTP, plus
  `connection.sendRawTransaction` / `confirmTransaction` in `adapter.ts`) was
  awaited with **no timeout**. `retry()` only re-attempts once the underlying
  promise *settles*, so a request that hangs (server never responds, dropped
  socket, stuck confirmation poll) blocks the retry loop — and the whole trade
  path — **forever**. No error is ever raised; the bot silently stops making
  progress on that mint. `maxRetries`/`shouldRetry` are powerless because the
  first attempt never returns.
- **Fix:** Added a per-attempt timeout to the retry utility. `RetryOptions` now
  accepts `timeoutMs`; when set, each `fn()` invocation is raced (via
  `Promise.race`, which preserves `fn`'s original rejection reason) against a
  timeout that rejects with a new `RetryTimeoutError`. A timeout is an ordinary
  error subject to `shouldRetry`/`maxRetries`, so a stuck attempt is aborted,
  backed off, and retried; after exhaustion it surfaces as
  `RetryExhaustedError` (with the `RetryTimeoutError` as its `cause`) and is
  wrapped by the executor's existing `TradeError` handling. The in-flight
  `fn()` promise keeps its own no-op `.catch`, so a late rejection after the
  timeout already won never leaks as an unhandled rejection. The executor wires
  concrete per-attempt budgets: `QUOTE_TIMEOUT_MS = 10s`,
  `PREPARE_TIMEOUT_MS = 15s`, `SUBMIT_TIMEOUT_MS = 60s`.
- **Regression tests:**
  - `src/utils/retry.test.ts` → `per-attempt timeout (TP-3 regression)`:
    *“should time out an attempt whose fn never settles”* (raw
    `RetryTimeoutError` with `shouldRetry:false`), *“should retry a timed-out
    attempt and exhaust with a timeout cause”* (asserts
    `RetryExhaustedError.cause instanceof RetryTimeoutError`, 3 attempts), plus
    two positive controls (*resolves when fn settles before the timeout*; *no
    timeout when `timeoutMs` is omitted*). Also `RetryTimeoutError` class tests.
  - `src/trading/executor.test.ts` → `getQuote > hung-request timeout (TP-3
    regression)`: a `tradeService.getQuote` that never settles is bounded —
    `getQuote` rejects with `TradeError` after `1 + maxRetries(3) = 4` timed-out
    attempts instead of hanging.
  The three behavior tests hang/fail against the pre-fix source (verified via
  `git stash push -- src/utils/retry.ts src/trading/executor.ts`) and pass
  after; the two controls pass either way.
- **Verification:** `npx vitest run` → 1018 passed / 3 skipped, **0 errors**;
  `npx tsc --noEmit` clean; `npx eslint src` at the 68-error baseline.

### TP-4 — Unvalidated current price corrupts persisted position value/PnL — `FIXED`

- **Severity:** P1 (silent, **persisted** money-tracking corruption).
- **Where:** `src/positions/manager.ts` (`updatePositionPrice`), fed by
  `src/trading/price-poller.ts` (`fetchCurrentPrice`, the live paper-mainnet
  price loop) and `src/simulation/engine.ts`.
- **Failure mode:** `updatePositionPrice(id, currentPrice)` wrote `currentPrice`
  straight into `position.currentValue = currentPrice * tokensHeld` and
  `position.pnlPercent`, then **atomically persisted to disk**, with no check on
  the price. The live poller computes that price as
  `probeSol / quote.expectedOutput` (`price-poller.ts:137`) and only guarded
  `expectedOutput <= 0` — which lets `NaN` and `Infinity` through (`NaN <= 0`
  and `Infinity <= 0` are both `false`). Because the poller calls the **raw**
  trade service (the SDK adapter, whose `Number()` coercion yields `NaN`/`0` for
  a missing/zero `outAmount`) and *not* `TradeExecutor.getQuote`, the TP-2
  validation never sees this path. A `NaN`/`Infinity` price therefore reached
  `updatePositionPrice`, poisoned `currentValue`/`pnlPercent`, and was written to
  `positions.json` (serialized as `null` by `JSON.stringify`), silently
  corrupting that position and every `getTotalValue`/`getTotalPnL`/`getStatistics`
  figure derived from it.
- **Fix:** Defense in depth at both chokepoints.
  - `updatePositionPrice` now rejects a `currentPrice` that is not a finite
    number `> 0`: it logs a warning and **returns without mutating or
    persisting**, so a bad tick can never overwrite good state. It intentionally
    does **not** throw (unlike the position-not-found case), because callers run
    it inside fire-and-forget poll/tick loops where a throw would surface as an
    unhandled rejection. This guards *all* callers (live poller + simulation
    engine).
  - `fetchCurrentPrice` now requires `Number.isFinite(quote.expectedOutput) &&
    expectedOutput > 0` before dividing, so the live path skips the position
    (returns `null`) instead of manufacturing a `NaN`/`Infinity` price.
- **Regression tests:**
  - `src/positions/manager.test.ts` → `updatePositionPrice > invalid price
    rejection (TP-4 regression)`: parametrized over
    `currentPrice ∈ {NaN, Infinity, -Infinity, 0, negative}` — each must not
    throw, must leave the previously-set good `currentPrice`/`currentValue`/
    `pnlPercent` intact, must not trigger an extra persist (`renameSync` call
    count unchanged), and the reloaded on-disk copy must still hold the finite
    good value.
  - `src/trading/price-poller.test.ts` → `skips a position when the quote
    expectedOutput is {NaN, Infinity, zero} (TP-4 regression)`: a raw quote with
    a non-finite/zero `expectedOutput` must not call `updatePositionPrice`. (The
    test waits for a *second* tick to prove the first fully completed; the `zero`
    case is a positive control for behavior that already held.)
  The 5 manager tests and the `NaN`/`Infinity` poller tests fail against the
  pre-fix source (verified via `git stash push -- src/positions/manager.ts
  src/trading/price-poller.ts`) and pass after.
- **Verification:** `npx vitest run` → 1026 passed / 3 skipped, **0 errors**;
  `npx tsc --noEmit` clean; `npx eslint src` at the 68-error baseline.

### TP-5 — `addPosition` accepts a non-finite entry basis and persists it — `FIXED`

- **Severity:** P1 (silent, **permanent** money-tracking corruption at trade open).
- **Where:** `src/positions/manager.ts` (`addPosition`), reached from
  `src/bot.ts:570` with `tradeResult.executedPrice` / `tradeResult.tokensReceived`.
- **Failure mode:** `addPosition` validated its numeric inputs with
  `if (entryPrice <= 0 || tokensHeld <= 0 || entrySol <= 0)`. That is a partial
  guard that *looks* complete: `NaN <= 0` and `Infinity <= 0` are both `false`,
  so a `NaN`/`Infinity` `entryPrice`, `tokensHeld`, or `entrySol` passes the
  check and is written into the new position and **persisted to disk**. Unlike
  TP-4 (a single recoverable price *tick*), this poisons the position's
  *permanent entry basis*: `entryPrice`/`entrySol` feed every later
  `pnlPercent`, `getTotalPnL`, `getTotalValue`, and `getStatistics` computation
  for the life of the position, and `JSON.stringify` serializes the non-finite
  value as `null`. The path is reachable: the synthetic simulation
  (`src/simulation/trade-service.ts`) derives `executedPrice = currentPrice *
  (1 + slip)` where `requireCurrentPrice` only guards `null`/`<= 0` (again
  letting `NaN` through), and that price flows into `addPosition`.
- **Fix:** `addPosition` now rejects any `entryPrice`/`tokensHeld`/`entrySol`
  that is not a finite number `> 0` (`!Number.isFinite(x) || x <= 0`), throwing
  the existing `Position parameters must be positive numbers`. Unlike
  `updatePositionPrice` (TP-4), throwing is correct here: this is the
  trade-*open* path, and both call sites of `executeTrade` already `try/catch`
  the throw (`bot.ts:511` and the `bot.ts:207` `.catch`), so it surfaces as a
  handled "trade failed" instead of an unhandled rejection. A bad open is
  rejected *before* any in-memory or on-disk position is created.
- **Regression tests:** `src/positions/manager.test.ts` → `addPosition >
  non-finite parameter rejection (TP-5 regression)`: parametrized over a
  `NaN`/`Infinity` value in each of the three numeric parameters — each must
  throw, must leave `getAllPositions()` empty, must not add a persist
  (`renameSync` call count unchanged), and a freshly-constructed
  `PositionManager` loading from disk must also see no position. All six fail
  against the pre-fix source (verified via `git stash push -- src/positions/manager.ts`)
  and pass after.
- **Verification:** `npx vitest run` → 1032 passed / 3 skipped, **0 errors**;
  `npx tsc --noEmit` clean; `npx eslint src` at the 68-error baseline.

### TP-6 — Confirmation mishandling on submit reports the wrong outcome — `FIXED`

- **Severity:** P0 (silent money-tracking corruption at trade open: an untracked
  buy or a phantom position for tokens never received).
- **Where:** `src/sdk/adapter.ts` (`BagsTradeServiceAdapter.sendAndConfirmTransaction`),
  on the live submit path reached from `src/trading/executor.ts` (`executeSwap`).
- **Failure mode:** Two distinct bugs in the send/confirm step.
  - **False positive (reverted tx → success):** the code `await`ed
    `connection.confirmTransaction(...)` but **discarded its result**, never
    inspecting `value.err`. A transaction can land yet fail on-chain (slippage
    revert, insufficient balance, custom program error); confirmation still
    *resolves*, just with `err` set. The adapter returned the signature anyway,
    so `executeSwap` reported `success: true` and the bot recorded a position
    (entry price/tokens) for a buy that **never delivered any tokens**.
  - **False negative (landed tx → reported failure):** if `confirmTransaction`
    *threw* (RPC timeout, dropped socket, `TransactionExpiredBlockheight…`), the
    whole method threw. But the transaction sent via `sendRawTransaction` may
    have **already committed** — the poll just couldn't observe it in time.
    `executeSwap`'s `retry` then re-ran the unit, and after exhaustion returned
    `success: false`, so the bot **never tracked tokens it actually bought** —
    permanent untracked holdings.
- **Fix:** Make confirmation outcome-faithful inside the adapter (no interface
  split required, so executor and all its mocks are untouched).
  - The `confirmTransaction` result is now checked: a non-`null` `value.err`
    throws `Transaction <sig> failed on-chain: <err>`, so a reverted tx is a
    failed swap, not a recorded buy.
  - `confirmTransaction` is wrapped in `try/catch`; on a thrown confirmation
    error the adapter calls a new best-effort `didTransactionLand` helper
    (`connection.getSignatureStatus(sig, { searchTransactionHistory: true })`).
    Only a committed (`confirmed`/`finalized`) signature with **no** execution
    `err` is treated as landed → the signature is returned (success). A missing
    status, an `err`, or a failed status lookup all fall through to **re-throwing
    the original confirmation error**, preserving the existing failure handling.
- **Regression tests:** `src/sdk/adapter.test.ts` →
  `BagsTradeServiceAdapter.sendAndConfirmTransaction (TP-6 regression)`:
  - *“throws when the transaction confirms but reverted on-chain”* — asserts a
    `value.err` result rejects (`/failed on-chain/`) and no status re-check is
    attempted. (Fails pre-fix: old code returned the signature.)
  - *“returns the signature when confirmation polling fails but the tx actually
    landed”* — `confirmTransaction` throws, `getSignatureStatus` shows
    `confirmed`/`err:null`; asserts the signature is returned and the status was
    queried with `searchTransactionHistory`. (Fails pre-fix: old code threw.)
  - Positive controls (pass either way): happy-path confirm; rethrow when the tx
    did not land (`value:null`); rethrow when it landed but reverted; rethrow
    when the status lookup itself throws.
  The two behavioral tests fail against the pre-fix source (verified via
  `git stash push -- src/sdk/adapter.ts`); all six pass after.
- **Verification:** `npx vitest run` → 1038 passed / 3 skipped, **0 errors**;
  `npx tsc --noEmit` clean; `npx eslint src` at the 68-error baseline.

### Still to audit (not yet confirmed)

- `src/simulation/trade-service.ts` — `requireCurrentPrice` guards `null`/`<= 0`
  but lets `NaN`/`Infinity` through (same partial-guard class as TP-4/TP-5); the
  resulting non-finite `executedPrice` is now stopped at the `addPosition`
  chokepoint by TP-5, so this is a defense-in-depth follow-up, not an open leak.
  Quote fetch fallback path / timeouts still to confirm.
- `src/trading/executor.ts` — confirmation outcome handling on submit
  (false-positive reverted tx + false-negative landed tx) now covered by TP-6.
  A residual robustness note: on a confirmation error that did *not* land,
  `executeSwap`'s `retry` re-runs `sendAndConfirmTransaction`, which re-broadcasts
  the same signed tx. Re-sending an identical signature is idempotent on Solana
  (no double-buy), but if the original blockhash has expired the re-send simply
  fails — acceptable, not a money risk. A full two-phase send/confirm interface
  split (send once, then poll-only on retry) remains a possible future refinement.
- `src/sdk/jupiter-price.ts`, `src/sdk/adapter.ts` — error propagation on quote
  failures. (`adapter.ts` network calls inherit the executor's TP-3 per-attempt
  timeouts.)
- `src/positions/manager.ts` — race conditions on shared in-memory state vs.
  storage. (Non-finite price poisoning of P&L now covered by TP-4; non-finite
  entry basis at open now covered by TP-5.)

---

## Verification commands (run after every slice)

```
npx tsc --noEmit      # must exit clean
npx vitest run        # must be 0 failures AND 0 unhandled errors
npx eslint src        # must not exceed the 68-error baseline
```
