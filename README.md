The example below shows a simple domain specific language for arithmetic.

```typescript
import { Lexer, Terminal } from "./Lexer";
import { Parser, RuleSet } from "./Parser";

const terminals: Terminal[] = [
    // Terminals are matched by their pattern (in order)
    { type: "number", pattern: /[0-9]+/ },
    { type: "add", pattern: /[+-]/ },
    { type: "mul", pattern: /[*\/]/ },
    // Terminals with type 'whitespace' are ignored
    { type: "whitespace", pattern: /\s+/ }
];

const rules: RuleSet = {
    root: [
        // The root can expand to an addExpr
        ["addExpr"]
    ],
    addExpr: [
        // An addExpr can expand to an addExpr + a mulExpr
        ["addExpr", "add", "mulExpr"],
        // Or just a mulExpr
        ["mulExpr"]
    ],
    mulExpr: [
        // An addExpr can expand to a mulExpr * a number
        ["mulExpr", "mul", "number"],
        // Or just a number
        ["number"]
    ]
};

const lexer = new Lexer(terminals);
const parser = new Parser(lexer, rules, "root");

const tree = parser.parse("3 + 2 * 1");
```