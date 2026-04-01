import issueScope from './issueScope'
import trackWork from './trackWork'
import tmux from '../../rct-plugin-tmux/src/index'
export default Object.fromEntries(
    [issueScope, trackWork, tmux].map((cfg) => [cfg.name, cfg] as const),
)
