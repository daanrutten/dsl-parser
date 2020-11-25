import assert from "assert";
import deepEqual from "deep-equal";
import fs from "fs";

import { Lexer, LexTree, LexTreeUnknown, Terminal } from "./Lexer";
import { ParseError } from "./ParseError";

export type Rule = string[];
export interface RuleSet { [key: string]: Rule[]; }
export interface ParseTree { type: string; children: (ParseTree | LexTree)[]; }

interface DottedRule { key: string; children: Rule; dot: number; }
type Action = { type: "shift", goto: number, cameFrom: number[] }
    | { type: "reduce", key: string, rule: number }
    | { type: "accept", key: string };

export class Parser {
    /** Extracts the terminals from a ruleset */
    public static terminals(rules: RuleSet, terminals: Terminal[]): Terminal[] {
        const terminalSet = new Set<string>(terminals.map(t => t.type));
        const ruleTerminals: Terminal[] = [];

        for (const key in rules) {
            for (const rule of rules[key]) {
                for (let el of rule) {
                    el = this.base(el);

                    // If a terminal does not exist, create it
                    if (!rules.hasOwnProperty(el) && !terminalSet.has(el)) {
                        ruleTerminals.push({ type: el, pattern: new RegExp(el.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")) });
                        terminalSet.add(el);
                    }
                }
            }
        }

        ruleTerminals.push(...terminals);
        return ruleTerminals;
    }

    /** Returns the base of an element */
    private static base(el: string): string {
        switch (el && el[el.length - 1]) {
            case "+":
            case "*":
            case "?":
                return el.slice(0, -1);

            default:
                return el;
        }
    }

    /** Returns true if an element can be omitted */
    private static canOmit(el: string): boolean {
        switch (el && el[el.length - 1]) {
            case "*":
            case "?":
                return true;

            default:
                return false;
        }
    }

    /** Returns true if an element can be repeated */
    private static canRepeat(el: string): boolean {
        switch (el && el[el.length - 1]) {
            case "+":
            case "*":
                return true;

            default:
                return false;
        }
    }

    /** Finds the terminals an element can start with */
    private static first(rules: RuleSet): Record<string, Set<string>> {
        const first: Record<string, Set<string>> = {};

        // Initialize elements
        for (const key in rules) {
            first[key] = new Set();

            for (const rule of rules[key]) {
                for (let el of rule) {
                    el = this.base(el);

                    // Terminals have themselves as first
                    first[el] = first[el] || new Set([el]);
                }
            }
        }

        // Repeat until no changes
        let changed = true;

        while (changed) {
            changed = false;

            for (const key in rules) {
                const prevSize = first[key].size;

                for (const rule of rules[key]) {
                    // Add the first elements of the first child
                    for (const el of rule) {
                        first[key] = new Set([...first[key], ...first[this.base(el)]]);

                        if (!this.canOmit(el)) {
                            break;
                        }
                    }
                }

                changed = changed || first[key].size > prevSize;
            }
        }

        return first;
    }

    /** Finds the terminals which can follow an element */
    private static follow(rules: RuleSet, start: string): Record<string, Set<string>> {
        const follow: Record<string, Set<string>> = {};

        // Initialize non-terminals
        for (const key in rules) {
            follow[key] = new Set();
        }

        // An endline can follow the start
        follow[start].add("$");

        // Repeat until no changes
        const first = this.first(rules);
        let changed = true;

        while (changed) {
            changed = false;

            for (const key in rules) {
                for (const rule of rules[key]) {
                    for (let i = 0; i < rule.length; i++) {
                        const el = this.base(rule[i]);

                        // If element is a non-terminal
                        if (rules.hasOwnProperty(el)) {
                            const prevSize = follow[el].size;

                            if (this.canRepeat(rule[i])) {
                                // Follow adds first of current element
                                follow[el] = new Set([...follow[el], ...first[el]]);
                            }

                            for (let j = i + 1; j <= rule.length; j++) {
                                if (j === rule.length) {
                                    // Follow adds terminals following key
                                    follow[el] = new Set([...follow[el], ...follow[key]]);
                                } else {
                                    // Follow adds first of next element
                                    follow[el] = new Set([...follow[el], ...first[this.base(rule[j])]]);

                                    if (!this.canOmit(rule[j])) {
                                        break;
                                    }
                                }
                            }

                            changed = changed || follow[el].size > prevSize;
                        }
                    }
                }
            }
        }

        return follow;
    }

    /** Skips over the ommitable elements after the dot */
    private static skipOmit(root: DottedRule): DottedRule[] {
        const ruleSet = [root];

        for (let i = root.dot; i < root.children.length; i++) {
            if (!this.canOmit(root.children[i])) {
                break;
            } else {
                // Advance the dot
                ruleSet.push({ key: root.key, children: root.children, dot: i + 1 });
            }
        }

        return ruleSet;
    }

    /** Expands the non-terminals after the dot recursively */
    private static closure(rules: RuleSet, root: DottedRule): DottedRule[] {
        const ruleSet = this.skipOmit(root);

        for (const rule of ruleSet) {
            // Get the non-terminal following the dot
            const nt = this.base(rule.children[rule.dot]);

            if (rules.hasOwnProperty(nt)) {
                // Add each of its rules to the set
                for (const children of rules[nt]) {
                    for (const nextRule of this.skipOmit({ key: nt, children, dot: 0 })) {
                        if (!ruleSet.find(r => deepEqual(r, nextRule))) {
                            ruleSet.push(nextRule);
                        }
                    }
                }
            }
        }

        return ruleSet;
    }

    /** Advances the dot after recognizing el */
    private static goto(rules: RuleSet, ruleSet: DottedRule[], el: string): [DottedRule[], number[]] {
        const output: DottedRule[] = [];
        const cameFrom: number[] = [];

        for (let i = 0; i < ruleSet.length; i++) {
            const rule = ruleSet[i];

            // If rule recognizes el
            if (this.base(rule.children[rule.dot]) === el) {
                for (let j = 1; j >= 0; j--) {
                    // Advance the dot
                    const baseRule = { key: rule.key, children: rule.children, dot: rule.dot + j };
                    const trackedRules = this.skipOmit(baseRule);

                    // Add closure
                    for (const nextRule of this.closure(rules, baseRule)) {
                        const ruleIndex = output.findIndex(r => deepEqual(r, nextRule));
                        const trackCameFrom = trackedRules.some(r => deepEqual(r, nextRule));

                        if (ruleIndex === -1) {
                            if (trackCameFrom) {
                                cameFrom[output.length] = i;
                            }

                            output.push(nextRule);
                        } else if ((trackCameFrom && cameFrom[ruleIndex] !== i) || (!trackCameFrom && cameFrom[ruleIndex] !== undefined)) {
                            throw new Error(`Rule ${rule.key} - ${rule.children} is part of a reduce/reduce conflict`);
                        }
                    }

                    if (!this.canRepeat(rule.children[rule.dot])) {
                        break;
                    }
                }
            }
        }

        return [output, cameFrom];
    }

    /** Builds the action table guiding the parser */
    private static buildTable(rules: RuleSet, start: string): Record<string, Action>[] {
        // Initialize states with start
        const states = [this.closure(rules, { key: start, children: [start], dot: 0 })];
        const follow = this.follow(rules, start);

        const actionTable: Record<string, Action>[] = [];

        for (let i = 0; i < states.length; i++) {
            actionTable[i] = {};

            for (let j = 0; j < states[i].length; j++) {
                const rule = states[i][j];

                // If dot is at end of line
                if (rule.dot === rule.children.length) {
                    if (rule.key === start) {
                        if (actionTable[i].hasOwnProperty("$")) {
                            // Throw error for double entries
                            throw new Error(`Rule ${rule.key} - ${rule.children} is part of a ${actionTable[i]["$"].type}/reduce conflict`);
                        } else {
                            // Accept action
                            actionTable[i]["$"] = { type: "accept", key: start };
                        }
                    } else {
                        // Reduce if el is a possible follow
                        for (const el of follow[rule.key]) {
                            const action: Action = { type: "reduce", key: rule.key, rule: j };

                            if (actionTable[i].hasOwnProperty(el)) {
                                // Throw error for double entries
                                throw new Error(`Rule ${rule.key} - ${rule.children} is part of a ${actionTable[i][el].type}/reduce conflict`);
                            } else {
                                // Reduce action
                                actionTable[i][el] = action;
                            }
                        }
                    }
                } else {
                    const el = this.base(rule.children[rule.dot]);

                    if (actionTable[i].hasOwnProperty(el)) {
                        // Throw error for double entries
                        if (actionTable[i][el].type !== "shift") {
                            throw new Error(`Rule ${rule.key} - ${rule.children} is part of a shift/${actionTable[i][el].type} conflict`);
                        }
                    } else {
                        const [gotoState, cameFrom] = this.goto(rules, states[i], el);

                        // Check if state is already in states
                        let gotoStateIndex = states.findIndex(state => deepEqual(state, gotoState));

                        if (gotoStateIndex === -1) {
                            gotoStateIndex = states.length;
                            states.push(gotoState);
                        }

                        // Shift action
                        actionTable[i][el] = { type: "shift", goto: gotoStateIndex, cameFrom };
                    }
                }
            }
        }

        return actionTable;
    }

    private actionTable: Record<string, Action>[];

    constructor(rules: RuleSet, start: string, version?: string) {
        for (const key in rules) {
            assert(rules[key].length > 0, "Each non-terminal should contain at least one rule");
            assert(rules[key].every(rule => rule.length > 0), "Each rule should contain at least one element");
        }

        if (version && fs.existsSync("dsl-parser_v" + version + ".json")) {
            this.actionTable = JSON.parse(fs.readFileSync("dsl-parser_v" + version + ".json").toString());
        } else {
            this.actionTable = Parser.buildTable(rules, start);

            if (version) {
                fs.writeFileSync("dsl-parser_v" + version + ".json", JSON.stringify(this.actionTable));
            }
        }
    }

    /** Parses the tokens possibly using the lexer to lex unknown tokens */
    public parse(lexer: Lexer, tokens: LexTree[]): ParseTree {
        const symbolStack: (ParseTree | LexTree)[] = [];
        const readStack: (number | undefined)[][] = [[]];
        const stateStack = [0];

        let lexToken: LexTree | undefined;
        let index = 0;

        for (let i = 0; true;) {
            // Read next symbol
            let token = lexToken || tokens[i];

            // Lex next token
            if (!lexToken && token.type === "unknown") {
                lexToken = lexer.next(token as LexTreeUnknown, index, this.actionTable[stateStack[stateStack.length - 1]]);

                if (lexToken.type === "$") {
                    i++;
                    lexToken = undefined;
                    index = 0;
                    continue;
                }

                index += lexToken.match[0].length;
                token = lexToken;
            }

            // Skip over whitespace
            if (token.type === "whitespace") {
                i = !lexToken ? i + 1 : i;
                lexToken = undefined;
                continue;
            }

            // Get action given current state and symbol
            let action = this.actionTable[stateStack[stateStack.length - 1]][token.type];

            if (action) {
                switch (action.type) {
                    case "shift":
                        symbolStack.push(token);
                        i = !lexToken ? i + 1 : i;
                        lexToken = undefined;
                        break;

                    case "reduce":
                        const symbolsRead = readStack[readStack.length - 1][action.rule]!;
                        const parent = { type: action.key, children: symbolStack.splice(-symbolsRead) };
                        readStack.splice(-symbolsRead);
                        stateStack.splice(-symbolsRead);

                        action = this.actionTable[stateStack[stateStack.length - 1]][parent.type] as { type: "shift", goto: number, cameFrom: number[] };
                        symbolStack.push(parent);
                        break;

                    case "accept":
                        return { type: action.key, children: symbolStack };
                }

                // Increase the number of symbols read for each rule
                readStack.push(action.cameFrom.map(rule => rule !== undefined ? (readStack[readStack.length - 1][rule] || 0) + 1 : undefined));
                stateStack.push(action.goto);
            } else {
                throw ParseError.fromTree("Parser failed to parse symbol", token);
            }
        }
    }
}
