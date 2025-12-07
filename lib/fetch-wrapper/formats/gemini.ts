/**
 * Google/Gemini API format handler.
 * Handles body.contents with functionResponse parts.
 * 
 * Note: Gemini doesn't include tool call IDs in its native format.
 * Position-based correlation is used via state.googleToolCallMapping.
 */

import type { FormatDescriptor, ToolOutput } from "../types"
import type { PluginState } from "../../state"

export const geminiFormat: FormatDescriptor = {
    name: 'gemini',

    detect(body: any): boolean {
        return body.contents && Array.isArray(body.contents)
    },

    getDataArray(body: any): any[] | undefined {
        return body.contents
    },

    extractToolOutputs(data: any[], state: PluginState): ToolOutput[] {
        const outputs: ToolOutput[] = []

        // Get position mapping from state (built by hooks.ts)
        let positionMapping: Map<string, string> | undefined
        for (const [_sessionId, mapping] of state.googleToolCallMapping) {
            if (mapping && mapping.size > 0) {
                positionMapping = mapping
                break
            }
        }

        if (!positionMapping) {
            // Fall back to extracting without IDs
            for (const content of data) {
                if (!Array.isArray(content.parts)) continue

                for (const part of content.parts) {
                    if (part.functionResponse) {
                        const funcName = part.functionResponse.name?.toLowerCase()
                        const response = part.functionResponse.response
                        outputs.push({
                            id: `gemini-${funcName}-${outputs.length}`,
                            toolName: funcName,
                            content: response?.content || JSON.stringify(response)
                        })
                    }
                }
            }
            return outputs
        }

        // Use position-based correlation
        const toolPositionCounters = new Map<string, number>()

        for (const content of data) {
            if (!Array.isArray(content.parts)) continue

            for (const part of content.parts) {
                if (part.functionResponse) {
                    const funcName = part.functionResponse.name?.toLowerCase()
                    if (funcName) {
                        const currentIndex = toolPositionCounters.get(funcName) || 0
                        toolPositionCounters.set(funcName, currentIndex + 1)

                        const positionKey = `${funcName}:${currentIndex}`
                        const toolCallId = positionMapping.get(positionKey)

                        const response = part.functionResponse.response
                        outputs.push({
                            id: toolCallId?.toLowerCase() || `gemini-${funcName}-${currentIndex}`,
                            toolName: funcName,
                            content: response?.content || JSON.stringify(response)
                        })
                    }
                }
            }
        }

        return outputs
    },

    hasToolOutputs(data: any[]): boolean {
        return data.some((content: any) =>
            Array.isArray(content.parts) &&
            content.parts.some((part: any) => part.functionResponse)
        )
    },

    getLogMetadata(data: any[], inputUrl: string): Record<string, any> {
        return {
            url: inputUrl,
            totalContents: data.length,
            format: 'google-gemini'
        }
    }
}
