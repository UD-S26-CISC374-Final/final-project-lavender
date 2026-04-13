import type { BridgeNode, LinkedListModel } from "../model/linked-list-model";

/**
 * Walk `next` pointers from `headId` and collect nodes in order.
 * Stops at null, a missing node, or a cycle.
 */
function collectForwardChain(model: LinkedListModel): {
    chain: BridgeNode[];
    stoppedReason: "end" | "missing" | "cycle" | "empty";
    badId?: string;
} {
    if (model.headId === null) {
        return { chain: [], stoppedReason: "empty" };
    }

    const chain: BridgeNode[] = [];
    const seen = new Set<string>();
    let id: string | null = model.headId;

    while (id !== null) {
        if (seen.has(id)) {
            return { chain, stoppedReason: "cycle" };
        }
        seen.add(id);

        if (!(id in model.nodes)) {
            return { chain, stoppedReason: "missing", badId: id };
        }
        const node: BridgeNode = model.nodes[id];

        chain.push(node);
        id = node.next;
    }

    return { chain, stoppedReason: "end" };
}

/** `head -> [5] -> [8] -> null` */
function formatSingly(model: LinkedListModel, chain: BridgeNode[], stoppedReason: string, badId?: string): string {
    if (model.headId === null) {
        return "head -> null";
    }

    let out = "head";
    for (const n of chain) {
        out += ` -> [${n.value}]`;
    }

    if (stoppedReason === "missing" && badId !== undefined) {
        out += ` -> (? missing node "${badId}")`;
        return out;
    }
    if (stoppedReason === "cycle") {
        out += " -> (cycle: next chain repeats)";
        return out;
    }

    out += " -> null";
    return out;
}

function valueLabel(model: LinkedListModel, id: string): string {
    if (!(id in model.nodes)) {
        return id;
    }
    const n: BridgeNode = model.nodes[id];
    return String(n.value);
}

/** `null <- [5] <-> [8] <-> [12] -> null` */
function formatDoubly(
    model: LinkedListModel,
    chain: BridgeNode[],
    stoppedReason: string,
    badId?: string,
): string {
    if (chain.length === 0) {
        return "head -> null";
    }

    const leftOfFirst = chain[0].prev === null ? "null" : `[${valueLabel(model, chain[0].prev)}]`;
    let out = `${leftOfFirst} <- [${chain[0].value}]`;

    for (let i = 1; i < chain.length; i++) {
        out += ` <-> [${chain[i].value}]`;
    }

    const last = chain[chain.length - 1];
    if (stoppedReason === "missing" && badId !== undefined) {
        out += ` <-> (? missing node "${badId}")`;
        return out;
    }
    if (stoppedReason === "cycle") {
        out += " <-> (cycle: next chain repeats)";
        return out;
    }

    out += last.next === null ? " -> null" : ` -> [${valueLabel(model, last.next)}]`;
    return out;
}

/**
 * One-line picture of the list along the `next` chain from `head`.
 * Use this for the live code / instruction panel.
 */
export function codeBridgeDiagram(model: LinkedListModel): string {
    const { chain, stoppedReason, badId } = collectForwardChain(model);

    if (stoppedReason === "empty") {
        return "head -> null";
    }

    if (stoppedReason === "missing" && chain.length === 0) {
        return `head -> (? missing node "${badId ?? "?"}")`;
    }

    if (model.kind === "singly") {
        return formatSingly(model, chain, stoppedReason, badId);
    }

    return formatDoubly(model, chain, stoppedReason, badId);
}

/**
 * Short comment you can show above generated code in the UI.
 */
export function codeHeadComment(model: LinkedListModel): string {
    return `// Linked list (${model.kind}) from head along .next`;
}
