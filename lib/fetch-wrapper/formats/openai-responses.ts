/**
 * OpenAI Responses API format handler.
 * Handles body.input with function_call_output items.
 */

import type { FormatDescriptor, ToolOutput } from "../types"
import type { PluginState } from "../../state"

export const openaiResponsesFormat: FormatDescriptor = {
    name: 'openai-responses',

    detect(body: any): boolean {
        return body.input && Array.isArray(body.input)
    },

    getDataArray(body: any): any[] | undefined {
        return body.input
    },

    extractToolOutputs(data: any[], _state: PluginState): ToolOutput[] {
        const outputs: ToolOutput[] = []

        for (const item of data) {
            if (item.type === 'function_call_output' && item.call_id) {
                outputs.push({
                    id: item.call_id.toLowerCase(),
                    toolName: item.name,
                    content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output)
                })
            }
        }

        return outputs
    },

    hasToolOutputs(data: any[]): boolean {
        return data.some((item: any) => item.type === 'function_call_output')
    },

    getLogMetadata(data: any[], inputUrl: string): Record<string, any> {
        return {
            url: inputUrl,
            totalItems: data.length,
            format: 'openai-responses-api'
        }
    }
}
