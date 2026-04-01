import issueScope from './issueScope'
import trackWork from './trackWork'
import tmux from './tmux'
export default Object.fromEntries(
    [issueScope, trackWork, tmux].map((cfg) => [cfg.name, cfg] as const),
)
