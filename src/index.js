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
    systemViewTrace: buildRemoteAttachment('Artifacts/tasklog/SYSVIEW_FreeRTOS.txt'),
    switches: buildTaskSwitchEntries()
  });

  event.addMetadata('eventlog', {
    raw: 'ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEF',
    systemEvents: [
      'STM32 system_init: PLL locked and clocks stable',
      'STM32 ble_stack_start: HCI transport ready',
      'STM32 intrusion_monitor_task: ISR queued intrusion event',
      'STM32 watchdog_reset: IWDG triggered after stalled BLE queue flush'
    ],
    zipDownload: buildRemoteAttachment('Artifacts/eventlog.zip')
  });

  const detailedTaskTables = buildDetailedTaskTables();

  event.addMetadata('tasks', {
    capturedFrom: buildRemoteAttachment('Artifacts/gdb_coredump.zip'),
    threadDump: buildRemoteAttachment('Artifacts/gdb_coredump/thread_apply_all_bt.txt'),
    gdbCommand: 'thread apply all bt',
    note: 'Expand each task row for register, stack, and backtrace details derived from the latest GDB dump.',
    ...detailedTaskTables
  });

  if (attachments) {
    event.addMetadata('attachments', attachments);
  }
}

const TASK_SWITCH_PATTERN = [
  {
    from: 'prvIdleTask',
    to: 'HeartbeatTaskMain',
    runtimeUs: 180,
    latencyUs: 12,
    cpu: 8.5,
    reason: 'Heartbeat tick broadcast'
  },
  {
    from: 'HeartbeatTaskMain',
    to: 'PulseDensityMain',
    runtimeUs: 240,
    latencyUs: 18,
    cpu: 14.2,
    reason: 'Hall sensor pulse processing'
  },
  {
    from: 'PulseDensityMain',
    to: 'SendCommandsMain',
    runtimeUs: 310,
    latencyUs: 22,
    cpu: 21.6,
    reason: 'Console script TX window'
  },
  {
    from: 'SendCommandsMain',
    to: 'SongPlay',
    runtimeUs: 150,
    latencyUs: 10,
    cpu: 11.2,
    reason: 'Siren wavetable playback'
  },
  {
    from: 'SongPlay',
    to: 'BLE_AppTask',
    runtimeUs: 205,
    latencyUs: 14,
    cpu: 16.4,
    reason: 'BLE link keep-alive'
  },
  {
    from: 'BLE_AppTask',
    to: 'HciUserEvtProcess',
    runtimeUs: 270,
    latencyUs: 19,
    cpu: 19.7,
    reason: 'HCI event fanout'
  },
  {
    from: 'HciUserEvtProcess',
    to: 'AdvUpdateProcess',
    runtimeUs: 230,
    latencyUs: 17,
    cpu: 13.8,
    reason: 'Advertising start/stop'
  },
  {
    from: 'AdvUpdateProcess',
    to: 'prvIdleTask',
    runtimeUs: 120,
    latencyUs: 9,
    cpu: 6.1,
    reason: 'Returned to idle while waiting on flag'
  }
];

function buildTaskSwitchEntries() {
  const now = Date.now();
  const totalSwitches = 32;
  return Array.from({ length: totalSwitches }, (_, idx) => {
    const template = TASK_SWITCH_PATTERN[idx % TASK_SWITCH_PATTERN.length];
    const jitter = (idx % 5) * 3;
    const timestamp = new Date(now - (totalSwitches - idx) * 25).toISOString();
    return {
      ordinal: idx + 1,
      timestamp,
      fromTask: template.from,
      toTask: template.to,
      runtimeUs: template.runtimeUs + jitter,
      readyLatencyUs: template.latencyUs + (idx % 3),
      cpuPercent: parseFloat((template.cpu + jitter / 10).toFixed(1)),
      reason: template.reason
    };
  });
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
    Summary: {
      State: task.state,
      Priority: task.priority,
      'Fault / Reason': task.reason
    },
    Stack: {
      'Program Counter': task.pc,
      'Link Register': task.lr,
      'Stack Pointer': task.sp,
      'Stack Usage': formatStackUsage(task.stack),
      'High-Water Mark': formatHighWaterMark(task.stack)
    },
    Execution: {
      'Last Syscall': task.lastSyscall,
      'Top Frame': task.backtrace[0]
    },
    Backtrace: formatBacktraceList(task.backtrace),
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
    .join('\n');
}

function formatBacktraceList(backtrace = []) {
  if (!backtrace.length) {
    return 'n/a';
  }
  return backtrace.join('\n');
}

const CORE_DUMP_TASK_SNAPSHOTS = [
  {
    label: 'Thread 11 — AdvUpdateProcess',
    state: 'Blocked (notification wait)',
    priority: 'unknown',
    reason: 'AdvUpdateProcess waiting on osThreadFlagsWait for BLE advertiser update ack',
    pc: '0x0802159e',
    lr: '0x080207e6',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'osThreadFlagsWait(flags=1)',
    backtrace: [
      '#0 vPortExitCritical() @ port.c:435',
      '#1 xTaskNotifyWait() @ tasks.c:4752',
      '#2 osThreadFlagsWait() @ cmsis_os2.c:829',
      '#3 AdvUpdateProcess() @ app_ble_custom.c:1796',
      '#4 pxPortInitialiseStack() @ port.c:214'
    ]
  },
  {
    label: 'Thread 10 — HciUserEvtProcess',
    state: 'Blocked (notification wait)',
    priority: 'unknown',
    reason: 'HciUserEvtProcess sleeping in osThreadFlagsWait while BLE host events stalled',
    pc: '0x0802159e',
    lr: '0x080207e6',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'osThreadFlagsWait(flags=1)',
    backtrace: [
      '#0 vPortExitCritical() @ port.c:435',
      '#1 xTaskNotifyWait() @ tasks.c:4752',
      '#2 osThreadFlagsWait() @ cmsis_os2.c:829',
      '#3 HciUserEvtProcess() @ app_ble_custom.c:1815',
      '#4 pxPortInitialiseStack() @ port.c:214'
    ]
  },
  {
    label: 'Thread 9 — ShciUserEvtProcess',
    state: 'Blocked (notification wait)',
    priority: 'unknown',
    reason: 'ShciUserEvtProcess awaiting SHCI flag from CPU2 co-processor',
    pc: '0x0802159e',
    lr: '0x080207e6',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'osThreadFlagsWait(flags=1)',
    backtrace: [
      '#0 vPortExitCritical() @ port.c:435',
      '#1 xTaskNotifyWait() @ tasks.c:4752',
      '#2 osThreadFlagsWait() @ cmsis_os2.c:829',
      '#3 ShciUserEvtProcess() @ app_entry.c:581',
      '#4 pxPortInitialiseStack() @ port.c:214'
    ]
  },
  {
    label: 'Thread 8 — prvTimerTask',
    state: 'Ready (timer service)',
    priority: 'timer daemon',
    reason: 'FreeRTOS timer daemon draining deferred callbacks',
    pc: 'prvProcessTimerOrBlockTask (timers.c:641)',
    lr: '0x08020e1e',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'prvTimerTask()',
    backtrace: [
      '#0 prvProcessTimerOrBlockTask() @ timers.c:641',
      '#1 prvTimerTask() @ timers.c:576',
      '#2 pxPortInitialiseStack() @ port.c:214'
    ]
  },
  {
    label: 'Thread 7 — prvIdleTask',
    state: 'Idle (vApplicationIdleHook)',
    priority: 'idle',
    reason: 'Idle task running vApplicationIdleHook while other tasks blocked',
    pc: 'vApplicationIdleHook (main.c:1589)',
    lr: '0x08020100',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'prvIdleTask()',
    backtrace: [
      '#0 vApplicationIdleHook() @ main.c:1589',
      '#1 prvIdleTask() @ tasks.c:3452',
      '#2 pxPortInitialiseStack() @ port.c:214'
    ]
  },
  {
    label: 'Thread 6 — BLE_AppTask',
    state: 'Delayed (vTaskDelay)',
    priority: 'application',
    reason: 'BLE_AppTask sleeping between link management cycles',
    pc: '0x0801f6a8',
    lr: '0x0801da22',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'osDelay(10)',
    backtrace: [
      '#0 vTaskDelay() @ tasks.c:1373',
      '#1 osDelay() @ cmsis_os2.c:891',
      '#2 BLE_AppTask() @ main.c:2344',
      '#3 pxPortInitialiseStack() @ port.c:214'
    ]
  },
  {
    label: 'Thread 5 — SongPlay',
    state: 'Blocked (semaphore)',
    priority: 'application',
    reason: 'SongPlay waiting on SongActionControlBlock semaphore',
    pc: '0x0801ecf4',
    lr: '0x0801ddd6',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'osSemaphoreAcquire(SongActionControlBlock)',
    backtrace: [
      '#0 xQueueSemaphoreTake() @ queue.c:1573',
      '#1 osSemaphoreAcquire() @ cmsis_os2.c:1609',
      '#2 SongPlay() @ main.c:2230',
      '#3 pxPortInitialiseStack() @ port.c:214'
    ]
  },
  {
    label: 'Thread 4 — SendCommandsMain',
    state: 'Blocked (semaphore)',
    priority: 'application',
    reason: 'SendCommandsMain waiting on SendScriptControlBlock semaphore',
    pc: '0x0801ecf4',
    lr: '0x0801ddd6',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'osSemaphoreAcquire(SendScriptControlBlock)',
    backtrace: [
      '#0 xQueueSemaphoreTake() @ queue.c:1573',
      '#1 osSemaphoreAcquire() @ cmsis_os2.c:1609',
      '#2 SendCommandsMain() @ main.c:2164',
      '#3 pxPortInitialiseStack() @ port.c:214'
    ]
  },
  {
    label: 'Thread 3 — PulseDensityMain',
    state: 'Blocked (semaphore)',
    priority: 'application',
    reason: 'PulseDensityMain waiting on ProcessPulseDensityControlBlock semaphore',
    pc: '0x0801ecf4',
    lr: '0x0801ddd6',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'osSemaphoreAcquire(ProcessPulseDensityControlBlock)',
    backtrace: [
      '#0 xQueueSemaphoreTake() @ queue.c:1573',
      '#1 osSemaphoreAcquire() @ cmsis_os2.c:1609',
      '#2 PulseDensityMain() @ main.c:2134',
      '#3 pxPortInitialiseStack() @ port.c:214'
    ]
  },
  {
    label: 'Thread 2 — HeartbeatTaskMain',
    state: 'Delayed (vTaskDelay)',
    priority: 'application',
    reason: 'HeartbeatTaskMain pacing heartbeat update via vTaskDelay',
    pc: '0x0801f6a8',
    lr: '0x0801da22',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'osDelay(10)',
    backtrace: [
      '#0 vTaskDelay() @ tasks.c:1373',
      '#1 osDelay() @ cmsis_os2.c:891',
      '#2 HeartbeatTaskMain() @ main.c:2016',
      '#3 pxPortInitialiseStack() @ port.c:214'
    ]
  },
  {
    label: 'Thread 1 — CMD_Coredump',
    state: 'Faulted (ADV_UPDATE_PROCESS)',
    priority: 'ISR/command',
    reason: 'CMD_Coredump running under ADV_UPDATE_PROCESS when watchdog tripped',
    pc: '0x08007e0a',
    lr: '0x00000000',
    sp: 'n/a',
    registers: {},
    stack: {},
    lastSyscall: 'CMD_Coredump()',
    backtrace: [
      '#0 CMD_Coredump() @ COMMAND.c:1772',
      '#1 ?? (corrupt stack)'
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
    gdbCoreDumpZip: buildRemoteAttachment('Artifacts/gdb_coredump.zip'),
    coredumpBinary: buildRemoteAttachment('Artifacts/coredump/gdb_coredump.bin')
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
