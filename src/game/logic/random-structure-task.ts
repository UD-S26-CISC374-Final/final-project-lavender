import type {
    BridgeNode,
    LinkedListModel,
    NodeId,
} from "../model/linked-list-model";
import {
    generateRandomDoublyChain,
    generateRandomSinglyChain,
} from "./random-singly-bridge";
import { getForwardChainNodeIds } from "./forward-chain";

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export type StructureKind = "singly" | "doubly";

export type StructureIdentifyTask = {
    model: LinkedListModel;
    /** The correct answer the player must choose. */
    expectedKind: StructureKind;
};

/**
 * Randomly produces either a singly or doubly linked chain for the player
 * to inspect and classify.
 */
export function generateStructureIdentifyTask(): StructureIdentifyTask {
    const chainLength = randInt(3, 6);
    const isDoubly = randInt(0, 1) === 1;
    const model =
        isDoubly ?
            generateRandomDoublyChain(chainLength)
        :   generateRandomSinglyChain(chainLength);
    return { model, expectedKind: isDoubly ? "doubly" : "singly" };
}

export type DeleteByValueTask = {
    model: LinkedListModel;
    /** Value that appears on exactly one tile; the tile with this value is the correct pick. */
    targetValue: number;
    /** The tile to be deleted. */
    answerNodeId: NodeId;
    /** Tile whose `.next` must be reassigned to skip the deleted tile (or null if the head is being deleted). */
    predecessorNodeId: NodeId | null;
    /** Tile that the predecessor's `.next` must point at after deletion (or null if the deleted tile was the tail). */
    successorNodeId: NodeId | null;
};

/**
 * Builds a singly chain and chooses a non-endpoint (when possible) tile as
 * the target so the deletion question always requires repairing neighboring pointers.
 * Returns enough info for the level to animate the deletion (the predecessor and
 * successor of the deleted tile).
 */
export function generateDeleteByValueTask(): DeleteByValueTask {
    const chainLength = randInt(4, 6);
    const model = generateRandomSinglyChain(chainLength);
    const chain = getForwardChainNodeIds(model);

    const firstSelectable = chain.length >= 3 ? 1 : 0;
    const lastSelectable = Math.max(
        firstSelectable,
        chain.length >= 3 ? chain.length - 2 : chain.length - 1,
    );
    const pickIndex = randInt(firstSelectable, lastSelectable);
    const targetId = chain[pickIndex];
    const predecessorId = pickIndex > 0 ? chain[pickIndex - 1] : null;
    const successorId =
        pickIndex < chain.length - 1 ? chain[pickIndex + 1] : null;
    const targetNode = model.nodes[targetId];
    const targetValue = targetNode.value;

    return {
        model,
        targetValue,
        answerNodeId: targetId,
        predecessorNodeId: predecessorId,
        successorNodeId: successorId,
    };
}

export type PredecessorClickTask = {
    model: LinkedListModel;
    /** Value of the tile the player must find the predecessor of. */
    targetValue: number;
    /** The tile that comes immediately BEFORE the tile with `targetValue`. */
    answerNodeId: NodeId;
};

/**
 * Builds a singly chain and asks the player to walk Alex to the node that
 * comes BEFORE the tile with a given value. Conceptually this is "find the
 * predecessor pointer that delete-by-value would have to update."
 */
export function generatePredecessorClickTask(): PredecessorClickTask {
    const chainLength = randInt(4, 6);
    const model = generateRandomSinglyChain(chainLength);
    const chain = getForwardChainNodeIds(model);

    // Pick a target that isn't the head (so a predecessor exists).
    const targetIndex = randInt(1, Math.max(1, chain.length - 1));
    const targetId = chain[targetIndex];
    const targetNode = model.nodes[targetId];
    const targetValue = targetNode.value;
    const predecessorId = chain[targetIndex - 1];

    return { model, targetValue, answerNodeId: predecessorId };
}

export type InsertAfterTask = {
    model: LinkedListModel;
    /** Value of the incoming tile that must be placed in sorted order. */
    insertValue: number;
    /** The predecessor node — the tile the player must click. */
    answerNodeId: NodeId;
};

function pickSortedGappedValues(n: number): number[] {
    const values: number[] = [];
    let current = randInt(1, 10);
    for (let i = 0; i < n; i++) {
        values.push(current);
        current += randInt(3, 8);
    }
    return values;
}

/**
 * Builds a sorted singly chain with guaranteed integer gaps between consecutive
 * values, then chooses one gap for the new tile so the player must click the
 * correct predecessor node.
 */
export function generateInsertAfterTask(): InsertAfterTask {
    const n = randInt(4, 6);
    const values = pickSortedGappedValues(n);
    const ids: NodeId[] = Array.from({ length: n }, (_, i) => `n${i}`);

    const nodes: Record<NodeId, BridgeNode> = {};
    for (let i = 0; i < n; i++) {
        const id = ids[i];
        if (!id) {
            continue;
        }
        const value = values[i] ?? i + 1;
        const nextId = i < n - 1 ? (ids[i + 1] ?? null) : null;
        nodes[id] = { id, value, next: nextId, prev: null };
    }

    const model: LinkedListModel = {
        kind: "singly",
        headId: ids[0] ?? null,
        nodes,
    };

    const gapIndex = randInt(0, n - 2);
    const leftId = ids[gapIndex];
    const leftVal = values[gapIndex];
    const rightVal = values[gapIndex + 1];
    const insertValue = randInt(leftVal + 1, rightVal - 1);

    return { model, insertValue, answerNodeId: leftId };
}
