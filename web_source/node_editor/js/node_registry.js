const nodeRegistry = [
    {
        type: 'start',
        name: 'Start',
        tags: ['Function', 'input', 'start'],
        inputs: [], // Dynamic
        outputs: [{ label: 'exec_out', type: 'exec' }] // Defaults
    },
    {
        type: 'prompt_user',
        name: 'Prompt User',
        tags: ['UI', 'input', 'interactive', 'ask'],
        color: '#673AB7',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Title', type: 'string', key: 'title' },
            { label: 'Message', type: 'string', key: 'message' }
        ],
        outputs: [
            { label: 'exec_yes', type: 'exec' },
            { label: 'exec_no', type: 'exec' }
        ],
        params: { title: 'Question', message: 'Are you sure?' }
    },
    {
        type: 'ui_yield',
        name: 'UI Yield',
        tags: ['UI', 'system', 'wait', 'user'],
        color: '#673AB7',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'UI Type', type: 'string', key: 'ui_type' },
            { label: 'Payload', type: 'any_not_exec', key: 'payload' }
        ],
        outputs: [
            { label: 'exec_out', type: 'exec' },
            { label: 'Result', type: 'any_not_exec', key: 'result' }
        ],
        params: { ui_type: 'BinaryChoice', payload: {} }
    },
    {
        type: 'function_return',
        name: 'Return',
        tags: ['Function', 'output', 'end'],
        inputs: [{ label: 'exec_in', type: 'exec' }], // Defaults
        outputs: [] // Dynamic
    },
    {
        type: 'function_call',
        name: 'Function Call',
        tags: ['Function', 'call'],
        inputs: [{ label: 'exec_in', type: 'exec' }], // Dynamic
        outputs: [{ label: 'exec_out', type: 'exec' }] // Dynamic
    },
    {
        type: 'condition',
        name: 'Branch',
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
        type: 'log_message',
        name: 'Log Message',
        tags: ['Actions', 'print', 'debug', 'log'],
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
        name: 'AI Eval',
        tags: ['AI', 'llm', 'gemini', 'eval'],
        color: '#E91E63',
        resizable: true,
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Model', type: 'string', key: 'model_name' },
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
            model_name: 'gemini-3-flash-preview',
            system_prompt: 'You are a helpful coding assistant.',
            prompt: ''
        }
    },
    {
        type: 'create_tool',
        name: 'Create Tool',
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
        tags: ['Data', 'local', 'get', 'read', 'memory'],
        color: '#9C27B0',
        inputs: [],
        outputs: [{ label: 'Value', type: 'any_not_exec' }],
        params: { name: 'myVar' }
    },
    {
        type: 'string',
        name: 'String Constant',
        tags: ['Data', 'variable', 'text'],
        resizable: true,
        outputs: [{ label: '', type: 'string' }],
        params: { value: 'Hello World' }
    },
    {
        type: 'string_format',
        name: 'String Format',
        tags: ['Data', 'string', 'format', 'template'],
        resizable: true,
        inputs: [],
        outputs: [{ label: 'Result', type: 'string' }],
        params: { format: 'Value: {}' }
    },
    {
        type: 'number',
        name: 'Number Constant',
        tags: ['Data', 'variable', 'float', 'int'],
        outputs: [{ label: '', type: 'number' }],
        params: { value: 42 }
    },
    {
        type: 'boolean',
        name: 'Boolean Constant',
        tags: ['Data', 'variable', 'bool'],
        outputs: [{ label: '', type: 'boolean' }],
        params: { value: false }
    },
    {
        type: 'math_add',
        name: 'Add',
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
        tags: ['Data', 'string', 'convert', 'format', 'print'],
        inputs: [
            { label: 'Value', type: 'any_not_exec', key: 'value' }
        ],
        outputs: [{ label: 'String', type: 'string' }],
        params: { value: null }
    },
    {
        type: 'run_process',
        name: 'Run Process',
        tags: ['System', 'process', 'exec', 'command'],
        color: '#FF9800',
        resizable: true,
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
        type: 'global_context_read',
        name: 'Context Read',
        tags: ['State', 'global', 'read', 'memory', 'blackboard'],
        color: '#009688',
        inputs: [
            { label: 'Key', type: 'string', key: 'key' }
        ],
        outputs: [
            { label: 'Value', type: 'any_not_exec', key: 'value' },
            { label: 'exec_out', type: 'exec' } // Optional flow passthrough
        ],
        params: { key: '' }
    },
    {
        type: 'global_context_write',
        name: 'Context Write',
        tags: ['State', 'global', 'write', 'memory', 'blackboard'],
        color: '#009688',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Key', type: 'string', key: 'key' },
            { label: 'Value', type: 'any_not_exec', key: 'value' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }],
        params: { key: '', value: null }
    },
    {
        type: 'json_iterator',
        name: 'Iterator',
        tags: ['State', 'loop', 'foreach', 'json', 'list'],
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
        type: 'event_emit',
        name: 'Emit Event',
        tags: ['State', 'event', 'signal', 'trigger'],
        color: '#FF5722',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Event Name', type: 'string', key: 'event_name' },
            { label: 'Payload', type: 'any_not_exec', key: 'payload' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }],
        params: { event_name: '', payload: {} }
    },
    {
        type: 'get_context_top_level_goal',
        name: 'Get Top Level Goal',
        tags: ['Context', 'Goal', 'Get'],
        color: '#009688',
        inputs: [{ label: 'Context', type: 'context', key: 'ctx' }],
        outputs: [{ label: 'Goal', type: 'string' }]
    },
    {
        type: 'set_context_top_level_goal',
        name: 'Set Top Level Goal',
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
        tags: ['Context', 'Goal', 'Get'],
        color: '#009688',
        inputs: [{ label: 'Context', type: 'context', key: 'ctx' }],
        outputs: [{ label: 'Goal', type: 'string' }]
    },
    {
        type: 'set_context_agent_goal',
        name: 'Set Agent Goal',
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
        tags: ['Context', 'Agent', 'Provider', 'Get'],
        color: '#009688',
        inputs: [
            { label: 'Context', type: 'context', key: 'ctx' },
            { label: 'Role', type: 'string', key: 'role' }
        ],
        outputs: [{ label: 'Provider', type: 'string' }]
    },
    {
        type: 'context_any_pending_messages',
        name: 'Any Pending Messages',
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
        type: 'context_send_message',
        name: 'Send Thread Message',
        tags: ['Context', 'Message', 'Assistant', 'Send'],
        color: '#009688',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Context', type: 'context', key: 'ctx' },
            { label: 'Message', type: 'string', key: 'message' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }],
        params: { message: '' }
    }
];
