import assert from "assert";

export interface Terminal { type: string; pattern: RegExp; }
export interface LexTree { type: string; match: RegExpMatchArray; index: number; }

export class Lexer {
    constructor(private terminals: Terminal[]) {
        assert(!terminals.some(t => t.type === "$"), "The terminal type '$' is a reserved keyword");
        this.terminals = terminals.map(t => (t.pattern = new RegExp(t.pattern.source, "y"), t));
    }

    // Extract the next symbol from the input
    public next(input: string, index = 0): LexTree | undefined {
        if (index >= input.length) {
            return { type: "$", match: [""], index: input.length };
        }

        for (const terminal of this.terminals) {
            terminal.pattern.lastIndex = index;
            const match = input.match(terminal.pattern);

            if (match) {
                return { type: terminal.type, match, index };
            }
        }
    }

    // Extract all symbols from the input
    public lex(input: string, index = 0): LexTree[] {
        const output: LexTree[] = [];

        while (true) {
            const token = this.next(input, index);

            if (!token) {
                throw Error("Lexer failed to recognize symbol at " + index);
            } else if (token.type === "$") {
                return output;
            }

            output.push(token);
            index += token.match[0].length;
        }
    }
}
