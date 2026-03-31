import { RCTConfig } from "#config/types"

export interface RCTPlugin extends Pick<RCTConfig, "rules" | "files"> {
    name: string
}
