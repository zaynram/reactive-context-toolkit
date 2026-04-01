import issueScope from './issueScope'
import trackWork from './trackWork'
export default Object.fromEntries(
    [issueScope, trackWork].map((cfg) => [cfg.name, cfg] as const),
)
