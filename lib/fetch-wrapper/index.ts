/**
 * Fetch wrapper that intercepts API requests to model providers.
 * This allows you to inspect, modify, or analyze requests before they are sent.
 * 
 * Supports 5 API formats:
 * 1. OpenAI Chat Completions (body.messages with role='tool')
 * 2. Anthropic (body.messages with role='user' containing tool_result)
 * 3. Google/Gemini (body.contents with functionResponse parts)
 * 4. OpenAI Responses API (body.input with function_call_output items)
 * 5. AWS Bedrock Converse API (body.system + body.messages with toolResult blocks)
 */

import type { PluginState } from "../state"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"
import type { FetchHandlerContext, FetchHandlerResult, FormatDescriptor, ToolOutput } from "./types"
import { openaiChatFormat, openaiResponsesFormat, geminiFormat, bedrockFormat } from "./formats"

export type { FetchHandlerContext, FetchHandlerResult, FormatDescriptor, ToolOutput } from "./types"

/**
 * Callback type for request interception.
 * Return the modified body to change the request, or the same body to pass through unchanged.
 */
export type RequestInterceptor = (
    body: any,
    format: FormatDescriptor,
    dataArray: any[],
    toolOutputs: ToolOutput[],
    url: string,
    ctx: FetchHandlerContext
) => Promise<{ body: any; modified: boolean }> | { body: any; modified: boolean }

/**
 * Creates and installs a wrapped global fetch that intercepts API calls.
 * 
 * @param state - Plugin state
 * @param logger - Logger instance
 * @param client - OpenCode client
 * @param config - Plugin configuration
 * @param interceptor - Your custom function to handle intercepted requests
 * @returns Cleanup function to restore original fetch
 */
export function installFetchWrapper(
    state: PluginState,
    logger: Logger,
    client: any,
    config: PluginConfig,
    interceptor: RequestInterceptor
): () => void {
    const originalGlobalFetch = globalThis.fetch

    const ctx: FetchHandlerContext = {
        state,
        logger,
        client,
        config,
    }

    globalThis.fetch = async (input: any, init?: any) => {
        // Skip processing for subagent sessions
        if (state.lastSeenSessionId && state.subagentSessions.has(state.lastSeenSessionId)) {
            logger.debug("fetch-wrapper", "Skipping processing for subagent session", {
                sessionId: state.lastSeenSessionId.substring(0, 8)
            })
            return originalGlobalFetch(input, init)
        }

        if (init?.body && typeof init.body === 'string') {
            try {
                const body = JSON.parse(init.body)
                const inputUrl = typeof input === 'string' ? input : 'URL object'
                
                // Detect format and process
                const result = await processRequest(body, ctx, inputUrl, interceptor)
                
                if (result.modified) {
                    init.body = JSON.stringify(result.body)
                }
            } catch (e) {
                // Silently ignore parsing errors - pass through unchanged
                logger.debug("fetch-wrapper", "Failed to parse request body", { 
                    error: e instanceof Error ? e.message : 'Unknown error' 
                })
            }
        }

        return originalGlobalFetch(input, init)
    }

    // Return cleanup function
    return () => {
        globalThis.fetch = originalGlobalFetch
    }
}

/**
 * Detects the API format and extracts relevant data.
 */
function detectFormat(body: any): FormatDescriptor | null {
    // Order matters: bedrockFormat must be checked before openaiChatFormat
    // since both have messages[] but Bedrock has distinguishing system[] array
    if (openaiResponsesFormat.detect(body)) {
        return openaiResponsesFormat
    }
    if (bedrockFormat.detect(body)) {
        return bedrockFormat
    }
    if (openaiChatFormat.detect(body)) {
        return openaiChatFormat
    }
    if (geminiFormat.detect(body)) {
        return geminiFormat
    }
    return null
}

/**
 * Processes a request through format detection and the interceptor.
 */
async function processRequest(
    body: any,
    ctx: FetchHandlerContext,
    inputUrl: string,
    interceptor: RequestInterceptor
): Promise<FetchHandlerResult> {
    const format = detectFormat(body)
    
    if (!format) {
        ctx.logger.debug("fetch-wrapper", "Unknown request format, passing through", { url: inputUrl })
        return { modified: false, body }
    }

    const dataArray = format.getDataArray(body)
    if (!dataArray) {
        return { modified: false, body }
    }

    const toolOutputs = format.extractToolOutputs(dataArray, ctx.state)

    ctx.logger.debug("fetch-wrapper", `Intercepted ${format.name} request`, {
        url: inputUrl,
        messageCount: dataArray.length,
        toolOutputCount: toolOutputs.length
    })

    // Call the user's interceptor
    const result = await interceptor(body, format, dataArray, toolOutputs, inputUrl, ctx)

    if (result.modified) {
        ctx.logger.info("fetch-wrapper", `Request modified by interceptor (${format.name})`, {
            url: inputUrl
        })
    }

    return {
        modified: result.modified,
        body: result.body,
        format,
        toolOutputs,
        dataArray
    }
}

/**
 * Utility function to replace a tool output in the request body.
 * Useful for implementing context pruning or content modification.
 */
export function replaceToolOutput(
    body: any,
    format: FormatDescriptor,
    toolId: string,
    newContent: string,
    state: PluginState
): boolean {
    const dataArray = format.getDataArray(body)
    if (!dataArray) return false

    const toolIdLower = toolId.toLowerCase()
    let replaced = false

    // Handle each format's structure
    switch (format.name) {
        case 'openai-chat':
            for (let i = 0; i < dataArray.length; i++) {
                const m = dataArray[i]
                if (m.role === 'tool' && m.tool_call_id?.toLowerCase() === toolIdLower) {
                    dataArray[i] = { ...m, content: newContent }
                    replaced = true
                }
                if (m.role === 'user' && Array.isArray(m.content)) {
                    let modified = false
                    const newContentArray = m.content.map((part: any) => {
                        if (part.type === 'tool_result' && part.tool_use_id?.toLowerCase() === toolIdLower) {
                            modified = true
                            return { ...part, content: newContent }
                        }
                        return part
                    })
                    if (modified) {
                        dataArray[i] = { ...m, content: newContentArray }
                        replaced = true
                    }
                }
            }
            break

        case 'openai-responses':
            for (let i = 0; i < dataArray.length; i++) {
                const item = dataArray[i]
                if (item.type === 'function_call_output' && item.call_id?.toLowerCase() === toolIdLower) {
                    dataArray[i] = { ...item, output: newContent }
                    replaced = true
                }
            }
            break

        case 'gemini':
            // Gemini requires position-based replacement
            let positionMapping: Map<string, string> | undefined
            for (const [_sessionId, mapping] of state.googleToolCallMapping) {
                if (mapping && mapping.size > 0) {
                    positionMapping = mapping
                    break
                }
            }

            if (positionMapping) {
                const toolPositionCounters = new Map<string, number>()
                for (let i = 0; i < dataArray.length; i++) {
                    const content = dataArray[i]
                    if (!Array.isArray(content.parts)) continue

                    let contentModified = false
                    const newParts = content.parts.map((part: any) => {
                        if (part.functionResponse) {
                            const funcName = part.functionResponse.name?.toLowerCase()
                            if (funcName) {
                                const currentIndex = toolPositionCounters.get(funcName) || 0
                                toolPositionCounters.set(funcName, currentIndex + 1)

                                const positionKey = `${funcName}:${currentIndex}`
                                const mappedToolId = positionMapping!.get(positionKey)

                                if (mappedToolId?.toLowerCase() === toolIdLower) {
                                    contentModified = true
                                    replaced = true
                                    return {
                                        ...part,
                                        functionResponse: {
                                            ...part.functionResponse,
                                            response: {
                                                name: part.functionResponse.name,
                                                content: newContent
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        return part
                    })

                    if (contentModified) {
                        dataArray[i] = { ...content, parts: newParts }
                    }
                }
            }
            break

        case 'bedrock':
            for (let i = 0; i < dataArray.length; i++) {
                const m = dataArray[i]
                if (m.role === 'user' && Array.isArray(m.content)) {
                    let modified = false
                    const newContentArray = m.content.map((block: any) => {
                        if (block.toolResult && block.toolResult.toolUseId?.toLowerCase() === toolIdLower) {
                            modified = true
                            return {
                                ...block,
                                toolResult: {
                                    ...block.toolResult,
                                    content: [{ text: newContent }]
                                }
                            }
                        }
                        return block
                    })
                    if (modified) {
                        dataArray[i] = { ...m, content: newContentArray }
                        replaced = true
                    }
                }
            }
            break
    }

    return replaced
}

/**
 * Utility function to inject content into the last user message.
 * Useful for adding system prompts or instructions.
 */
export function injectIntoLastUserMessage(
    body: any,
    format: FormatDescriptor,
    content: string
): boolean {
    const dataArray = format.getDataArray(body)
    if (!dataArray) return false

    // Find the last user message and inject
    for (let i = dataArray.length - 1; i >= 0; i--) {
        const item = dataArray[i]

        switch (format.name) {
            case 'openai-chat':
                if (item.role === 'user') {
                    if (typeof item.content === 'string') {
                        item.content = item.content + '\n\n' + content
                    } else if (Array.isArray(item.content)) {
                        item.content.push({ type: 'text', text: content })
                    }
                    return true
                }
                break

            case 'openai-responses':
                if (item.type === 'message' && item.role === 'user') {
                    if (typeof item.content === 'string') {
                        item.content = item.content + '\n\n' + content
                    } else if (Array.isArray(item.content)) {
                        item.content.push({ type: 'input_text', text: content })
                    }
                    return true
                }
                break

            case 'gemini':
                if (item.role === 'user' && Array.isArray(item.parts)) {
                    item.parts.push({ text: content })
                    return true
                }
                break

            case 'bedrock':
                if (item.role === 'user') {
                    if (typeof item.content === 'string') {
                        item.content = item.content + '\n\n' + content
                    } else if (Array.isArray(item.content)) {
                        item.content.push({ type: 'text', text: content })
                    }
                    return true
                }
                break
        }
    }

    return false
}

/**
 * Utility function to add a new user message at the end.
 */
export function appendUserMessage(
    body: any,
    format: FormatDescriptor,
    content: string
): boolean {
    const dataArray = format.getDataArray(body)
    if (!dataArray) return false

    switch (format.name) {
        case 'openai-chat':
        case 'bedrock':
            dataArray.push({ role: 'user', content })
            return true

        case 'openai-responses':
            dataArray.push({ type: 'message', role: 'user', content })
            return true

        case 'gemini':
            dataArray.push({ role: 'user', parts: [{ text: content }] })
            return true
    }

    return false
}
