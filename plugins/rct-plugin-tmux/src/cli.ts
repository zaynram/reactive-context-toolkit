const command = process.argv[2]

if (command === 'setup') {
    const { runSetup } = await import('./setup')
    await runSetup()
} else if (command === 'serve') {
    const { startServer } = await import('./mcp/server')
    await startServer()
} else {
    console.error(`Usage: rct-tmux <setup|serve>`)
    process.exit(1)
}

export {}
