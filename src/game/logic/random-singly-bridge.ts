import type { BridgeNode, LinkedListModel, NodeId } from "../model/linked-list-model";
import { addNode, emptyModel, setHead } from "../model/linked-list-model";
import { getForwardChainNodeIds } from "./forward-chain";
import { traverseFromHead, type TraversalStep } from "./traverse";

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Builds a valid singly-linked chain n0 → n1 → … with random values (good for auto puzzles).
 * Length is clamped to 1–12 so the level stays readable.
 */
export function generateRandomSinglyChain(length: number): LinkedListModel {
    const n = Math.max(1, Math.min(Math.floor(length), 12));
    let model = emptyModel("singly");
    const ids = Array.from({ length: n }, (_, i) => `n${i}`);

    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (!id) {
            continue;
        }
        const nextId = i < n - 1 ? ids[i + 1] ?? null : null;
        const node: BridgeNode = {
            id,
            value: randInt(1, 99),
            next: nextId,
            prev: null,
        };
        model = addNode(model, node);
    }

    const head = ids[0];
    return head ? setHead(model, head) : model;
}

/** A few `.next` hops that fit the current forward chain (for demo / auto tasks). */
export function pickDemoNextSteps(model: LinkedListModel, maxSteps: number): TraversalStep[] {
    const chain = getForwardChainNodeIds(model);
    const possible = Math.max(0, chain.length - 1);
    const count = Math.min(maxSteps, possible);
    return Array.from({ length: count }, () => "next" as TraversalStep);
}

export type GeneratedSinglyTask = {
    model: LinkedListModel;
    steps: TraversalStep[];
    /** Node id after running `traverseFromHead(model, steps)` (the “compiler” answer). */
    answerNodeId: NodeId;
};

function firstNodeId(model: LinkedListModel): NodeId {
    return model.headId ?? "";
}

/**
 * Random chain plus traversal steps and the node id your logic should reach (no `eval`).
 */
export function generateSinglyChainWithTraversalTask(
    length: number,
    maxSteps = 2,
): GeneratedSinglyTask {
    const model = generateRandomSinglyChain(length);
    const steps = pickDemoNextSteps(model, maxSteps);
    const result = traverseFromHead(model, steps);
    const answerNodeId = result.ok ? result.nodeId : firstNodeId(model);
    return { model, steps, answerNodeId };
}
