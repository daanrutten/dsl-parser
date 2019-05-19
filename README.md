The example below shows a simple domain specific language for arithmetic.

```typescript
import { Lexer, LexTree, Terminal } from "./Lexer";
import { Parser, ParseTree, RuleSet } from "./Parser";
import { Visitor } from "./Visitor";

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

class ArithVisitor extends Visitor<number> {
    public visit_addExpr(tree: ParseTree): number {
        if (tree.children.length > 1) {
            // Compute the lhs and rhs
            const lhs = this.visit(tree.children[0]);
            const rhs = this.visit(tree.children[2]);

            switch ((tree.children[1] as LexTree).match[0]) {
                case "+":
                    return lhs + rhs;

                case "-":
                    return lhs - rhs;
            }

            throw new Error("Unreachable");
        } else {
            return this.visit(tree.children[0]);
        }
    }

    public visit_mulExpr(tree: ParseTree): number {
        if (tree.children.length > 1) {
            // Compute the lhs and rhs
            const lhs = this.visit(tree.children[0]);
            const rhs = this.visit(tree.children[2]);

            switch ((tree.children[1] as LexTree).match[0]) {
                case "*":
                    return lhs * rhs;

                case "/":
                    return lhs / rhs;
            }

            throw new Error("Unreachable");
        } else {
            return this.visit(tree.children[0]);
        }
    }

    public visit_number(tree: LexTree): number {
        return parseFloat(tree.match[0]);
    }
}

const lexer = new Lexer(terminals);
const parser = new Parser(lexer, rules, "root");
const visitor = new ArithVisitor();

const parseTree = parser.parse("3 + 2 * 1");
console.log(visitor.visit(parseTree));
```