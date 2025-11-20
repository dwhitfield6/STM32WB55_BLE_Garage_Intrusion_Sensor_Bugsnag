require('dotenv').config();
const Bugsnag = require('@bugsnag/node');

const apiKey = process.env.BUGSNAG_API_KEY;
const DEFAULT_CRASH_NAME = 'STM32WB55_Intrusion_Sensor';
const crashName = process.env.CRASH_NAME || DEFAULT_CRASH_NAME;
const crashArchiveUrl = process.env.CRASH_ARCHIVE_URL;
const includeLocalAttachments = (process.env.INCLUDE_LOCAL_ATTACHMENTS || 'true').toLowerCase() !== 'false';
const repoDownloadBaseUrl = process.env.REPO_DOWNLOAD_BASE_URL || 'https://raw.githubusercontent.com/dwhitfield6/STM32WB55_BLE_Garage_Intrusion_Sensor_Bugsnag/main';

if (!apiKey) {
  console.error('Missing BUGSNAG_API_KEY. Copy .env.example to .env and add your Bugsnag project key.');
  process.exit(1);
}

Bugsnag.start({
  apiKey,
  appType: 'stm32wb55-garage-sensor',
  appVersion: process.env.FIRMWARE_VERSION || '1.0.0',
  releaseStage: process.env.NODE_ENV || 'development'
});

async function simulateGarageCrash() {
  const error = new Error('Garage intrusion MCU watchdog reset');
  error.code = 'GARAGE_SENSOR_WATCHDOG';
  error.sensorId = process.env.SENSOR_ID || 'garage-door-node-01';
  error.detail = 'BLE link lost and watchdog fired while processing intrusion alert.';
  throw error;
}

function sendCrashToBugsnag(error, contextLabel) {
  const attachments = buildAttachmentMetadata(error, contextLabel);
  return new Promise(resolve => {
    Bugsnag.notify(
      error,
      event => {
        enrichEventWithDiagnostics(event, error, contextLabel, attachments);
      },
      notifyError => {
        if (notifyError) {
          console.error('Failed to notify Bugsnag:', notifyError);
        } else {
          console.log(`Crash "${contextLabel}" sent to Bugsnag.`);
        }
        resolve();
      }
    );
  });
}

function sendBugsnagSmokeTest() {
  console.log('Sending Bugsnag.notify smoke test error...');
  Bugsnag.notify(new Error('Test error'));
}

function enrichEventWithDiagnostics(event, error, contextLabel, attachments) {
  event.context = contextLabel;
  const sensorId = error.sensorId || process.env.SENSOR_ID || 'garage-door-node-01';
  event.setUser(sensorId, undefined, 'Garage Intrusion Sensor');
  event.severity = 'error';

  event.addMetadata('sensor', {
    sensorId,
    firmwareVersion: process.env.FIRMWARE_VERSION || '1.0.0',
    hardware: 'STM32WB55',
    location: 'Garage Door',
    reason: error.code || 'unknown'
  });

  event.addMetadata('diagnostics', {
    watchdogWindowMs: 1500,
    bleRssi: '-62dBm',
    lastHeartbeatTs: new Date().toISOString(),
    detail: error.detail,
    crashName: contextLabel
  });

  event.addMetadata('tasklog', {
    entries: buildTaskLogEntries(),
    lastCommand: 'tasklog stuff'
  });

    event.addMetadata('eventlog', {
    entries: buildEventLogEntries(),
    lastCommand: 'event log stuff'
  });

  event.addMetadata('tasks', {
    entries: buildTaskEntries(),
    lastCommand: 'task log stuff'
  });

  if (attachments) {
    event.addMetadata('attachments', attachments);
  }
}

function buildTaskLogEntries() {
  const now = Date.now();
  return [
    { ts: new Date(now - 3000).toISOString(), step: 'boot', result: 'ok' },
    { ts: new Date(now - 2000).toISOString(), step: 'ble_handshake', result: 'ok' },
    { ts: new Date(now - 1000).toISOString(), step: 'intrusion_detect', result: 'trip' },
    { ts: new Date(now - 200).toISOString(), step: 'watchdog', result: 'reset' }
  ];
}

function buildEventLogEntries() {
    const now = Date.now();
    return [
      { ts: new Date(now - 3000).toISOString(), event: 'system_start' },
      { ts: new Date(now - 2000).toISOString(), event: 'ble_handshake_success' },
      { ts: new Date(now - 1000).toISOString(), event: 'intrusion_detected' },
      { ts: new Date(now - 200).toISOString(), event: 'watchdog_reset' }
    ];
  }

function buildTaskEntries() {
    return [
      { id: '1', name: 'ble-link-handler', state: 'running' },
      { id: '2', name: 'intrusion-monitor-task', state: 'waiting' },
      { id: '3', name: 'stm32-watchdog', state: 'stopped' }
    ];
  } 

function buildAttachmentMetadata(error, contextLabel) {
  if (crashArchiveUrl) {
    return {
      crashArchiveUrl,
      note: 'External crash archive link'
    };
  }

  if (!includeLocalAttachments) {
    return null;
  }

  return {
    tasklog: buildRemoteAttachment('Artifacts/tasklog.zip', 'Task log snapshot'),
    eventlog: buildRemoteAttachment('Artifacts/eventlog.zip', 'Event log snapshot'),
    gdbCoreDump: buildRemoteAttachment('Artifacts/gdb_coredump.zip', 'GDB coredump')
  };
}

function buildRemoteAttachment(relativePath, description) {
  const normalizedRelativePath = relativePath.replace(/^\//, '');
  const downloadUrl = `${repoDownloadBaseUrl}/${normalizedRelativePath}`;
  return {
    downloadUrl,
    description
  };
}

async function main() {
  sendBugsnagSmokeTest();
  console.log(`Simulating STM32WB55 intrusion sensor crash "${crashName}"...`);
  await simulateGarageCrash();
}

main().catch(async error => {
  console.error('Crash captured locally. Uploading to Bugsnag...');
  await sendCrashToBugsnag(error, crashName);
  process.exit(1);
});
