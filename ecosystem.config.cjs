module.exports = {
    apps: [
        {
            name: 'simple-feed',
            script: 'tsx src/index.ts',
            args: '',
            watch: false,
            min_uptime: 120000,
            max_restarts: 50,
            restart_delay: 4000
        },
    ]
}