import { LexTree } from "./Lexer";
import { ParseTree } from "./Parser";

export class ParseError extends Error {
    /** Constructs an error from the line and index of a parse tree */
    public static fromTree(message: string, tree: ParseTree | LexTree): ParseError {
        if ("children" in tree) {
            return this.fromTree(message, tree.children[0]);
        } else {
            return new this(message, tree.line, tree.index);
        }
    }

    constructor(public message: string, public line: number, public index: number) {
        super();
    }

    /** Converts the error message to a string appending the line and index of the error */
    public toString(): string {
        return this.message + ` at line ${this.line + 1}:${this.index + 1}`;
    }
}
