/**
 * OpenAI Chat Completions API format handler.
 * Handles body.messages with role='tool' for tool results.
 */

import type { FormatDescriptor, ToolOutput } from "../types"
import type { PluginState } from "../../state"

export const openaiChatFormat: FormatDescriptor = {
    name: 'openai-chat',

    detect(body: any): boolean {
        return body.messages && Array.isArray(body.messages)
    },

    getDataArray(body: any): any[] | undefined {
        return body.messages
    },

    extractToolOutputs(data: any[], _state: PluginState): ToolOutput[] {
        const outputs: ToolOutput[] = []

        for (const m of data) {
            // OpenAI native format: role='tool' with tool_call_id
            if (m.role === 'tool' && m.tool_call_id) {
                outputs.push({
                    id: m.tool_call_id.toLowerCase(),
                    toolName: m.name,
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                })
            }

            // Anthropic format: role='user' with tool_result parts
            if (m.role === 'user' && Array.isArray(m.content)) {
                for (const part of m.content) {
                    if (part.type === 'tool_result' && part.tool_use_id) {
                        outputs.push({
                            id: part.tool_use_id.toLowerCase(),
                            toolName: undefined,
                            content: typeof part.content === 'string' ? part.content : JSON.stringify(part.content)
                        })
                    }
                }
            }
        }

        return outputs
    },

    hasToolOutputs(data: any[]): boolean {
        for (const m of data) {
            if (m.role === 'tool') return true
            if (m.role === 'user' && Array.isArray(m.content)) {
                for (const part of m.content) {
                    if (part.type === 'tool_result') return true
                }
            }
        }
        return false
    },

    getLogMetadata(data: any[], inputUrl: string): Record<string, any> {
        return {
            url: inputUrl,
            totalMessages: data.length,
            format: 'openai-chat'
        }
    }
}
