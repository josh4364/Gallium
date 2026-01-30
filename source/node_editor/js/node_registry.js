const nodeRegistry = [
    {
        type: 'start',
        name: 'Start',
        tags: ['Function', 'input', 'start'],
        inputs: [], // Dynamic
        outputs: [{ label: 'exec_out', type: 'exec' }] // Defaults
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
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Message', type: 'string', key: 'message' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }],
        params: { message: 'Hello World' }
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
    }
];
