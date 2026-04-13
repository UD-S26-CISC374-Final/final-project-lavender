/**
 * Linked Lunacy — core data for the bridge / linked list.
 *
 * The game scene will change this model when the player drags tiles or pointers.
 * Other modules will turn this into code text and check answers.
 */

export type ListKind = "singly" | "doubly";

/** Stable id for each node (matches keys in `nodes`). */
export type NodeId = string;

export interface BridgeNode {
    id: NodeId;
    /** Shown on the tile (the "data" in a node). */
    value: number;
    next: NodeId | null;
    /** Only used when `kind` is "doubly"; ignored for singly lists in validation. */
    prev: NodeId | null;
}

export interface LinkedListModel {
    kind: ListKind;
    /** First node for traversal puzzles; may be null if the list is empty. */
    headId: NodeId | null;
    /** All nodes currently on the board (connected or not). */
    nodes: Record<NodeId, BridgeNode>;
}

export function emptyModel(kind: ListKind): LinkedListModel {
    return { kind, headId: null, nodes: {} };
}

export function addNode(
    model: LinkedListModel,
    node: BridgeNode,
): LinkedListModel {
    return {
        ...model,
        nodes: { ...model.nodes, [node.id]: { ...node } },
    };
}

/**
 * Returns a shallow copy with `headId` updated.
 * Does not change pointer fields; gameplay code should set `next` / `prev`.
 */
export function setHead(
    model: LinkedListModel,
    headId: NodeId | null,
): LinkedListModel {
    return { ...model, headId };
}

/**
 * Rebuild `.next` and `headId` from left-to-right order (e.g. after the player reorders planks).
 * `orderedIds` must be a permutation of every key in `model.nodes`. Singly-linked only.
 */
export function rechainSinglyInOrder(
    model: LinkedListModel,
    orderedIds: readonly NodeId[],
): LinkedListModel {
    if (model.kind !== "singly") {
        return model;
    }

    const keys = Object.keys(model.nodes);
    if (orderedIds.length !== keys.length) {
        return model;
    }

    const keySet = new Set(keys);
    for (const id of orderedIds) {
        if (!keySet.has(id)) {
            return model;
        }
    }

    const nodes: Record<NodeId, BridgeNode> = { ...model.nodes };
    for (let i = 0; i < orderedIds.length; i++) {
        const id = orderedIds[i];
        if (!id) {
            return model;
        }
        const old = nodes[id];
        const nextId =
            i < orderedIds.length - 1 ? (orderedIds[i + 1] ?? null) : null;
        nodes[id] = { ...old, next: nextId, prev: null };
    }

    const headId = orderedIds[0] ?? null;
    return { ...model, headId, nodes };
}
