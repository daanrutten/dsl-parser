import assert from "assert";

export interface Terminal { type: string; pattern: RegExp; }
export interface LexTree { type: string; match: RegExpMatchArray; }

export class Lexer {
    constructor(private terminals: Terminal[]) {
        assert(!terminals.some(t => t.type === "$"), "The terminal type '$' is a reserved keyword");
        this.terminals = terminals.map(t => (t.pattern = new RegExp(t.pattern.source, "y"), t));
    }

    // Extract the next symbol from the input
    public next(input: string, index = 0): LexTree | undefined {
        if (index >= input.length) {
            return { type: "$", match: [""] };
        }

        for (const terminal of this.terminals) {
            terminal.pattern.lastIndex = index;
            const match = input.match(terminal.pattern);

            if (match) {
                return { type: terminal.type, match };
            }
        }
    }
}
