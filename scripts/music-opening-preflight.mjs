import { runMusicOpeningSchemaPreflight } from "./music-opening-schema-check.mjs";

// This command must be the first build step; it never applies DDL or sends notifications.
try { await runMusicOpeningSchemaPreflight(); }
catch { console.error("[music-opening-preflight] blocked; verify exact Preview scope and isolated schema before deployment."); process.exit(1); }
