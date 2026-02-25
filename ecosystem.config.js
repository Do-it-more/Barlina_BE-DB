/**
 * PM2 Ecosystem Configuration
 * Run with: pm2 start ecosystem.config.js
 * 
 * Features:
 * - Cluster mode: Uses ALL CPU cores
 * - Auto-restart on crashes
 * - Memory limit restart (prevents OOM)
 * - Zero-downtime reload
 * - Log management
 * - Environment-specific configs
 */

module.exports = {
    apps: [
        {
            name: 'shopvibe-api',
            script: 'server.js',

            // ==================== CLUSTER MODE ====================
            instances: 'max',           // Use all available CPUs
            exec_mode: 'cluster',       // Enable cluster mode

            // ==================== MEMORY & RESTART ====================
            max_memory_restart: '500M', // Restart worker if >500MB RAM
            autorestart: true,          // Auto restart on crash
            max_restarts: 10,           // Max restarts before stopping
            min_uptime: '10s',          // Min uptime to consider started
            restart_delay: 4000,        // 4s delay between restarts

            // ==================== GRACEFUL SHUTDOWN ====================
            kill_timeout: 5000,         // 5s for graceful shutdown
            listen_timeout: 10000,      // Wait 10s for app to be ready
            shutdown_with_message: true, // Send shutdown message

            // ==================== LOGGING ====================
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            error_file: './logs/error.log',
            out_file: './logs/output.log',
            merge_logs: true,           // Merge cluster logs into single file
            log_type: 'json',

            // ==================== MONITORING ====================
            monitoring: false,

            // ==================== ENVIRONMENT ====================
            env: {
                NODE_ENV: 'development',
                PORT: 5001,
            },
            env_staging: {
                NODE_ENV: 'staging',
                PORT: 5001,
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 5001,
            },

            // ==================== ZERO-DOWNTIME FEATURES ====================
            wait_ready: true,           // Wait for process.send('ready')

            // Source map support for better error traces
            node_args: '--max-old-space-size=512',
        }
    ],

    // ==================== DEPLOYMENT (Optional) ====================
    deploy: {
        production: {
            user: 'deploy',
            host: ['your-server-ip'],
            ref: 'origin/main',
            repo: 'git@github.com:your-repo.git',
            path: '/var/www/shopvibe',
            'pre-deploy': 'git fetch --all',
            'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
            env: {
                NODE_ENV: 'production',
            },
        },
    },
};
