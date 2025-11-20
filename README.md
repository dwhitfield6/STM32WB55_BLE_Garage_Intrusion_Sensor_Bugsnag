# STM32WB55 BLE Garage Intrusion Sensor + Bugsnag

Simple Node.js helper that simulates an STM32WB55 BLE garage intrusion sensor crash and uploads it to Bugsnag. Use it to validate your API key, experiment with metadata, or integrate with a CI gate before rolling the notifier into firmware tooling. The sample project streams crashes to the hosted dashboard here: [STM32WB55 BLE Garage Intrusion Sensor (Bugsnag)](https://app.bugsnag.com/personal-projects-7/stm32wb55-ble-garage-intrusion-sensor).

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
	- `npm start` – default command that throws the simulated crash once
	- `npm run crash` – alias for the same behaviour, useful if you add other scripts later
	- `run-crash.bat [crash name]` – Windows helper that optionally sets `CRASH_NAME` (supports multi-word names like `"Garage Door Watchdog"`; run `run-crash.bat --help` for examples)

`run-crash.bat` prompts if you omit a name, otherwise it forwards whatever you pass (including spaces) to the Node script so each crash in Bugsnag reflects the label you supplied. Examples:

- `run-crash.bat`
- `run-crash.bat Garage_Door_Watchdog`
- `run-crash.bat "Garage Door Watchdog"`

## Crash Archive Downloads

Each crash now surfaces an `attachments` metadata card inside Bugsnag. By default the card lists the three ZIP files checked into this repo (`Artifacts/tasklog.zip`, `Artifacts/eventlog.zip`, `Artifacts/gdb_coredump.zip`) so reviewers know exactly which archive to fetch or ship with the bug report. To customize:

1. **Use repo bundles (default)** – keep `INCLUDE_LOCAL_ATTACHMENTS=true` and update the ZIPs under `Artifacts/` whenever you capture a new log bundle. Bugsnag will display clickable URLs that point directly at those raw files (via `REPO_DOWNLOAD_BASE_URL`).
2. **Link to hosted bundles** – set `CRASH_ARCHIVE_URL` in `.env` to a publicly reachable ZIP (e.g., S3, Azure Blob, GitHub Release). Bugsnag will show that URL so teammates can click-to-download directly. Optionally set `INCLUDE_LOCAL_ATTACHMENTS=false` if you don’t want local artifacts listed.

`.env` quick reference:

```
CRASH_ARCHIVE_URL=https://example.com/garage-stm32-dump.zip
INCLUDE_LOCAL_ATTACHMENTS=true
REPO_DOWNLOAD_BASE_URL=https://raw.githubusercontent.com/dwhitfield6/STM32WB55_BLE_Garage_Intrusion_Sensor_Bugsnag/main
```

`REPO_DOWNLOAD_BASE_URL` controls the prefix used for the clickable links that point at `Artifacts/*.zip`. Leave the default to serve files directly from GitHub’s raw view, or swap in your own CDN/hosting location.
3. Watch the console: the script prints `Simulating STM32WB55 intrusion sensor crash "<name>"...` and, after enrichment, `Crash "<name>" sent to Bugsnag.`
4. Check your Bugsnag dashboard for the new sensor crash. Each run exits with code `1`, mirroring a real firmware crash exit path, so wrap it in CI accordingly.

## Trigger a Crash Upload

Run `npm start` (or `npm run crash`). The script intentionally throws a `Coredump Forced` error, catches it locally, and forwards the enriched event to Bugsnag with:

- Sensor identity (defaults to `garage-door-node-01`)
- Firmware/hardware metadata
- Context `garage.intrusion.sensor` so you can filter events quickly

When the upload succeeds the process exits with code `1`, mirroring a firmware crash exit path. Missing environment variables are reported up front so you can fix configuration issues before running again.

## What You See in Bugsnag

Once a crash lands in Bugsnag, each tab is already pre-populated so reviewers can triage without hunting for artifacts:

- **Device tab** – Sets `app_version=520b`, `chip_id=stm32wb55rg`, `coredump_version=1`, `cpu=CPU_1`, `firmware=52..0b`, `hw_id=123456789`, `manufacturer=David`, `model=Guide`, `serial number=123456789`, `type=Errors::Watchdog`, plus `RTOS=FreeRTOS 10.3` and `country_code=US`.
- **User tab** – Uses the fixed `id=123456789` / `name=987654321` pairing so alerts are easy to spot, while `sensor_user_mapping` metadata records the originating sensor ID for traceability.
- **Metadata tabs** – Expandable cards summarize everything pulled from the simulated coredump:
	- `diagnostics`: watchdog window, BLE RSSI, heartbeat timestamp, and crash label.
	- `stats`: `app_protocol`, `comms_channel`, `crash_timestamp`, `watchdog_fired`.
	- `registers`: Cortex-M4 snapshot (core registers, SP/LR/PC/PSR) sourced from [`Artifacts/coredump/gdb_coredump.bin`](Artifacts/coredump/gdb_coredump.bin).
	- `threads`: Clickable tables for every thread captured in the coredump, including state, stack usage, registers, syscalls, and backtraces.
	- `tasks`: Mirrors the thread tables plus the legacy task list for dashboards that still expect the old shape.
	- `tasklog`: Links to the captured SystemView trace (`trace_001.SVDat`) and lists the last 32 task switches (task names only) so you can spot scheduling churn quickly.
	- `eventlog`: Recent BLE/intrusion milestones plus a ZIP download for the raw SYSVIEW export.
	- `attachments`: Click-to-download ZIPs pointing at `Artifacts/*.zip` (or your hosted bundle via `CRASH_ARCHIVE_URL`).

These defaults live in `src/index.js`. Update the `CORE_DUMP_THREAD_SNAPSHOTS`, `buildRegisterSnapshot`, or any metadata helpers if you capture a new coredump and want the UI to stay in lockstep with real hardware.

## Testing & Validation

1. Run `npm run crash` (or `run-crash.bat <name>`). The process logs the simulated crash name and exits with status 1 after sending the event.
2. Open Bugsnag and confirm a single new event for the crash name you provided. Verify the metadata tabs render the SVDat link, 32-task switch list, and GDB-derived task tables.
3. Optional: refresh the GDB snapshots by running `Artifacts/gdb_coredump/gdb.bat` with `GDB_EXTRA_EX='-ex "set logging file thread_apply_all_bt.txt" -ex "set logging on" -ex "thread apply all bt" -ex "set logging off" -ex "quit"'`. Commit the updated `thread_apply_all_bt.txt` to keep the `tasks` tab aligned with your latest coredump.
4. If you host crash bundles elsewhere, set `CRASH_ARCHIVE_URL` and re-run the crash to ensure Bugsnag surfaces the new attachment destination you expect.

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

