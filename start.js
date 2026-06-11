const { spawn } = require('child_process');
const path = require('path');

const services = [
  { name: 'Auth',      cwd: 'services/auth'      },
  { name: 'Tez',       cwd: 'services/tez'       },
  { name: 'Kullanici', cwd: 'services/kullanici' },
  { name: 'Bildirim',  cwd: 'services/bildirim'  },
  { name: 'Gateway',   cwd: 'gateway'             },
];

console.log('Starting YBS Tez Portal services...\n');

services.forEach(({ name, cwd }) => {
  // process.execPath = çalışan node binary'sinin tam yolu. shell:true kullanmadan
  // doğrudan çağırmak DEP0190 uyarısını önler ve platformlar arası daha güvenlidir.
  const proc = spawn(process.execPath, ['index.js'], {
    cwd: path.join(__dirname, cwd),
    stdio: 'inherit',
  });

  proc.on('error', (err) => {
    console.error(`[${name}] Failed to start:`, err.message);
  });

  proc.on('exit', (code) => {
    if (code !== 0) console.log(`[${name}] exited with code ${code}`);
  });

  console.log(`[${name}] started (${cwd})`);
});
