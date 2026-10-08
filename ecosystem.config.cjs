// pm2: keeps `npm run dev` running in the background on a Windows dev machine (pm2 cannot start npm.cmd itself).
// pm2 start ecosystem.config.cjs · pm2 logs keyofsuccess-dev · pm2 stop keyofsuccess-dev
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'keyofsuccess-dev',
      cwd: __dirname,
      script: path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      args: 'run dev',
      autorestart: false,
    },
  ],
};
