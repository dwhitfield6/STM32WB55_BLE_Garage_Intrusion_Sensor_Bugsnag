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
  appType: 'STM32WB55_BLE_Garage_Intrusion_Sensor',
  appVersion: process.env.FIRMWARE_VERSION || '52.0b',
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

  event.device = event.device || {};
  event.device.country_code = 'US';
  event.device.RTOS = 'FreeRTOS 10.3';

  if (event.app && event.app.runtimeVersions) {
    delete event.app.runtimeVersions;
  }
  if (event.device && event.device.runtimeVersions) {
    delete event.device.runtimeVersions;
  }
  if (event.runtimeVersions) {
    delete event.runtimeVersions;
  }

  removeKeys(event.device, ['freeMemory', 'hostname', 'osName', 'osVersion', 'time', 'totalMemory']);
  removeKeys(event, ['freeMemory', 'hostname', 'osName', 'osVersion', 'time', 'totalMemory']);

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
      crashArchive: crashArchiveUrl
    };
  }

  if (!includeLocalAttachments) {
    return null;
  }

  return {
    tasklogZip: buildRemoteAttachment('Artifacts/tasklog.zip'),
    eventlogZip: buildRemoteAttachment('Artifacts/eventlog.zip'),
    gdbCoreDumpZip: buildRemoteAttachment('Artifacts/gdb_coredump.zip')
  };
}

function buildRemoteAttachment(relativePath) {
  const normalizedRelativePath = relativePath.replace(/^\/+/, '');
  const base = repoDownloadBaseUrl.replace(/\/+$/, '');
  return `${base}/${normalizedRelativePath}`;
}

function removeKeys(target, keys) {
  if (!target) {
    return;
  }
  keys.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      delete target[key];
    }
  });
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
