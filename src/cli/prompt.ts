import { createInterface } from 'readline'

const rl = () =>
    createInterface({ input: process.stdin, output: process.stdout })

export async function ask(
    question: string,
    defaultValue?: string,
): Promise<string> {
    const suffix = defaultValue ? ` [${defaultValue}]` : ''
    const iface = rl()
    return new Promise<string>((resolve) => {
        iface.question(`${question}${suffix} `, (answer) => {
            iface.close()
            resolve(answer.trim() || defaultValue || '')
        })
    })
}

export async function confirm(
    question: string,
    defaultValue = true,
): Promise<boolean> {
    const hint = defaultValue ? 'Y/n' : 'y/N'
    const answer = await ask(`${question} (${hint})`)
    if (!answer) return defaultValue
    return answer.toLowerCase().startsWith('y')
}

export async function select(
    question: string,
    options: string[],
    defaults: string[] = [],
): Promise<string[]> {
    console.log(question)
    for (let i = 0; i < options.length; i++) {
        const marker = defaults.includes(options[i]) ? '*' : ' '
        console.log(`  [${marker}] ${i + 1}. ${options[i]}`)
    }
    const answer = await ask(
        'Enter numbers (comma-separated) or Enter for defaults',
    )
    if (!answer) return defaults
    const indices = answer
        .split(',')
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((i) => i >= 0 && i < options.length)
    return indices.length > 0 ? indices.map((i) => options[i]) : defaults
}
