# UX Phase 2 · Sign in, invitation and password reset

**Branch** `ux/07-auth` → **base** `ux/06-ops-partners-rate-cards`

## What changes, in plain words

One sign-in page for partners and staff, with show/hide on every password box, errors next to the field, a clear message when an account is locked with a link to reset it, and step hints on the invitation and reset pages. Phones get a compact brand panel so the form is on screen straight away.

## Checklist items this closes (brief §12.4 / §13)

- [x] No dead ends: lock-out links to reset (§13 rule 10)
- [x] Forms: field errors inline, form-level error at the top

## Before and after

Light theme at 1440 px, and dark at 390 px. All widths and both themes: `docs/ux/before/` and `docs/ux/after/`.

### login

| Before | After |
| --- | --- |
| ![before login light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/before/login/light-1440.png?raw=true) | ![after login light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/after/login/light-1440.png?raw=true) |
| ![before login dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/before/login/dark-390.png?raw=true) | ![after login dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/after/login/dark-390.png?raw=true) |

### login-error

| Before | After |
| --- | --- |
| ![before login-error light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/before/login-error/light-1440.png?raw=true) | ![after login-error light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/after/login-error/light-1440.png?raw=true) |
| ![before login-error dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/before/login-error/dark-390.png?raw=true) | ![after login-error dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/after/login-error/dark-390.png?raw=true) |

### reset-password

| Before | After |
| --- | --- |
| ![before reset-password light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/before/reset-password/light-1440.png?raw=true) | ![after reset-password light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/after/reset-password/light-1440.png?raw=true) |
| ![before reset-password dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/before/reset-password/dark-390.png?raw=true) | ![after reset-password dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/after/reset-password/dark-390.png?raw=true) |

### reset-password-confirm

| Before | After |
| --- | --- |
| ![before reset-password-confirm light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/before/reset-password-confirm/light-1440.png?raw=true) | ![after reset-password-confirm light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/after/reset-password-confirm/light-1440.png?raw=true) |
| ![before reset-password-confirm dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/before/reset-password-confirm/dark-390.png?raw=true) | ![after reset-password-confirm dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/after/reset-password-confirm/dark-390.png?raw=true) |

### invite-token-invalid

| Before | After |
| --- | --- |
| ![before invite-token-invalid light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/before/invite-token-invalid/light-1440.png?raw=true) | ![after invite-token-invalid light-1440](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/after/invite-token-invalid/light-1440.png?raw=true) |
| ![before invite-token-invalid dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/before/invite-token-invalid/dark-390.png?raw=true) | ![after invite-token-invalid dark-390](https://github.com/jearl09/liveluxe-partner-portal/blob/ux/07-auth/docs/ux/after/invite-token-invalid/dark-390.png?raw=true) |


## How to check it

- Sign in with a wrong password, then a right one; open an expired invitation link.

## Commits (1)

- ab7d209 UX Phase 2 · Sign in, invitation, reset: 'Sign in' for both sides on a 420 px card, show/hide password everywhere a password is typed, inline field errors, lock-out message that links to reset, step hints on invitation and reset, Melbourne · Sydney · Brisbane eyebrow, compact brand panel on phones

Judgement calls: `docs/ux/DECISIONS.md`. Backend gaps: `docs/ux/NEEDS_BACKEND.md`.
