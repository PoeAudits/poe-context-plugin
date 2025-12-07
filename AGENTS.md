Directory Structure
myplugin/
├── index.ts                    # Main plugin entry point
├── package.json                # NPM package configuration
├── tsconfig.json               # TypeScript configuration
└── lib/
    ├── config.ts               # Plugin configuration types
    ├── hooks.ts                # OpenCode event/chat.params handlers
    ├── logger.ts               # Simple file logger
    ├── state.ts                # Plugin state management
    └── ui/
        ├── display-utils.ts            # 
        ├── notification.ts            # 
    └── fetch-wrapper/
        ├── index.ts            # Fetch interception with interceptor callback
        ├── types.ts            # Type definitions
        └── formats/
            ├── index.ts        # Format exports
            ├── openai-chat.ts  # OpenAI Chat Completions format
            ├── openai-responses.ts # OpenAI Responses API format
            ├── gemini.ts       # Google Gemini format
            └── bedrock.ts      # AWS Bedrock format
Key Features
1. Request Interception: The installFetchWrapper() function wraps globalThis.fetch to intercept all API requests. You provide a RequestInterceptor callback that receives:
   - Parsed request body
   - Detected API format
   - Data array (messages/contents)
   - Extracted tool outputs
   - Request URL
   - Handler context
2. Multi-Format Support: Handles 5 API formats:
   - OpenAI Chat Completions
   - OpenAI Responses API
   - Anthropic (via compatible format)
   - Google Gemini
   - AWS Bedrock Converse
3. Utility Functions:
   - replaceToolOutput() - Replace a tool's output content
   - injectIntoLastUserMessage() - Inject content into the last user message
   - appendUserMessage() - Add a new user message
4. Hooks:
   - event handler for session idle events
   - chat.params handler for tracking sessions and model info
Usage
Edit myplugin/index.ts and implement your logic in the myRequestInterceptor function:
const myRequestInterceptor: RequestInterceptor = async (
    body, format, dataArray, toolOutputs, url, ctx
) => {
    // Your custom logic here
    // Return { body, modified: true } to modify the request
    return { body, modified: false }
}
Getting Started
cd myplugin
npm install
npm run build
npm run dev  # For development with opencode
