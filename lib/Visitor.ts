import "reflect-metadata";

import { LexTree } from "./Lexer";
import { ParseTree } from "./Parser";

/** Skips the visit function if the tree has only one child */
export function skipOneChild(target: any, key: string, descriptor: PropertyDescriptor) {
    const originalVisitor = descriptor.value;

    descriptor.value = function(state: any, tree: ParseTree, ...args: any[]) {
        if (tree.children.length > 1) {
            return originalVisitor.call(this, state, tree, ...args);
        } else {
            return target.visit.call(this, state, tree.children[0], ...args);
        }
    };

    return descriptor;
}

export class Visitor<T, S> {
    /** Visit a node in the parse tree */
    public visit(state: S, tree: ParseTree | LexTree, ...args: any[]): T {
        if ("visit_" + tree.type in this) {
            return (this as any)["visit_" + tree.type](state, tree, ...args);
        } else if ("children" in tree) {
            return this.visitChildren(state, tree, ...args);
        } else {
            throw new Error("Each terminal should have a corresponding visit method");
        }
    }

    /** Visit the children in the parse tree and return the result of the last */
    public visitChildren(state: S, tree: ParseTree, ...args: any[]): T {
        for (let i = 0; i < tree.children.length - 1; i++) {
            this.visit(state, tree.children[i], ...args);
        }

        return this.visit(state, tree.children[tree.children.length - 1], ...args);
    }
}
