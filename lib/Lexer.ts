import assert from "assert";

import { ParseError } from "./ParseError";

export interface Terminal { type: string; pattern: RegExp; }
export interface LexTree { type: string; match: RegExpMatchArray; index: number; line: number; }
export interface LexTreeUnknown extends LexTree { type: "unknown"; }

export class Lexer {
    /** Split the input in lines */
    public static split(input: string, comment?: RegExp): LexTree[] {
        const lines = input.split(/\r?\n/).filter(line => !comment || !comment.test(line));

        // Tokens are still unknown
        const output = lines.map((str, line) => ({ type: "unknown", match: [str], index: 0, line }));
        output.push({ type: "$", match: [""], index: lines[lines.length - 1].length, line: lines.length - 1 });

        return output;
    }

    /** Split the input in lines and apply the offside rule */
    public static splitOffside(input: string, comment?: RegExp): LexTree[] {
        const output: LexTree[] = [];
        const level = [0];

        const lines = input.split(/\r?\n/).filter(line => !comment || !comment.test(line));

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

                    if (match.index! !== level[level.length - 1]) {
                        throw new ParseError("Invalid indentation detected", i, match.index!);
                    }
                }
            }

            // Tokens are still unknown
            output.push({ type: "unknown", match: [lines[i]], index: 0, line: i });
        }

        while (0 < level[level.length - 1]) {
            output.push({ type: "dedent", match: [""], index: lines[lines.length - 1].length, line: lines.length - 1 });
            level.pop();
        }

        output.push({ type: "$", match: [""], index: lines[lines.length - 1].length, line: lines.length - 1 });
        return output;
    }

    constructor(private terminals: Terminal[]) {
        assert(!terminals.some(t => t.type === "$"), "The terminal type '$' is a reserved keyword");
        this.terminals = terminals.map(t => (t.pattern = new RegExp(t.pattern.source, "y"), t));
    }

    /** Extract the next symbol from an unknown token */
    public next(token: LexTreeUnknown, index = 0, activeTerminals?: Record<string, any>): LexTree {
        if (index >= token.match[0].length) {
            return { type: "$", match: [""], index: token.index + index, line: token.line };
        }

        for (const terminal of this.terminals) {
            if (!activeTerminals || activeTerminals[terminal.type] || terminal.type === "whitespace") {
                terminal.pattern.lastIndex = index;
                const match = token.match[0].match(terminal.pattern);

                if (match) {
                    return { type: terminal.type, match, index: token.index + index, line: token.line };
                }
            }
        }

        throw new ParseError("Lexer failed to recognize symbol", token.line, token.index + index);
    }

    /** Extract all symbols from a set of unknown tokens */
    public lex(tokens: LexTree[]): LexTree[] {
        const output = [];

        for (const token of tokens) {
            if (token.type === "unknown") {
                for (let index = 0; true;) {
                    const lexToken = this.next(token as LexTreeUnknown, index);

                    if (lexToken.type === "$") {
                        break;
                    }

                    index += lexToken.match[0].length;
                    output.push(lexToken);
                }
            } else {
                output.push(token);
            }
        }

        return output;
    }
}
