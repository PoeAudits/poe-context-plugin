/**
 * Plugin state management - tracks session information and model details.
 * Simplified from DCP to only include essential state for request interception.
 */

export interface ModelInfo {
    providerID: string
    modelID: string
}

export interface PluginState {
    /** Maps session ID to model info */
    model: Map<string, ModelInfo>
    /** Maps session ID to tool call position mappings for Google/Gemini */
    googleToolCallMapping: Map<string, Map<string, string>>
    /** Sessions that have been checked for subagent status */
    checkedSessions: Set<string>
    /** Sessions identified as subagent sessions */
    subagentSessions: Set<string>
    /** Last seen session ID */
    lastSeenSessionId: string | null
}

export function createPluginState(): PluginState {
    return {
        model: new Map(),
        googleToolCallMapping: new Map(),
        checkedSessions: new Set(),
        subagentSessions: new Set(),
        lastSeenSessionId: null,
    }
}
