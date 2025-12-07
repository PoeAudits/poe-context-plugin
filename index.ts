/**
 * OpenCode Plugin Template - Request Interception Base
 * 
 * This plugin provides the infrastructure to intercept and modify API requests
 * before they are sent to model providers. It extracts the core functionality
 * from the DCP (Dynamic Context Pruning) plugin without the pruning logic.
 * 
 * Usage:
 * 1. Implement your custom logic in the `myRequestInterceptor` function
 * 2. The interceptor receives the parsed request body, detected format, and tool outputs
 * 3. Return { body, modified: true } to modify the request, or { body, modified: false } to pass through
 * 
 * Supported API formats:
 * - OpenAI Chat Completions
 * - OpenAI Responses API
 * - Anthropic (via OpenAI-compatible format)
 * - Google Gemini
 * - AWS Bedrock Converse
 */

import type { Plugin } from "@opencode-ai/plugin"
import { Logger } from "./lib/logger"
import { createPluginState } from "./lib/state"
import { 
    installFetchWrapper, 
    replaceToolOutput, 
    injectIntoLastUserMessage,
    appendUserMessage,
    type RequestInterceptor,
    type FormatDescriptor,
    type ToolOutput,
    type FetchHandlerContext
} from "./lib/fetch-wrapper"
import { createEventHandler, createChatParamsHandler } from "./lib/hooks"
import { defaultConfig, type PluginConfig } from "./lib/config"

// Re-export types for consumers
export type { PluginConfig } from "./lib/config"
export type { PluginState, ModelInfo } from "./lib/state"
export type { 
    RequestInterceptor, 
    FormatDescriptor, 
    ToolOutput, 
    FetchHandlerContext,
    FetchHandlerResult 
} from "./lib/fetch-wrapper"
export { replaceToolOutput, injectIntoLastUserMessage, appendUserMessage } from "./lib/fetch-wrapper"

/**
 * Example request interceptor - customize this for your use case!
 * 
 * This function is called for every API request to a model provider.
 * You can inspect, modify, or log the request contents.
 */
const myRequestInterceptor: RequestInterceptor = async (
    body: any,
    format: FormatDescriptor,
    dataArray: any[],
    toolOutputs: ToolOutput[],
    url: string,
    ctx: FetchHandlerContext
) => {
    // Example: Log request information
    ctx.logger.info("interceptor", `Request to ${format.name}`, {
        url: url,
        messageCount: dataArray.length,
        toolOutputCount: toolOutputs.length
    })

    // Example: Log tool outputs
    if (toolOutputs.length > 0) {
        ctx.logger.debug("interceptor", "Tool outputs in request", {
            tools: toolOutputs.map(t => ({ id: t.id.substring(0, 8), name: t.toolName }))
        })
    }

    // ============================================
    // ADD YOUR CUSTOM LOGIC HERE
    // ============================================
    // 
    // Available utilities:
    // - replaceToolOutput(body, format, toolId, newContent, ctx.state) - Replace a tool's output
    // - injectIntoLastUserMessage(body, format, content) - Add content to last user message
    // - appendUserMessage(body, format, content) - Add a new user message
    //
    // Example: Replace a specific tool output
    // if (toolOutputs.some(t => t.toolName === 'read')) {
    //     replaceToolOutput(body, format, toolOutputs[0].id, '[Content summarized]', ctx.state)
    //     return { body, modified: true }
    // }
    //
    // Example: Inject instructions
    // injectIntoLastUserMessage(body, format, 'Please be concise in your response.')
    // return { body, modified: true }
    //
    // ============================================

    // Default: pass through unchanged
    return { body, modified: false }
}

const plugin: Plugin = (async (ctx: any) => {
    const config: PluginConfig = {
        ...defaultConfig,
        // Override with your configuration
        enabled: true,
        debug: true, // Set to false in production
    }

    if (!config.enabled) {
        return {}
    }

    // Initialize components
    const logger = new Logger(config.debug, "myplugin")
    const state = createPluginState()

    // Install the fetch wrapper with your interceptor
    const cleanup = installFetchWrapper(state, logger, ctx.client, config, myRequestInterceptor)

    logger.info("plugin", "Plugin initialized", {
        debug: config.debug
    })

    return {
        // Handle session events (e.g., when session goes idle)
        event: createEventHandler(ctx.client, state, logger, async (sessionId) => {
            // Called when the session goes idle
            logger.info("plugin", "Session went idle", { sessionId: sessionId.substring(0, 8) })
            
            // Add your idle handling logic here
        }),

        // Handle chat parameters (called before each request)
        "chat.params": createChatParamsHandler(ctx.client, state, logger),

        // Optional: Add custom tools
        // tool: {
        //     myTool: {
        //         description: "My custom tool",
        //         parameters: z.object({ ... }),
        //         execute: async (args) => { ... }
        //     }
        // }
    }
}) satisfies Plugin

export default plugin
