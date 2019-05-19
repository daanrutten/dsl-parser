import { LexTree } from "./Lexer";
import { ParseTree } from "./Parser";

export class Visitor<T> {
    // Visit a node in the parse tree
    public visit(tree: ParseTree | LexTree): T {
        if ("visit_" + tree.type in this.constructor.prototype) {
            return (this as any)["visit_" + tree.type](tree);
        } else if ("children" in tree) {
            return this.visitChildren(tree);
        } else {
            throw new Error("Each terminal should have a corresponding visit method");
        }
    }

    // Visit the children in the parse tree and return the result of the last
    public visitChildren(tree: ParseTree): T {
        for (let i = 0; i < tree.children.length - 1; i++) {
            this.visit(tree.children[i]);
        }

        return this.visit(tree.children[tree.children.length - 1]);
    }
}
