const nodeRegistry = [
    {
        type: 'function_input',
        name: 'Function Inputs',
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
        type: 'selector',
        name: 'Selector',
        tags: ['Flow', 'control', 'composite'],
        inputs: [{ label: 'exec_in', type: 'exec' }],
        outputs: [{ label: 'exec_out', type: 'exec' }]
    },
    {
        type: 'sequence',
        name: 'Sequence',
        tags: ['Flow', 'control', 'composite'],
        inputs: [{ label: 'exec_in', type: 'exec' }],
        outputs: [{ label: 'exec_out', type: 'exec' }]
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
        type: 'action',
        name: 'Behavior Task',
        tags: ['Actions', 'leaf', 'task'],
        color: 'var(--danger)',
        inputs: [
            { label: 'In', type: 'exec' },
            { label: 'Message', type: 'string', key: 'message' }
        ],
        outputs: [{ label: 'exec_out', type: 'exec' }],
        params: { name: 'Behavior Task', message: 'Hello' }
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
        name: 'Set Variable',
        tags: ['Data', 'set', 'store', 'memory'],
        color: '#9C27B0',
        inputs: [
            { label: 'exec_in', type: 'exec' },
            { label: 'Value', type: 'any', key: 'value' }
        ],
        outputs: [{ label: 'Out', type: 'exec' }],
        params: { name: 'myVar', value: null }
    },
    {
        type: 'string',
        name: 'String Constant',
        tags: ['Data', 'variable', 'text'],
        outputs: [{ label: '', type: 'string' }],
        params: { value: 'Hello World' }
    },
    {
        type: 'string_format',
        name: 'String Format',
        tags: ['Data', 'string', 'format', 'template'],
        inputs: [
            { label: 'Format "{}"', type: 'string', key: 'format' },
            { label: 'Arg', type: 'any', key: 'arg1' }
        ],
        outputs: [{ label: 'Result', type: 'string' }],
        params: { format: 'Value: {}', arg1: null }
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
            { label: 'A', type: 'any', key: 'a' },
            { label: 'B', type: 'any', key: 'b' }
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
