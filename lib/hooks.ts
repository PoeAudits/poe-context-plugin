/**
 * OpenCode plugin hooks for session and chat parameter handling.
 */

import type { PluginState } from "./state"
import type { Logger } from "./logger"

/**
 * Checks if a session is a subagent session (spawned by Task tool).
 */
export async function isSubagentSession(client: any, sessionID: string): Promise<boolean> {
    try {
        const result = await client.session.get({ path: { id: sessionID } })
        return !!result.data?.parentID
    } catch (error: any) {
        return false
    }
}

/**
 * Creates an event handler for session events.
 * Override the onIdle callback to run custom logic when the session goes idle.
 */
export function createEventHandler(
    client: any,
    state: PluginState,
    logger: Logger,
    onIdle?: (sessionId: string) => Promise<void> | void
) {
    return async ({ event }: { event: any }) => {
        if (event.type === "session.status" && event.properties.status.type === "idle") {
            const sessionId = event.properties.sessionID
            
            // Skip subagent sessions
            if (await isSubagentSession(client, sessionId)) {
                logger.debug("hooks", "Skipping idle event for subagent session", {
                    sessionId: sessionId.substring(0, 8)
                })
                return
            }

            logger.info("hooks", "Session idle", { sessionId: sessionId.substring(0, 8) })

            if (onIdle) {
                try {
                    await onIdle(sessionId)
                } catch (err: any) {
                    logger.error("hooks", "Error in onIdle callback", { error: err.message })
                }
            }
        }
    }
}

/**
 * Creates the chat.params hook for session tracking and Google tool call mapping.
 * This hook is called before each chat completion request.
 */
export function createChatParamsHandler(
    client: any,
    state: PluginState,
    logger: Logger
) {
    return async (input: any, _output: any) => {
        const sessionId = input.sessionID
        let providerID = (input.provider as any)?.info?.id || input.provider?.id
        const modelID = input.model?.id

        if (!providerID && input.message?.model?.providerID) {
            providerID = input.message.model.providerID
        }

        // Detect session change
        if (state.lastSeenSessionId && state.lastSeenSessionId !== sessionId) {
            logger.info("chat.params", "Session changed", {
                from: state.lastSeenSessionId.substring(0, 8),
                to: sessionId.substring(0, 8)
            })
            // Clear Gemini mappings on session change
            state.googleToolCallMapping.clear()
        }

        state.lastSeenSessionId = sessionId

        // Check if this is a subagent session
        if (!state.checkedSessions.has(sessionId)) {
            state.checkedSessions.add(sessionId)
            const isSubagent = await isSubagentSession(client, sessionId)
            if (isSubagent) {
                state.subagentSessions.add(sessionId)
                logger.debug("chat.params", "Detected subagent session", {
                    sessionId: sessionId.substring(0, 8)
                })
            }
        }

        // Cache model info for the session
        if (providerID && modelID) {
            state.model.set(sessionId, {
                providerID: providerID,
                modelID: modelID
            })
            logger.debug("chat.params", "Cached model info", {
                sessionId: sessionId.substring(0, 8),
                provider: providerID,
                model: modelID
            })
        }

        // Build position-based mapping for Gemini (which loses tool call IDs in native format)
        if (providerID === 'google' || providerID === 'google-vertex') {
            try {
                const messagesResponse = await client.session.messages({
                    path: { id: sessionId },
                    query: { limit: 100 }
                })
                const messages = messagesResponse.data || messagesResponse

                if (Array.isArray(messages)) {
                    const toolCallsByName = new Map<string, string[]>()

                    for (const msg of messages) {
                        if (msg.parts) {
                            for (const part of msg.parts) {
                                if (part.type === 'tool' && part.callID && part.tool) {
                                    const toolName = part.tool.toLowerCase()
                                    const callId = part.callID.toLowerCase()

                                    if (!toolCallsByName.has(toolName)) {
                                        toolCallsByName.set(toolName, [])
                                    }
                                    toolCallsByName.get(toolName)!.push(callId)
                                }
                            }
                        }
                    }

                    const positionMapping = new Map<string, string>()
                    for (const [toolName, callIds] of toolCallsByName) {
                        callIds.forEach((callId, index) => {
                            positionMapping.set(`${toolName}:${index}`, callId)
                        })
                    }

                    state.googleToolCallMapping.set(sessionId, positionMapping)
                    logger.debug("chat.params", "Built Google tool call mapping", {
                        sessionId: sessionId.substring(0, 8),
                        toolCount: positionMapping.size
                    })
                }
            } catch (error: any) {
                logger.error("chat.params", "Failed to build Google tool call mapping", {
                    error: error.message
                })
            }
        }
    }
}
