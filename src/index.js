require('dotenv').config();
const Bugsnag = require('@bugsnag/node');

const apiKey = process.env.BUGSNAG_API_KEY;

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
  return new Promise(resolve => {
    Bugsnag.notify(
      error,
      event => {
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

async function main() {
  sendBugsnagSmokeTest();
  console.log('Simulating STM32WB55 intrusion sensor crash...');
  await simulateGarageCrash();
}

main().catch(async error => {
  console.error('Crash captured locally. Uploading to Bugsnag...');
  await sendCrashToBugsnag(error, 'garage.intrusion.sensor');
  process.exit(1);
});
