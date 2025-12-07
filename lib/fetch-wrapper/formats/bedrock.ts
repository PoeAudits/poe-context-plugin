/**
 * AWS Bedrock Converse API format handler.
 * Handles body.system + body.messages with toolResult blocks.
 * 
 * Bedrock uses top-level `system` array + `inferenceConfig` (distinguishes from OpenAI/Anthropic).
 * Tool calls: `toolUse` blocks in assistant content with `toolUseId`
 * Tool results: `toolResult` blocks in user content with `toolUseId`
 */

import type { FormatDescriptor, ToolOutput } from "../types"
import type { PluginState } from "../../state"

export const bedrockFormat: FormatDescriptor = {
    name: 'bedrock',

    detect(body: any): boolean {
        return (
            Array.isArray(body.system) &&
            body.inferenceConfig !== undefined &&
            Array.isArray(body.messages)
        )
    },

    getDataArray(body: any): any[] | undefined {
        return body.messages
    },

    extractToolOutputs(data: any[], _state: PluginState): ToolOutput[] {
        const outputs: ToolOutput[] = []

        for (const m of data) {
            if (m.role === 'user' && Array.isArray(m.content)) {
                for (const block of m.content) {
                    if (block.toolResult && block.toolResult.toolUseId) {
                        const toolUseId = block.toolResult.toolUseId.toLowerCase()
                        const content = block.toolResult.content
                        outputs.push({
                            id: toolUseId,
                            toolName: undefined,
                            content: Array.isArray(content) 
                                ? content.map((c: any) => c.text || JSON.stringify(c)).join('\n')
                                : JSON.stringify(content)
                        })
                    }
                }
            }
        }

        return outputs
    },

    hasToolOutputs(data: any[]): boolean {
        for (const m of data) {
            if (m.role === 'user' && Array.isArray(m.content)) {
                for (const block of m.content) {
                    if (block.toolResult) return true
                }
            }
        }
        return false
    },

    getLogMetadata(data: any[], inputUrl: string): Record<string, any> {
        return {
            url: inputUrl,
            totalMessages: data.length,
            format: 'bedrock'
        }
    }
}
