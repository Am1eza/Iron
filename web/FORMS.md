# Fooladno Web — Forms
## Layer 4 · Frontend — Document 4 (Forms)

**Version:** 1.0 · 26 June 2026
**Builds on:** `STATE-MANAGEMENT.md`, `product/acceptance-criteria.md` (§F, §3.3, §6), `design/accessibility.md`, `design/components.md`.
**Purpose:** The forms system — validation, accessible field components, submission handling, and the feature forms (login/OTP, request, alert, cooperation, contact). RTL/Persian, WCAG 2.2 AA, mock-aware.

## 1. Principles
1. **Zod is the single source of validation** — schemas are reused by forms *and* (later) the API. Persian messages.
2. **React Hook Form** for state/perf; `zodResolver` bridges the two.
3. **Accessible by construction** — `<label>`, `aria-invalid`, `aria-describedby`, focus-first-error, errors in text (not color alone), accessible OTP (paste allowed, no puzzle — acceptance-criteria §3.3.8).
4. **Digit-agnostic** — inputs accept Persian/Arabic/Latin digits and normalize.
5. **No dead-ends** — every submit ends in a clear success or a retryable error (Persian, never English/stack); drafts aren't lost on failure.
6. **Server validates too** — client validation is UX; the API re-validates with the same schemas.

## 2. Architecture
```
lib/validation/  messages.ts (Persian) · schemas.ts (Zod, shared)
lib/api/forms.ts  mock-aware submitters (requestOtp/verifyOtp/submitRequest/createAlert/submitCooperation/submitContact)
components/forms/ fields.tsx (Field·TextInput·Textarea·RadioGroup·SelectInput) · OtpInput · FormStatus
                  LoginForm · RequestForm · AlertForm · CooperationForm · ContactForm
components/primitives/ Button (shared; formalized in the Primitives section)
```

## 3. Validation (Zod)
- **`mobileSchema`** — Iranian mobile; normalizes `+98/0098/۹۸`/Persian digits → `09XXXXXXXXX`.
- **`otpCodeSchema`** — exactly 5 digits (after normalization).
- **`numberSchema`** — preprocess (normalize digits) → positive number (thresholds, qty).
- Form schemas: `requestSchema`, `alertSchema`, `cooperationSchema`, `contactSchema`, `weightSchema`. Types are inferred (`z.infer`) and shared with components.

## 4. Field components & a11y
- **`Field`** — label + control slot + helper/error; wires `htmlFor`, `aria-describedby`, required marker.
- **`TextInput`/`Textarea`** — spread RHF `register()` (incl. ref); set `aria-invalid`, `inputmode`/`type` (tel/numeric) for the right mobile keyboard, ≥16px (no iOS zoom).
- **`RadioGroup`** — `fieldset/legend`; for below/above, channel, cooperation track.
- **`OtpInput`** — N boxes (LTR), auto-advance, **paste-fills all**, error/shake (reduced-motion: static), announces attempts/time; `inputmode=numeric`, `autocomplete=one-time-code`.
- **`FormStatus`** — success (`role=status`) / error (`role=alert`) banner.
- RHF `shouldFocusError` moves focus to the first invalid field on submit.

## 5. Submission pattern
1. `handleSubmit(zod)` → on valid, set `submitting`.
2. Call `lib/api/forms.*` (mock returns success; live calls `/api/*`).
3. Success → `FormStatus`/toast + reset/redirect; Failure → Persian error + retry, **draft preserved**.
4. Server field-errors map back to the form (`setError`).
5. Forms that touch identity go through the **OTP gate** (login, request).

## 6. Form catalog
| Form | Schema | Endpoint | Behavior |
|---|---|---|---|
| **LoginForm** (OTP) | mobile → otp | `requestOtp` → `verifyOtp` | 2-step; resend countdown; on success seeds `authStore`, redirects `?next` |
| **RequestForm** | requestSchema | `submitRequest` | name+mobile+channel + cart items → پیش‌فاکتور ref; OTP for guests |
| **AlertForm** | alertSchema | `createAlert` | below/above + value + channel; OTP gate; mounted in a modal |
| **CooperationForm** | cooperationSchema | `submitCooperation` | track + company + mobile + message → CRM (tagged) |
| **ContactForm** | contactSchema | `submitContact` | name + mobile + message |
| **WeightCalc / Estimator** | weightSchema | (Tools section) | calculators — built with the Tools section |

## 7. OTP specifics (acceptance-criteria §F2)
- 5-digit, TTL 120s, resend after 60s (max 3/h), 5 attempts → 15-min lock (enforced server-side; the UI reflects state).
- **Paste allowed**; auto-advance is an enhancement; the timer/lock is announced, never the only cue.

## 8. RTL / Persian
- Inputs `dir` correct; OTP boxes LTR; Persian validation messages; units on the inline-end; numbers normalized; phone shown LTR-isolated.

## 9. Mock ⇄ live
- `NEXT_PUBLIC_API_MODE=mock` → submitters resolve success (verify accepts `12345`, others succeed) so flows are demoable; `live` calls the real `/api/*`.

*Fooladno — اول مشورت، بعد خرید.*
