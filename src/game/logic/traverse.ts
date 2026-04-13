import type { LinkedListModel, NodeId } from "../model/linked-list-model";

/** One hop in code like `head.next` or `current.prev`. */
export type TraversalStep = "next" | "prev";

export type TraverseOk = { ok: true; nodeId: NodeId };

export type TraverseErrReason =
    | "no_head"
    | "head_missing"
    | "missing_node"
    | "null_pointer"
    | "prev_on_singly";

export type TraverseErr = {
    ok: false;
    reason: TraverseErrReason;
    /** Index of the step that failed (0-based), or `0` for errors before any step. */
    stepIndex: number;
};

export type TraverseResult = TraverseOk | TraverseErr;

/**
 * Start at `startNodeId` and follow `.next` / `.prev` for each step.
 * Singly-linked lists cannot use `"prev"`.
 */
export function traverseFromNode(
    model: LinkedListModel,
    startNodeId: NodeId,
    steps: readonly TraversalStep[],
): TraverseResult {
    if (!(startNodeId in model.nodes)) {
        return { ok: false, reason: "missing_node", stepIndex: 0 };
    }

    let current: NodeId = startNodeId;

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!(current in model.nodes)) {
            return { ok: false, reason: "missing_node", stepIndex: i };
        }
        const node = model.nodes[current];

        if (step === "next") {
            if (node.next === null) {
                return { ok: false, reason: "null_pointer", stepIndex: i };
            }
            if (!(node.next in model.nodes)) {
                return { ok: false, reason: "missing_node", stepIndex: i };
            }
            current = node.next;
            continue;
        }

        if (model.kind === "singly") {
            return { ok: false, reason: "prev_on_singly", stepIndex: i };
        }
        if (node.prev === null) {
            return { ok: false, reason: "null_pointer", stepIndex: i };
        }
        if (!(node.prev in model.nodes)) {
            return { ok: false, reason: "missing_node", stepIndex: i };
        }
        current = node.prev;
    }

    return { ok: true, nodeId: current };
}

/**
 * Start at `model.headId` and follow `.next` / `.prev` for each step.
 * Singly-linked lists cannot use `"prev"`.
 * Empty `steps` means "stay on the node `head` points to".
 */
export function traverseFromHead(
    model: LinkedListModel,
    steps: readonly TraversalStep[],
): TraverseResult {
    if (model.headId === null) {
        return { ok: false, reason: "no_head", stepIndex: 0 };
    }
    if (!(model.headId in model.nodes)) {
        return { ok: false, reason: "head_missing", stepIndex: 0 };
    }

    return traverseFromNode(model, model.headId, steps);
}
