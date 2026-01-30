const nodeRegistry = [
    {
        type: 'function_input',
        name: 'Function Inputs',
        tags: ['Function', 'input', 'start'],
        inputs: [], // Dynamic
        outputs: [{ label: 'Flow', type: 'exec' }] // Defaults
    },
    {
        type: 'function_return',
        name: 'Return',
        tags: ['Function', 'output', 'end'],
        inputs: [{ label: 'Flow', type: 'exec' }], // Defaults
        outputs: [] // Dynamic
    },
    {
        type: 'function_call',
        name: 'Function Call',
        tags: ['Function', 'call'],
        inputs: [{ label: 'In', type: 'exec' }], // Dynamic
        outputs: [{ label: 'Out', type: 'exec' }] // Dynamic
    },
    {
        type: 'selector',
        name: 'Selector',
        tags: ['Flow', 'control', 'composite'],
        inputs: [{ label: 'In', type: 'exec' }],
        outputs: [{ label: 'Out', type: 'exec' }]
    },
    {
        type: 'sequence',
        name: 'Sequence',
        tags: ['Flow', 'control', 'composite'],
        inputs: [{ label: 'In', type: 'exec' }],
        outputs: [{ label: 'Out', type: 'exec' }]
    },
    {
        type: 'condition',
        name: 'Branch',
        tags: ['Flow', 'logic', 'if', 'condition'],
        inputs: [
            { label: 'In', type: 'exec' },
            { label: 'Condition', type: 'boolean', key: 'condition' }
        ],
        outputs: [
            { label: 'True', type: 'exec' },
            { label: 'False', type: 'exec' }
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
        outputs: [{ label: 'Out', type: 'exec' }],
        params: { name: 'Behavior Task', message: 'Hello' }
    },
    {
        type: 'string',
        name: 'String Constant',
        tags: ['Data', 'variable', 'text'],
        outputs: [{ label: '', type: 'string' }],
        params: { value: 'Hello World' }
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
    }
];
