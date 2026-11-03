# Default-on notification sound — 2026-10-21

Scope: shared Steamfoot/course (music/sports) notice bell, including HQ selected-store views. Existing notice feature defaults stay on. Sound now defaults on when this browser/store has no saved choice; explicit `off` remains off. The switch stays inside the bell panel; no settings navigation is needed.

An ordinary page pointer, touch or keyboard gesture unlocks Web Audio. Unsupported audio and rejected resumes do not break notifications; later gestures retry. Initial snapshots are silent, and a later pending-count increase plays the existing short tone when audio is running. The browser's autoplay policy, device volume/mute and background throttling still apply. No system-notification permission is requested.

Validation:

- 98 targeted tests pass: both module defaults, saved mute, per-store preferences, no eager audio/no initial tone, ordinary page gestures, rejected resume retry, unsupported audio/storage, StrictMode cleanup, bell loading and existing handling flows, operation guides.
- TypeScript and changed-source ESLint pass.
- Synthetic Chromium preview passes 1366×900, 1920×1080, 1024×768, 768×1024, 560×800 and 390×844: default checked switch, initial silence, audio unlock without opening the bell, oscillator created for a new pending notice, mute surviving reload, existing mark/undo/error/draft/setting flows and no horizontal overflow. Screenshots show the default-on switch inside the panel.
- Fixture uses synthetic notices and browser dimensions. Oscillator creation is verified, not physical speaker output, signed-in production booking flows or real iPad/Safari audio.

Reproduce: `QA_OUTPUT=/tmp/default-notice-sound-preview node scripts/qa/steamfoot-store-notices-browser.mjs`.
