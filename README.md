# STM32WB55 BLE Garage Intrusion Sensor + Bugsnag

Simple Node.js helper that simulates an STM32WB55 BLE garage intrusion sensor crash and uploads it to Bugsnag. Use it to validate your API key, experiment with metadata, or integrate with a CI gate before rolling the notifier into firmware tooling.

## Prerequisites

- Node.js 18+ and npm
- A Bugsnag project API key with permission to create error events

## Environment Setup

1. **Install Node.js** – grab the latest LTS (18+) from [nodejs.org](https://nodejs.org/) so npm is available in your shell.
2. **Clone the repo** – `git clone https://github.com/dwhitfield6/STM32WB55_BLE_Garage_Intrusion_Sensor_Bugsnag.git && cd STM32WB55_BLE_Garage_Intrusion_Sensor_Bugsnag`
3. **Install npm deps** – `npm install` pulls in `@bugsnag/node` and `dotenv` (only needed once per machine).
4. **Configure secrets**
	- Copy the sample file: `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`)
	- Fill `BUGSNAG_API_KEY` with your project key
	- Optionally adjust `SENSOR_ID`, `FIRMWARE_VERSION`, and `NODE_ENV`
5. **Verify setup** – run `node -v`, `npm -v`, and `npm start` to ensure everything resolves correctly.

## Run the Tool

1. Confirm `.env` contains a valid `BUGSNAG_API_KEY` (plus optional `SENSOR_ID`, `FIRMWARE_VERSION`).
2. From the project root run one of:
	- `npm start` – default command that runs the smoke test and simulated crash once
	- `npm run crash` – alias for the same behaviour, useful if you add other scripts later
	- `run-crash.bat [crash name]` – Windows helper that optionally sets `CRASH_NAME` (supports multi-word names like `"Garage Door Watchdog"`; run `run-crash.bat --help` for examples)

`run-crash.bat` prompts if you omit a name, otherwise it forwards whatever you pass (including spaces) to the Node script so each crash in Bugsnag reflects the label you supplied. Examples:

- `run-crash.bat`
- `run-crash.bat Garage_Door_Watchdog`
- `run-crash.bat "Garage Door Watchdog"`

## Crash Archive Downloads

Every crash now includes an `attachments` metadata card in Bugsnag so you can pull down a zipped artifact with the logs used to build the event. You have two options:

1. **Inline zip (default)** – Set nothing and the script will build a tiny ZIP on the fly that contains `crash-report.json`, `task-log.json`, and `event-log.json`. Bugsnag shows a `data:application/zip;base64,...` link; paste it into a browser tab (or use a base64 decoder) to download the archive.
2. **External link** – Point `CRASH_ARCHIVE_URL` (in `.env`) at any hosted ZIP (S3, GitHub Releases, etc.). Bugsnag will display that URL so teammates can click-to-download directly. Set `INLINE_CRASH_ZIP=false` if you only want the external link.

`.env` quick reference:

```
CRASH_ARCHIVE_URL=https://example.com/garage-stm32-dump.zip
INLINE_CRASH_ZIP=true
```
3. Watch the console:
	- First `Bugsnag.notify(new Error('Test error'))` verifies connectivity
	- Then the watchdog crash is thrown, caught, enriched, and uploaded
4. Check your Bugsnag dashboard for two new events (smoke test + sensor crash). Each run exits with code `1`, mirroring a real firmware crash exit path, so wrap it in CI accordingly.

## Trigger a Crash Upload

Run `npm start` (or `npm run crash`). The script intentionally throws a `GARAGE_SENSOR_WATCHDOG` error, catches it locally, and forwards the enriched event to Bugsnag with:

- Sensor identity (defaults to `garage-door-node-01`)
- Firmware/hardware metadata
- Context `garage.intrusion.sensor` so you can filter events quickly

When the upload succeeds the process exits with code `1`, mirroring a firmware crash exit path. Missing environment variables are reported up front so you can fix configuration issues before running again.

## Customizing

- Override `NODE_ENV`, `SENSOR_ID`, or `FIRMWARE_VERSION` in `.env` to match staged hardware
- Adapt `src/index.js` to surface additional metadata (RSSI, voltage, etc.) or wrap existing tooling that parses crash dumps before notifying Bugsnag

## Bugsnag Browser Quickstart

Need a browser-side harness instead? Drop the snippet below into any front-end project (Vite, React, vanilla `script type="module"`) to boot Bugsnag crash reporting and performance measurements with the same API key:

```js
import Bugsnag from '@bugsnag/js';
import BugsnagPerformance from '@bugsnag/browser-performance';

Bugsnag.start({ apiKey: '884e74a2fd7eea7a73f061af7d77c178' });
BugsnagPerformance.start({ apiKey: '884e74a2fd7eea7a73f061af7d77c178' });
```

Load this snippet before the rest of your app code—ideally in its own tiny bundle injected in the `<head>`—so Bugsnag captures the earliest crashes and performance marks. The API key above is ready for quick experiments, but treat it like any secret in production by swapping it for your project-specific key via environment variables or your framework's build tooling.

