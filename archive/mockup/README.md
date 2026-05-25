# Archived Static Mockup

This folder contains the original interactive static HTML/JS/CSS mockup created during the initial prototyping phase of Slopeffect.

## Purpose

These files are kept purely for historical design reference. They are **not** part of the active production desktop build (which resides under `apps/desktop` and is powered by React, Vite, Tauri, and Rust).

## Contents

- `index.html`: The prototype layout and structure.
- `app.js`: Simulated logic and mockup interactions (e.g. `simulateCommand`, `importPredefined`).
- `style.css`: Mockup styling.
- `package.json` / `package-lock.json`: Mockup local server configuration.

**Do not modify these files for production features.** Any real feature development should happen in `apps/desktop` or the shared Rust crates.
