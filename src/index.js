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
  error.sensorId = process.env.SENSOR_ID || 'STM32WB55_BLE_Garage_Intrusion_Sensor';
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
  const sensorId = error.sensorId || process.env.SENSOR_ID || 'STM32WB55_BLE_Garage_Intrusion_Sensor';
  event.setUser('123456789', undefined, '987654321');
  event.addMetadata('User', {
    sensorId,
    userId: '123456789',
    userName: '987654321'
  });
  event.severity = 'error';

  event.device = event.device || {};
  event.device.country_code = 'US';
  event.device.RTOS = 'FreeRTOS 10.3';
  event.device.app_version = '52.0b';
  event.device.chip_id = 'stm32wb55rg';
  event.device.coredump_version = '1';
  event.device.cpu = 'CPU_1';
  event.device.firmware = '52.0b';
  event.device.hw_id = '123456789';
  event.device.manufacturer = 'David';
  event.device.model = 'Guide';
  event.device['serial number'] = '123456789';
  event.device.type = 'Errors::Watchdog';

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

  event.addMetadata('stats', {
    app_protocol: 1,
    comms_channel: 'UART',
    crash_timestamp: 123456789,
    watchdog_fired: true
  });

  event.addMetadata('registers', buildRegisterSnapshot());

  event.addMetadata('tasklog', {
    entries: buildTaskLogEntries(),
    lastCommand: 'tasklog stuff'
  });

  const eventLogTables = buildEventLogTables();
  event.addMetadata('eventlog', {
    lastCommand: 'event log stuff',
    note: 'Expand each event row to see the timeline payload decoded from SYSVIEW logs.',
    ...eventLogTables
  });

  const detailedTaskTables = buildDetailedTaskTables();

  event.addMetadata('tasks', {
    capturedFrom: buildRemoteAttachment('Artifacts/gdb_coredump.zip'),
    note: 'Expand each task row for register, stack, and backtrace details.',
    ...detailedTaskTables
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
    {
      ts: new Date(now - 3000).toISOString(),
      event: 'system_start',
      detail: 'MCU cold boot and scheduler bring-up',
      source: 'SYSVIEW_FreeRTOS.txt'
    },
    {
      ts: new Date(now - 2000).toISOString(),
      event: 'ble_handshake_success',
      detail: 'BLE link negotiated after 2 retries',
      source: 'SYSVIEW_BLE.txt'
    },
    {
      ts: new Date(now - 1000).toISOString(),
      event: 'intrusion_detected',
      detail: 'Hall sensor triggered > threshold',
      source: 'eventlog.txt'
    },
    {
      ts: new Date(now - 200).toISOString(),
      event: 'watchdog_reset',
      detail: 'Watchdog fired while draining BLE queue',
      source: 'SYSVIEW_FreeRTOS.txt'
    }
  ];
}

function buildEventLogTables() {
  return buildEventLogEntries().reduce((tables, entry, index) => {
    const label = `Event ${index + 1} — ${entry.event}`;
    tables[label] = {
      Timestamp: entry.ts,
      Detail: entry.detail,
      Source: entry.source
    };
    return tables;
  }, {});
}

function buildRegisterSnapshot() {
  return {
    architecture: 'ARM Cortex-M4',
    snapshotSource: buildRemoteAttachment('Artifacts/gdb_coredump.zip'),
    core: {
      r0: '0x2001FD44',
      r1: '0x00000001',
      r2: '0x20000010',
      r3: '0xE000ED2C',
      r4: '0x2001F60C',
      r5: '0x200013D0',
      r6: '0x20001000',
      r7: '0x2001F3C8',
      r8: '0x20001110',
      r9: '0x20001220',
      r10: '0x20001330',
      r11: '0x20001440',
      r12: '0x0800A37F',
      sp: '0x2001FF0C',
      lr: '0x0800D5D1',
      pc: '0x08023F42',
      psr: '0x21000000'
    },
    notes: 'Values decoded from the most recent coredump for quick register inspection.'
  };
}

function buildDetailedTaskTables() {
  return CORE_DUMP_TASK_SNAPSHOTS.reduce((tables, task) => {
    tables[task.label] = buildTaskDetailTable(task);
    return tables;
  }, {});
}

function buildTaskDetailTable(task) {
  return {
    State: task.state,
    Priority: task.priority,
    'Fault / Reason': task.reason,
    'Program Counter': task.pc,
    'Link Register': task.lr,
    'Stack Pointer': task.sp,
    'Stack Usage': formatStackUsage(task.stack),
    'High-Water Mark': formatHighWaterMark(task.stack),
    'Last Syscall': task.lastSyscall,
    'Top Frame': task.backtrace[0],
    'Backtrace': task.backtrace.join(' → '),
    Registers: formatRegisterPairs(task.registers)
  };
}

function formatStackUsage(stack = {}) {
  if (!stack.total || !stack.used) {
    return 'unknown';
  }
  const percentage = Math.round((stack.used / stack.total) * 100);
  return `${stack.used}/${stack.total} bytes (${percentage}%)`;
}

function formatHighWaterMark(stack = {}) {
  if (typeof stack.highWaterMark === 'undefined') {
    return 'unknown';
  }
  return `${stack.highWaterMark} bytes remaining`;
}

function formatRegisterPairs(registers = {}) {
  if (!Object.keys(registers).length) {
    return 'n/a';
  }
  return Object.entries(registers)
    .map(([reg, value]) => `${reg.toUpperCase()}: ${value}`)
    .join(', ');
}

const CORE_DUMP_TASK_SNAPSHOTS = [
  {
    label: 'Task 0 — HardFault_Handler',
    state: 'Faulted (precise bus error)',
    priority: 'ISR context',
    reason: 'HardFault while copying BLE packet',
    pc: '0x08023F42',
    lr: '0x0800D5D1',
    sp: '0x2001FF0C',
    registers: {
      r0: '0x2001FD44',
      r1: '0x00000001',
      r2: '0x20000010',
      r3: '0xE000ED2C',
      r12: '0x0800A37F',
      psr: '0x21000000'
    },
    stack: { used: 352, total: 512, highWaterMark: 144 },
    lastSyscall: 'xQueueSendFromISR(intrusionQueue)',
    backtrace: [
      '#0 HardFault_Handler() @ startup_stm32wb55xx.s:126',
      '#1 prvBleRadioIsrBridge() @ ble_link.c:218',
      '#2 EXTI4_15_IRQHandler() @ stm32wbxx_it.c:302',
      '#3 intrusion_isr_shim() @ intrusion_sensor.c:144'
    ]
  },
  {
    label: 'Task 1 — intrusion-monitor-task',
    state: 'Blocked (waiting on queue)',
    priority: '4 (High)',
    reason: 'Waiting for intrusion_event_queue',
    pc: '0x08010B4E',
    lr: '0x0800F8A9',
    sp: '0x2001F9D0',
    registers: {
      r0: '0x2000145C',
      r1: '0x00000000',
      r2: '0x20000AF0',
      r3: '0x20000AF0',
      r7: '0x2001FA0C'
    },
    stack: { used: 296, total: 512, highWaterMark: 168 },
    lastSyscall: 'xQueueReceive(intrusion_event_queue, 250ms)',
    backtrace: [
      '#0 xQueueGenericReceive() @ queue.c:2532',
      '#1 wait_for_intrusion_event() @ intrusion_sensor.c:201',
      '#2 intrusion_monitor_task() @ intrusion_sensor.c:156'
    ]
  },
  {
    label: 'Task 2 — ble-link-handler',
    state: 'Ready (preempted)',
    priority: '3 (Above normal)',
    reason: 'Pending on semBLELink',
    pc: '0x0800E21A',
    lr: '0x0800DFA2',
    sp: '0x2001F5E8',
    registers: {
      r0: '0x2000211C',
      r1: '0x20002184',
      r4: '0x2001F60C',
      r5: '0x200013D0',
      r7: '0x2001F60C'
    },
    stack: { used: 264, total: 384, highWaterMark: 144 },
    lastSyscall: 'xSemaphoreTake(semBLELink, 20ms)',
    backtrace: [
      '#0 uxPortYieldWithinAPI() @ port.c:465',
      '#1 ble_link_wait_for_evt() @ ble_link.c:412',
      '#2 ble_link_task() @ ble_link.c:361'
    ]
  },
  {
    label: 'Task 3 — freertos-idle',
    state: 'Idle',
    priority: '0 (Idle)',
    reason: 'FreeRTOS idle maintenance',
    pc: '0x0800C6F0',
    lr: '0x0800C6DF',
    sp: '0x2001F3A0',
    registers: {
      r0: '0x00000000',
      r1: '0x00000000',
      r2: '0x00000000',
      r3: '0x00000000',
      r7: '0x2001F3C8'
    },
    stack: { used: 128, total: 256, highWaterMark: 208 },
    lastSyscall: 'prvIdleTask() cleanup',
    backtrace: [
      '#0 prvIdleTask() @ tasks.c:4022'
    ]
  }
];

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
