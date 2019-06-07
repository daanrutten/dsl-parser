The example below shows a simple domain specific language for arithmetic.

```typescript
import { Lexer, LexTree, Terminal } from "./Lexer";
import { Parser, ParseTree, RuleSet } from "./Parser";
import { skipOneChild, Visitor } from "./Visitor";

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

class ArithVisitor extends Visitor<number, void> {
    @skipOneChild
    public visit_addExpr(state: void, tree: ParseTree): number {
        // Compute the lhs and rhs
        const lhs = this.visit(state, tree.children[0]);
        const rhs = this.visit(state, tree.children[2]);

        switch ((tree.children[1] as LexTree).match[0]) {
            case "+":
                return lhs + rhs;

            case "-":
                return lhs - rhs;
        }

        throw new Error("Unreachable");
    }

    @skipOneChild
    public visit_mulExpr(state: void, tree: ParseTree): number {
        // Compute the lhs and rhs
        const lhs = this.visit(state, tree.children[0]);
        const rhs = this.visit(state, tree.children[tree.children.length - 1]);

        switch ((tree.children[1] as LexTree).match[0]) {
            case "*":
                return lhs * rhs;

            case "/":
                return lhs / rhs;
        }

        throw new Error("Unreachable");
    }

    public visit_number(state: void, tree: LexTree): number {
        return parseFloat(tree.match[0]);
    }
}

const lexer = new Lexer(terminals);
const parser = new Parser(rules, "root");
const visitor = new ArithVisitor();

const parseTree = parser.parse(lexer, Lexer.split("3 + 2 * 1"));
console.log(visitor.visit(undefined, parseTree)); 
```