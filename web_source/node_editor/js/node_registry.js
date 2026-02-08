const nodeRegistry = [
    {
        type: 'start',
        name: 'Start',
        description: 'The entry point of the function. Execution begins here.',
        tags: ['Function', 'input', 'start'],
        inputs: [], // Dynamic
        outputs: [{ label: 'exec_out', type: 'exec' }] // Defaults
    },

    {
        type: 'function_return',
        name: 'Return',
        description: 'Terminals the function execution and returns the specified values to the caller.',
        tags: ['Function', 'output', 'end'],
        inputs: [{ label: 'exec_in', type: 'exec' }], // Defaults
        outputs: [] // Dynamic
    },
    {
        type: 'function_call',
        name: 'Function Call',
        description: 'Executes another function and waits for its result.',
        tags: ['Function', 'call'],
        inputs: [{ label: 'exec_in', type: 'exec' }], // Dynamic
        outputs: [{ label: 'exec_out', type: 'exec' }] // Dynamic
    },
    {
        type: 'condition',
        name: 'Branch',
        description: 'Branches execution based on whether a boolean condition is true or false.',
        tags: ['Flow', 'logic', 'if', 'condition'],
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Condition', type: 'boolean', key: 'condition' }
        ],
        outputs: [
            { label: 'exec_true', type: 'exec' },
            { label: 'exec_false', type: 'exec' }
        ],
        params: { condition: false }
    },
    {
        type: 'match',
        name: 'Match',
        description: 'Branches execution based on matching an input value against several constant cases.',
        tags: ['Flow', 'logic', 'switch', 'match', 'pattern'],
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Switch On', type: 'any_not_exec', key: 'value' }
        ],
        outputs: [
            { label: 'Default', type: 'exec', key: 'exec_default' }
        ],
        params: {
            cases: [],
            value_type: 'string'
        }
    },
    {
        type: 'log_message',
        name: 'Log Message',
        description: 'Logs a text message to the output console for debugging.',
        tags: ['console', 'print', 'debug', 'log'],
        color: '#2196F3',
        resizable: true,
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Message', type: 'string', key: 'message' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }],
        params: { message: 'Hello World' }
    },
    {
        type: 'ai_eval',
        name: 'Single LLM Eval',
        description: 'Sends a prompt to an AI model and retrieves the generated response. Meant for single shot generation.',
        tags: ['AI', 'llm', 'gemini', 'eval'],
        color: '#E91E63',
        resizable: true,
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Provider', type: 'string', key: 'provider' },
            { label: 'Model', type: 'string', key: 'model' },
            { label: 'System Prompt', type: 'string', key: 'system_prompt' },
            { label: 'Prompt', type: 'string', key: 'prompt' },
            { label: 'Tools', type: 'list:tool', key: 'tools' }
        ],
        outputs: [
            { label: 'exec_out', type: 'exec' },
            { label: 'Response', type: 'string', key: 'response' },
            { label: 'Changed Files', type: 'list:string', key: 'changed_files' }
        ],
        params: {
            provider: 'gemini',
            model: 'gemini-3-flash-preview',
            system_prompt: 'You are a helpful coding assistant.',
            prompt: ''
        }
    },
    {
        type: 'create_tool',
        name: 'Create Tool',
        description: 'Defines a tool metadata object that can be passed to an AI model.',
        tags: ['AI', 'tool', 'function'],
        color: '#E91E63',
        inputs: [
            { label: 'Description', type: 'string', key: 'description' }
        ],
        outputs: [
            { label: 'Tool', type: 'tool' }
        ],
        params: {
            function_name: '',
            description: ''
        }
    },
    {
        type: 'set_variable',
        name: 'Set Local Variable',
        description: 'Stores a value into a named local variable.',
        tags: ['Data', 'local', 'set', 'store', 'memory'],
        color: '#9C27B0',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Value', type: 'any_not_exec', key: 'value' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }],
        params: { name: 'myVar', value: null }
    },
    {
        type: 'get_variable',
        name: 'Get Local Variable',
        description: 'Retrieves the current value of a named local variable.',
        tags: ['Data', 'local', 'get', 'read', 'memory'],
        color: '#9C27B0',
        inputs: [],
        outputs: [{ label: 'Value', type: 'any_not_exec' }],
        params: { name: 'myVar' }
    },
    {
        type: 'string',
        name: 'String Constant',
        description: 'A constant text value.',
        tags: ['String', 'variable', 'text'],
        resizable: true,
        outputs: [{ label: '', type: 'string' }],
        params: { value: 'Hello World' }
    },
    {
        type: 'string_format',
        name: 'String Format',
        description: 'Combines multiple values into a string using curly braces {} as placeholders.',
        tags: ['String', 'string', 'format', 'template'],
        resizable: true,
        inputs: [],
        outputs: [{ label: 'Result', type: 'string' }],
        params: { format: 'Value: {}' }
    },
    {
        type: 'number',
        name: 'Number Constant',
        description: 'A constant numeric (integer or float) value.',
        tags: ['Number', 'variable', 'float', 'int'],
        outputs: [{ label: '', type: 'number' }],
        params: { value: 42 }
    },
    {
        type: 'boolean',
        name: 'Boolean Constant',
        description: 'A constant true or false value.',
        tags: ['Boolean', 'variable', 'bool'],
        outputs: [{ label: '', type: 'boolean' }],
        params: { value: false }
    },
    {
        type: 'enum_constant',
        name: 'Enum Constant',
        description: 'A constant value from an enumeration.',
        tags: ['Enum', 'constant'],
        outputs: [{ label: '', type: 'number' }],
        params: { enum_id: '', value: 0 }
    },
    {
        type: 'math_add',
        name: 'Add',
        description: 'Calculates the sum of two numbers (A + B).',
        tags: ['Math', '+', 'operator', 'sum'],
        inputs: [
            { label: 'A', type: 'number', key: 'a' },
            { label: 'B', type: 'number', key: 'b' }
        ],
        outputs: [{ label: 'Result', type: 'number' }],
        params: { a: 0, b: 0 }
    },
    {
        type: 'math_sub',
        name: 'Subtract',
        description: 'Calculates the difference between two numbers (A - B).',
        tags: ['Math', '-', 'operator', 'diff'],
        inputs: [
            { label: 'A', type: 'number', key: 'a' },
            { label: 'B', type: 'number', key: 'b' }
        ],
        outputs: [{ label: 'Result', type: 'number' }],
        params: { a: 0, b: 0 }
    },
    {
        type: 'math_mul',
        name: 'Multiply',
        description: 'Calculates the product of two numbers (A * B).',
        tags: ['Math', '*', 'operator', 'product'],
        inputs: [
            { label: 'A', type: 'number', key: 'a' },
            { label: 'B', type: 'number', key: 'b' }
        ],
        outputs: [{ label: 'Result', type: 'number' }],
        params: { a: 0, b: 0 }
    },
    {
        type: 'math_div',
        name: 'Divide',
        description: 'Calculates the quotient of two numbers (A / B).',
        tags: ['Math', '/', 'operator', 'quotient'],
        inputs: [
            { label: 'A', type: 'number', key: 'a' },
            { label: 'B', type: 'number', key: 'b' }
        ],
        outputs: [{ label: 'Result', type: 'number' }],
        params: { a: 1, b: 1 }
    },
    {
        type: 'logic_and',
        name: 'And',
        description: 'Returns true only if both input boolean values are true.',
        tags: ['Logic', 'and', 'boolean'],
        inputs: [
            { label: 'A', type: 'boolean', key: 'a' },
            { label: 'B', type: 'boolean', key: 'b' }
        ],
        outputs: [{ label: 'Result', type: 'boolean' }],
        params: { a: false, b: false }
    },
    {
        type: 'logic_or',
        name: 'Or',
        description: 'Returns true if at least one of the input boolean values is true.',
        tags: ['Logic', 'or', 'boolean'],
        inputs: [
            { label: 'A', type: 'boolean', key: 'a' },
            { label: 'B', type: 'boolean', key: 'b' }
        ],
        outputs: [{ label: 'Result', type: 'boolean' }],
        params: { a: false, b: false }
    },
    {
        type: 'logic_not',
        name: 'Not',
        description: 'Inverts a boolean value (true becomes false, false becomes true).',
        tags: ['Logic', 'not', 'inverse'],
        inputs: [
            { label: 'A', type: 'boolean', key: 'a' }
        ],
        outputs: [{ label: 'Result', type: 'boolean' }],
        params: { a: false }
    },
    {
        type: 'compare_equal',
        name: 'Equal',
        description: 'Checks if two values are equal and returns a boolean result.',
        tags: ['Logic', 'compare', '=='],
        inputs: [
            { label: 'A', type: 'any_not_exec', key: 'a' },
            { label: 'B', type: 'any_not_exec', key: 'b' }
        ],
        outputs: [{ label: 'Result', type: 'boolean' }],
        params: { a: null, b: null }
    },
    {
        type: 'compare_greater',
        name: 'Greater Than',
        description: 'Returns true if the first number is strictly greater than the second.',
        tags: ['Logic', 'compare', '>'],
        inputs: [
            { label: 'A', type: 'number', key: 'a' },
            { label: 'B', type: 'number', key: 'b' }
        ],
        outputs: [{ label: 'Result', type: 'boolean' }],
        params: { a: 0, b: 0 }
    },
    {
        type: 'compare_less',
        name: 'Less Than',
        description: 'Returns true if the first number is strictly less than the second.',
        tags: ['Logic', 'compare', '<'],
        inputs: [
            { label: 'A', type: 'number', key: 'a' },
            { label: 'B', type: 'number', key: 'b' }
        ],
        outputs: [{ label: 'Result', type: 'boolean' }],
        params: { a: 0, b: 0 }
    },
    {
        type: 'to_string',
        name: 'To String',
        description: 'Converts any value (number, boolean, etc.) into its text representation.',
        tags: ['String', 'string', 'convert', 'format', 'print'],
        inputs: [
            { label: 'Value', type: 'any_not_exec', key: 'value' }
        ],
        outputs: [{ label: 'String', type: 'string' }],
        params: { value: null }
    },
    {
        type: 'run_process',
        name: 'Run Process',
        description: 'Executes an external system command or program and captures its output.',
        tags: ['System', 'process', 'exec', 'command'],
        color: '#FF9800',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Program', type: 'string', key: 'program_name' },
            { label: 'Arguments', type: 'list:string', key: 'arguments' },
            { label: 'Timeout', type: 'number', key: 'timeout' }
        ],
        outputs: [
            { label: 'exec_out', type: 'exec' },
            { label: 'Output', type: 'string', key: 'output' }
        ],
        params: {
            program_name: '',
            arguments: [],
            timeout: 0
        }
    },
    {
        type: 'list_make',
        name: 'Make List',
        description: 'Constructs a list containing the provided input items.',
        tags: ['List', 'create', 'make', 'array', 'new'],
        color: '#4CAF50',
        inputs: [
            { label: 'Item 0', type: 'any_not_exec', key: 'in_0' }
        ],
        outputs: [
            { label: 'List', type: 'list:any_not_exec', key: 'list' }
        ],
        params: {
            element_type: 'any_not_exec'
        }
    },

    {
        type: 'list_for_each',
        name: 'List For Each',
        description: 'Iterates through a list, executing a loop for each item.',
        tags: ['Flow', 'loop', 'foreach', 'list'],
        color: '#FFC107',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'List', type: 'list:any_not_exec', key: 'list' }
        ],
        outputs: [
            { label: 'Loop', type: 'exec', key: 'exec_loop' },
            { label: 'Done', type: 'exec', key: 'exec_done' },
            { label: 'Item', type: 'any_not_exec', key: 'item' },
            { label: 'Index', type: 'number', key: 'index' }
        ],
        params: { list: [] }
    },
    {
        type: 'map_for_each',
        name: 'Map For Each',
        description: 'Iterates through a map, executing a loop for each key-value pair.',
        tags: ['Flow', 'loop', 'foreach', 'map'],
        color: '#FFC107',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Map', type: 'map:string:any_not_exec', key: 'map' }
        ],
        outputs: [
            { label: 'Loop', type: 'exec', key: 'exec_loop' },
            { label: 'Done', type: 'exec', key: 'exec_done' },
            { label: 'Key', type: 'string', key: 'key' },
            { label: 'Value', type: 'any_not_exec', key: 'value' }
        ],
        params: { map: {} }
    },

    {
        type: 'get_context_top_level_goal',
        name: 'Get Top Level Goal',
        description: 'Retrieves the main overall objective from the current execution context.',
        tags: ['Context', 'Goal', 'Get'],
        color: '#009688',
        inputs: [{ label: 'Context', type: 'context', key: 'ctx' }],
        outputs: [{ label: 'Goal', type: 'string' }]
    },
    {
        type: 'set_context_top_level_goal',
        name: 'Set Top Level Goal',
        description: 'Updates the main overall objective in the execution context.',
        tags: ['Context', 'Goal', 'Set'],
        color: '#009688',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Context', type: 'context', key: 'ctx' },
            { label: 'Goal', type: 'string', key: 'goal' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }]
    },
    {
        type: 'get_context_agent_goal',
        name: 'Get Agent Goal',
        description: 'Retrieves the specific current task assigned to the AI agent.',
        tags: ['Context', 'Goal', 'Get'],
        color: '#009688',
        inputs: [{ label: 'Context', type: 'context', key: 'ctx' }],
        outputs: [{ label: 'Goal', type: 'string' }]
    },
    {
        type: 'set_context_agent_goal',
        name: 'Set Agent Goal',
        description: 'Updates the specific task assigned to the AI agent.',
        tags: ['Context', 'Goal', 'Set'],
        color: '#009688',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Context', type: 'context', key: 'ctx' },
            { label: 'Goal', type: 'string', key: 'goal' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }]
    },
    {
        type: 'get_context_key_value',
        name: 'Get Context Key',
        description: 'Fetches an arbitrary value stored under a specific key within an agent context.',
        tags: ['Context', 'Get', 'Value'],
        color: '#009688',
        inputs: [
            { label: 'Context', type: 'context', key: 'ctx' },
            { label: 'Key', type: 'string', key: 'key' }
        ],
        outputs: [{ label: 'Value', type: 'any_not_exec' }]
    },
    {
        type: 'set_context_key_value',
        name: 'Set Context Key',
        description: 'Overwrites or adds an arbitrary key-value pair into an agent context.',
        tags: ['Context', 'Set', 'Value'],
        color: '#009688',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Context', type: 'context', key: 'ctx' },
            { label: 'Key', type: 'string', key: 'key' },
            { label: 'Value', type: 'any_not_exec', key: 'value' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }]
    },
    {
        type: 'get_context_agent_provider',
        name: 'Get Agent Provider',
        description: 'Determines which AI provider and model are configured for a specific role (e.g. "Primary").',
        tags: ['Context', 'Agent', 'Provider', 'Get'],
        color: '#009688',
        inputs: [
            { label: 'Context', type: 'context', key: 'ctx' },
            { label: 'Role', type: 'string', key: 'role' }
        ],
        outputs: [
            { label: 'Provider', type: 'string', key: 'provider' },
            { label: 'Model', type: 'string', key: 'model' }
        ]
    },
    {
        type: 'context_any_pending_messages',
        name: 'Any Pending Messages',
        description: 'Returns true if there are user messages that haven\'t been processed yet.',
        tags: ['Context', 'Message', 'User', 'Check'],
        color: '#009688',
        inputs: [
            { label: 'Context', type: 'context', key: 'ctx' }
        ],
        outputs: [
            { label: 'Result', type: 'boolean', key: 'result' }
        ]
    },
    {
        type: 'context_get_new_messages',
        name: 'Get New Messages',
        description: 'Retrieves only the most recent user messages from the context.',
        tags: ['Context', 'Message', 'User', 'Get'],
        color: '#009688',
        inputs: [
            { label: 'Context', type: 'context', key: 'ctx' }
        ],
        outputs: [
            { label: 'Messages', type: 'list:string', key: 'messages' }
        ]
    },
    {
        type: 'context_get_all_messages',
        name: 'Get All Messages',
        description: 'Retrieves the complete message history from the execution context.',
        tags: ['Context', 'Message', 'Get'],
        color: '#009688',
        inputs: [
            { label: 'Context', type: 'context', key: 'ctx' }
        ],
        outputs: [
            { label: 'Messages', type: 'list:string', key: 'messages' }
        ]
    },
    {
        type: 'create_llm_chat',
        name: 'Create LLM Chat',
        description: 'Initializes a new chat session state for interacting with an AI model.',
        tags: ['AI', 'LLM', 'Chat', 'Start'],
        color: '#E91E63',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Provider', type: 'string', key: 'provider' },
            { label: 'Model', type: 'string', key: 'model' },
            { label: 'System Prompt', type: 'string', key: 'system_prompt' },
            { label: 'Message List', type: 'list:struct:struct_chat_message', key: 'message_list' },
            { label: 'Tool List', type: 'list:tool', key: 'tool_list' }
        ],
        outputs: [
            { label: 'exec_out', type: 'exec' },
            { label: 'Chat State', type: 'chat_state', key: 'llm_chat' }
        ],
        params: {
            provider: 'local',
            model: '',
            system_prompt: 'You are a helpful assistant.',
            message_list: [],
            tool_list: []
        }
    },
    {
        type: 'send_llm_chat_message',
        name: 'Send LLM Chat Message',
        description: 'Sends a message to an AI model within an active chat session and receives a response.',
        tags: ['AI', 'LLM', 'Chat', 'Send'],
        color: '#E91E63',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Chat Object', type: 'chat_state', key: 'llm_chat' },
            { label: 'Message', type: 'struct:struct_chat_message', key: 'message' }
        ],
        outputs: [
            { label: 'exec_out', type: 'exec' },
            { label: 'Result Message', type: 'struct:struct_chat_message', key: 'result_message' }
        ],
        params: {}
    },
    {
        type: 'context_send_message',
        name: 'Send Thread Message',
        description: 'Sends a text message back to the active user thread/conversation.',
        tags: ['Context', 'Message', 'Assistant', 'Send'],
        color: '#009688',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Context', type: 'context', key: 'ctx' },
            { label: 'Message', type: 'string', key: 'message' },
            { label: 'Role', type: 'enum:enum_role', key: 'role' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }],
        params: { message: '', role: 1 }
    },
    {
        type: 'web_request',
        name: 'Web Request',
        description: 'Sends an HTTP request to a URL and captures the response.',
        tags: ['System', 'web', 'http', 'request', 'network'],
        color: '#4CAF50',
        resizable: true,
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'URL', type: 'string', key: 'url' },
            { label: 'Method', type: 'string', key: 'method' },
            { label: 'Headers', type: 'map:string:string', key: 'headers' },
            { label: 'Body', type: 'string', key: 'body' }
        ],
        outputs: [
            { label: 'exec_out', type: 'exec' },
            { label: 'Response', type: 'string', key: 'response' },
            { label: 'Status Code', type: 'number', key: 'status_code' }
        ],
        params: {
            url: '',
            method: 'GET',
            body: ''
        }
    }
];
