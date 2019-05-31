import "reflect-metadata";

import { LexTree } from "./Lexer";
import { ParseTree } from "./Parser";

// Skips the visit function if the tree has only one child
export function skipOneChild(target: any, key: string, descriptor: PropertyDescriptor) {
    const originalVisitor = descriptor.value;

    descriptor.value = function(state: any, tree: ParseTree) {
        if (tree.children.length > 1) {
            return originalVisitor.call(this, state, tree);
        } else {
            return target.visit.call(this, state, tree.children[0]);
        }
    };

    return descriptor;
}

export class Visitor<T, S> {
    // Visit a node in the parse tree
    public visit(state: S, tree: ParseTree | LexTree): T {
        if ("visit_" + tree.type in this.constructor.prototype) {
            return (this as any)["visit_" + tree.type](state, tree);
        } else if ("children" in tree) {
            return this.visitChildren(state, tree);
        } else {
            throw new Error("Each terminal should have a corresponding visit method");
        }
    }

    // Visit the children in the parse tree and return the result of the last
    public visitChildren(state: S, tree: ParseTree): T {
        for (let i = 0; i < tree.children.length - 1; i++) {
            this.visit(state, tree.children[i]);
        }

        return this.visit(state, tree.children[tree.children.length - 1]);
    }
}
