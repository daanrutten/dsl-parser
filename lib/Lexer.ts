import assert from "assert";

export interface Terminal { type: string; pattern: RegExp; }
export interface LexTree { type: string; match: RegExpMatchArray; index: number; line: number; }

export class Lexer {
    constructor(private terminals: Terminal[]) {
        assert(!terminals.some(t => t.type === "$"), "The terminal type '$' is a reserved keyword");
        this.terminals = terminals.map(t => (t.pattern = new RegExp(t.pattern.source, "y"), t));
    }

    // Extract the next symbol from the input
    public next(input: string, index = 0, line = 0): LexTree | undefined {
        if (index >= input.length) {
            return { type: "$", match: [""], index: input.length, line };
        }

        for (const terminal of this.terminals) {
            terminal.pattern.lastIndex = index;
            const match = input.match(terminal.pattern);

            if (match) {
                return { type: terminal.type, match, index, line };
            }
        }
    }

    // Extract all symbols from the input
    public lex(input: string, index = 0, line = 0): LexTree[] {
        const output: LexTree[] = [];

        while (true) {
            const token = this.next(input, index, line);

            if (!token) {
                throw Error(`Lexer failed to recognize symbol at ${line + 1}:${index + 1}`);
            } else if (token.type === "$") {
                output.push(token);
                return output;
            }

            output.push(token);
            index += token.match[0].length;
        }
    }

    // Extract all symbols from the input using the offside rule
    public lexOffside(input: string): LexTree[] {
        const output: LexTree[] = [];
        const level = [0];

        const lines = input.split(/\r?\n/);
        let terminateToken: LexTree | undefined;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/\S/);

            if (match) {
                // Apply the offside rule
                if (match.index! > level[level.length - 1]) {
                    output.push({ type: "indent", match: [""], index: match.index!, line: i });
                    level.push(match.index!);
                } else {
                    while (match.index! < level[level.length - 1]) {
                        output.push({ type: "dedent", match: [""], index: match.index!, line: i });
                        level.pop();
                    }
                }
            }

            // Lex the line
            const tokens = this.lex(lines[i], 0, i);
            terminateToken = tokens.pop()!;
            output.push(...tokens);
        }

        while (0 < level[level.length - 1]) {
            output.push({ type: "dedent", match: [""], index: terminateToken!.index, line: terminateToken!.line });
            level.pop();
        }

        output.push(terminateToken!);
        return output;
    }
}
