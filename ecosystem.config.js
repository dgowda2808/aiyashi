/**
 * PM2 ecosystem — production process manager config
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name:         'datemap',
      script:       'server/index.js',
      instances:    1,               // single instance is fine for 200-300 users
      exec_mode:    'fork',
      watch:        false,
      max_memory_restart: '512M',

      env_production: {
        NODE_ENV: 'production',
        PORT:     3000,
      },

      // Log rotation
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file:  './logs/error.log',
      out_file:    './logs/out.log',
      merge_logs:  true,

      // Restart policy
      restart_delay:   5000,
      max_restarts:    10,
      min_uptime:      '10s',
    },
  ],
};
