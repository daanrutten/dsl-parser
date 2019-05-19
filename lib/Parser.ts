import assert from "assert";
import deepEqual from "deep-equal";

import { Lexer, LexTree } from "./Lexer";

export type Rule = string[];
export interface RuleSet { [key: string]: Rule[]; }
export interface ParseTree { type: string; children: (ParseTree | LexTree)[]; }

interface DottedRule { key: string; children: Rule; dot: number; }
interface Map<T> { [key: string]: T; }

type Action = { type: "shift", goto: number }
    | { type: "reduce", rule: string, children: number }
    | { type: "accept", start: string };

export class Parser {
    // Finds the terminals an element can start with
    private static first(rules: RuleSet): Map<Set<string>> {
        const first: Map<Set<string>> = {};

        // Initialize elements
        for (const key in rules) {
            first[key] = new Set();

            for (const rule of rules[key]) {
                for (const el of rule) {
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
                    first[key] = new Set([...first[key], ...first[rule[0]]]);
                }

                changed = changed || first[key].size > prevSize;
            }
        }

        return first;
    }

    // Find the terminals which can follow an element
    private static follow(rules: RuleSet, start: string): Map<Set<string>> {
        const follow: Map<Set<string>> = {};

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
                        // If element is a non-terminal
                        if (rule[i] in rules) {
                            const prevSize = follow[rule[i]].size;

                            if (i === rule.length - 1) {
                                // Follow adds terminals following key
                                follow[rule[i]] = new Set([...follow[rule[i]], ...follow[key]]);
                            } else {
                                // Follow adds first of next element
                                follow[rule[i]] = new Set([...follow[rule[i]], ...first[rule[i + 1]]]);
                            }

                            changed = changed || follow[rule[i]].size > prevSize;
                        }
                    }
                }
            }
        }

        return follow;
    }

    // Expand the non-terminals after the dot recursively
    private static closure(rules: RuleSet, root: DottedRule): DottedRule[] {
        const ruleSet = [root];

        for (const rule of ruleSet) {
            // Get the non-terminal following the dot
            const nt = rule.children[rule.dot];

            if (nt in rules) {
                // Add each of its rules to the set
                for (const children of rules[nt]) {
                    const nextRule = { key: nt, children, dot: 0 };

                    if (!ruleSet.find(r => deepEqual(r, nextRule))) {
                        ruleSet.push(nextRule);
                    }
                }
            }
        }

        return ruleSet;
    }

    // Advances the dot after recognizing el
    private static goto(rules: RuleSet, ruleSet: DottedRule[], el: string): DottedRule[] {
        const output: DottedRule[] = [];

        for (const rule of ruleSet) {
            // If rule recognizes el
            if (rule.children[rule.dot] === el) {
                // Advance the dot and add closure
                for (const nextRule of this.closure(rules, { key: rule.key, children: rule.children, dot: rule.dot + 1 })) {
                    if (!output.find(r => deepEqual(r, nextRule))) {
                        output.push(nextRule);
                    }
                }
            }
        }

        return output;
    }

    // Builds the action table guiding the parser
    private static buildTable(rules: RuleSet, start: string): Map<Action>[] {
        // Initialize states with start
        const states = [this.closure(rules, { key: start, children: [start], dot: 0 })];
        const follow = this.follow(rules, start);

        const actionTable: Map<Action>[] = [];

        for (let i = 0; i < states.length; i++) {
            actionTable[i] = {};

            for (const rule of states[i]) {
                // If dot is at end of line
                if (rule.dot === rule.children.length) {
                    if (rule.key === start) {
                        if ("$" in actionTable[i]) {
                            // Throw error for double entries
                            throw new Error(`Rule ${rule.key} - ${rule.children} is part of a ${actionTable[i]["$"].type}/reduce conflict`);
                        } else {
                            // Accept action
                            actionTable[i]["$"] = { type: "accept", start };
                        }
                    } else {
                        // Reduce if el is a possible follow
                        for (const el of follow[rule.key]) {
                            const action: Action = { type: "reduce", rule: rule.key, children: rule.children.length };

                            if (el in actionTable[i]) {
                                // Throw error for double entries
                                throw new Error(`Rule ${rule.key} - ${rule.children} is part of a ${actionTable[i][el].type}/reduce conflict`);
                            } else {
                                // Reduce action
                                actionTable[i][el] = action;
                            }
                        }
                    }
                } else {
                    const el = rule.children[rule.dot];

                    if (el in actionTable[i]) {
                        // Throw error for double entry
                        if (actionTable[i][el].type !== "shift") {
                            throw new Error(`Rule ${rule.key} - ${rule.children} is part of a shift/${actionTable[i][el].type} conflict`);
                        }
                    } else {
                        const gotoState = this.goto(rules, states[i], el);

                        // Check if state is already in states
                        let gotoStateIndex = states.findIndex(state => deepEqual(state, gotoState));

                        if (gotoStateIndex === -1) {
                            gotoStateIndex = states.length;
                            states.push(gotoState);
                        }

                        // Shift action
                        actionTable[i][el] = { type: "shift", goto: gotoStateIndex };
                    }
                }
            }
        }

        return actionTable;
    }

    private actionTable: Map<Action>[];

    constructor(private lexer: Lexer, rules: RuleSet, start: string) {
        for (const key in rules) {
            assert(rules[key].length > 0, "Each non-terminal should contain at least one rule");
            assert(rules[key].every(rule => rule.length > 0), "Each rule should contain at least one element");
        }

        this.actionTable = Parser.buildTable(rules, start);
    }

    public parse(input: string, index = 0): ParseTree {
        const symbolStack: (ParseTree | LexTree)[] = [];
        const stateStack = [0];

        while (true) {
            // Read next symbol
            const token = this.lexer.next(input, index);

            if (!token) {
                throw Error("Lexer failed to recognize symbol at " + index);
            } else if (token.type === "whitespace") {
                index += token.match[0].length;
                continue;
            }

            // Get action given current state and symbol
            let action = this.actionTable[stateStack[stateStack.length - 1]][token.type];

            if (action) {
                switch (action.type) {
                    case "shift":
                        symbolStack.push(token);
                        stateStack.push(action.goto);

                        index += token.match[0].length;
                        break;

                    case "reduce":
                        const parent = { type: action.rule, children: symbolStack.splice(-action.children) };
                        stateStack.splice(-action.children);

                        action = this.actionTable[stateStack[stateStack.length - 1]][parent.type] as { type: "shift", goto: number };
                        symbolStack.push(parent);
                        stateStack.push(action.goto);
                        break;

                    case "accept":
                        return { type: action.start, children: symbolStack };
                }
            } else {
                throw Error("Parser failed to parse symbol at " + index);
            }
        }
    }
}
