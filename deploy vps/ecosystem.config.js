/**
 * ==============================================================================
 * TANDUR - PM2 ECOSYSTEM CONFIGURATION
 * Lokasi di server: /var/www/tandur/frontend/ecosystem.config.js
 * Cara menjalankan:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 * ==============================================================================
 */

module.exports = {
  apps: [
    {
      name: "tandur-frontend",
      cwd: "/var/www/tandur/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
      instances: "max", // Menjalankan cluster mode sesuai jumlah core CPU (atau set angka, cth: 2)
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "1G", // Otomatis restart jika memori bocor melebihi 1GB
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "127.0.0.1",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/pm2/tandur-frontend-error.log",
      out_file: "/var/log/pm2/tandur-frontend-out.log",
      merge_logs: true,
      autorestart: true,
      exp_backoff_restart_delay: 100,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
