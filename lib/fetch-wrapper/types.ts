/**
 * Type definitions for the fetch wrapper and format handlers.
 */

import type { PluginState } from "../state"
import type { Logger } from "../logger"
import type { PluginConfig } from "../config"

/**
 * Represents a tool output found in the request body.
 */
export interface ToolOutput {
    /** The tool call ID */
    id: string
    /** The tool name (if available) */
    toolName?: string
    /** The tool output content */
    content?: string
}

/**
 * Descriptor for handling different API formats.
 * Each format (OpenAI, Anthropic, Gemini, Bedrock) has its own handler.
 */
export interface FormatDescriptor {
    /** Human-readable format name */
    name: string
    /** Detects if a request body matches this format */
    detect(body: any): boolean
    /** Gets the main data array (messages/contents/input) from the body */
    getDataArray(body: any): any[] | undefined
    /** Extracts all tool outputs from the data array */
    extractToolOutputs(data: any[], state: PluginState): ToolOutput[]
    /** Checks if the data contains any tool outputs */
    hasToolOutputs(data: any[]): boolean
    /** Gets metadata for logging */
    getLogMetadata(data: any[], inputUrl: string): Record<string, any>
}

/**
 * Context passed to fetch handlers.
 */
export interface FetchHandlerContext {
    state: PluginState
    logger: Logger
    client: any
    config: PluginConfig
}

/**
 * Result from processing a request.
 */
export interface FetchHandlerResult {
    /** Whether the request body was modified */
    modified: boolean
    /** The (possibly modified) request body */
    body: any
    /** Detected API format */
    format?: FormatDescriptor
    /** Extracted tool outputs */
    toolOutputs?: ToolOutput[]
    /** The data array from the body */
    dataArray?: any[]
}
