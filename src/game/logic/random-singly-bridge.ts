import type {
    BridgeNode,
    LinkedListModel,
    NodeId,
} from "../model/linked-list-model";
import { addNode, emptyModel, setHead } from "../model/linked-list-model";
import { getForwardChainNodeIds } from "./forward-chain";
import { traverseFromHead, type TraversalStep } from "./traverse";

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickUniqueRandomValues(
    count: number,
    min: number,
    max: number,
): number[] {
    const values: number[] = [];
    for (let v = min; v <= max; v++) {
        values.push(v);
    }
    for (let i = values.length - 1; i > 0; i--) {
        const j = randInt(0, i);
        const tmp = values[i];
        values[i] = values[j] ?? values[i];
        values[j] = tmp;
    }
    return values.slice(0, Math.max(0, Math.min(count, values.length)));
}

/**
 * Builds a valid singly-linked chain n0 → n1 → … with random values (good for auto puzzles).
 * Length is clamped to 1–12 so the level stays readable.
 */
export function generateRandomSinglyChain(length: number): LinkedListModel {
    const n = Math.max(1, Math.min(Math.floor(length), 12));
    let model = emptyModel("singly");
    const ids = Array.from({ length: n }, (_, i) => `n${i}`);
    const uniqueValues = pickUniqueRandomValues(n, 1, 99);

    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (!id) {
            continue;
        }
        const nextId = i < n - 1 ? (ids[i + 1] ?? null) : null;
        const value = uniqueValues[i] ?? i + 1;
        const node: BridgeNode = {
            id,
            value,
            next: nextId,
            prev: null,
        };
        model = addNode(model, node);
    }

    const head = ids[0];
    return head ? setHead(model, head) : model;
}

/**
 * Builds a valid doubly-linked chain n0 <-> n1 <-> ... with unique random values.
 * Length is clamped to 2-12.
 */
export function generateRandomDoublyChain(length: number): LinkedListModel {
    const n = Math.max(2, Math.min(Math.floor(length), 12));
    let model = emptyModel("doubly");
    const ids = Array.from({ length: n }, (_, i) => `n${i}`);
    const uniqueValues = pickUniqueRandomValues(n, 1, 99);

    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (!id) {
            continue;
        }
        const nextId = i < n - 1 ? (ids[i + 1] ?? null) : null;
        const prevId = i > 0 ? (ids[i - 1] ?? null) : null;
        const value = uniqueValues[i] ?? i + 1;
        const node: BridgeNode = {
            id,
            value,
            next: nextId,
            prev: prevId,
        };
        model = addNode(model, node);
    }

    const head = ids[0];
    return head ? setHead(model, head) : model;
}

/** A few `.next` hops that fit the current forward chain (for demo / auto tasks). */
export function pickDemoNextSteps(
    model: LinkedListModel,
    maxSteps: number,
): TraversalStep[] {
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

export type GeneratedIndexedTraversalTask = {
    model: LinkedListModel;
    startNodeId: NodeId;
    steps: TraversalStep[];
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

/**
 * Random chain, then a random number of `.next` hops in `[1, chainLength - 1]`
 * (when the forward chain from head has at least 2 nodes). Every hop is valid and lands on an existing node — never more `.next`s than the list allows.
 */
export function generateSinglyChainWithBoundedNextHops(
    length: number,
): GeneratedSinglyTask {
    const model = generateRandomSinglyChain(length);
    const chain = getForwardChainNodeIds(model);
    const maxHops = chain.length - 1;
    if (maxHops < 1) {
        return { model, steps: [], answerNodeId: firstNodeId(model) };
    }
    const hopCount = randInt(1, maxHops);
    const steps: TraversalStep[] = Array.from(
        { length: hopCount },
        () => "next",
    );
    const result = traverseFromHead(model, steps);
    const answerNodeId = result.ok ? result.nodeId : firstNodeId(model);
    return { model, steps, answerNodeId };
}

/**
 * Random doubly-linked chain and a valid mixed `.next`/`.prev` traversal
 * that starts at a random node (not head/tail when possible).
 */
export function generateIndexedDoublyTraversalTask(
    length: number,
): GeneratedIndexedTraversalTask {
    const model = generateRandomDoublyChain(length);
    const chain = getForwardChainNodeIds(model);
    const n = chain.length;
    const minStart = n > 2 ? 1 : 0;
    const maxStart = n > 2 ? n - 2 : n - 1;
    const startIndex = randInt(minStart, maxStart);
    const startNodeId = chain[startIndex] ?? "";

    const maxSteps = Math.max(2, Math.min(4, n + 1));
    let steps: TraversalStep[] = [];
    for (let attempt = 0; attempt < 8; attempt++) {
        const stepsCount = randInt(2, maxSteps);
        const nextSteps: TraversalStep[] = [];
        let cursor = startIndex;
        for (let i = 0; i < stepsCount; i++) {
            const canPrev = cursor > 0;
            const canNext = cursor < n - 1;
            let step: TraversalStep = "next";
            if (canPrev && canNext) {
                step = randInt(0, 1) === 0 ? "next" : "prev";
            } else if (canPrev) {
                step = "prev";
            }
            nextSteps.push(step);
            cursor += step === "next" ? 1 : -1;
        }
        if (nextSteps.includes("prev")) {
            steps = nextSteps;
            break;
        }
        if (attempt === 7) {
            steps = nextSteps;
        }
    }

    let cursor = startIndex;
    for (const step of steps) {
        cursor += step === "next" ? 1 : -1;
    }
    const answerNodeId = chain[cursor] ?? startNodeId;
    return { model, startNodeId, steps, answerNodeId };
}
