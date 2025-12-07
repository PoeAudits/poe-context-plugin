/**
 * Plugin configuration types and defaults.
 */

export interface PluginConfig {
    /** Enable or disable the plugin */
    enabled: boolean
    /** Enable debug logging */
    debug: boolean
}

export const defaultConfig: PluginConfig = {
    enabled: true,
    debug: false,
}
