import type { LinkedListModel, NodeId } from "../model/linked-list-model";

/** Something is wrong with pointers or head; use for red rope / error UI. */
export type StructureIssue =
    | { kind: "bad_head"; headId: NodeId }
    | { kind: "dangling_next"; nodeId: NodeId; targetId: NodeId }
    | { kind: "dangling_prev"; nodeId: NodeId; targetId: NodeId }
    | { kind: "doubly_next_not_backlinked"; fromId: NodeId; toId: NodeId }
    | { kind: "doubly_prev_not_forwardlinked"; fromId: NodeId; toId: NodeId }
    | { kind: "unreachable_from_head"; nodeId: NodeId };

export type StructureValidation = {
    ok: boolean;
    issues: StructureIssue[];
};

export type ValidateStructureOptions = {
    /**
     * When true, every node on the board must lie on the forward `.next`
     * path from `head` (no separate island tiles). Turn on for “fully connected bridge” checks.
     */
    requireReachableFromHead?: boolean;
};

function collectReachableViaNext(model: LinkedListModel): Set<NodeId> {
    const reachable = new Set<NodeId>();
    if (model.headId === null) {
        return reachable;
    }
    let id: string | null = model.headId;
    while (id !== null) {
        if (!(id in model.nodes)) {
            break;
        }
        if (reachable.has(id)) {
            break;
        }
        reachable.add(id);
        id = model.nodes[id].next;
    }
    return reachable;
}

/**
 * Check that non-null `next` / `prev` ids exist, `head` is valid, and (for doubly)
 * each link is mirrored. Optionally require every tile to be reachable from `head` via `next`.
 */
export function validateLinkedListStructure(
    model: LinkedListModel,
    options: ValidateStructureOptions = {},
): StructureValidation {
    const issues: StructureIssue[] = [];

    if (model.headId !== null && !(model.headId in model.nodes)) {
        issues.push({ kind: "bad_head", headId: model.headId });
    }

    for (const nodeId of Object.keys(model.nodes)) {
        const node = model.nodes[nodeId];

        if (node.next !== null && !(node.next in model.nodes)) {
            issues.push({ kind: "dangling_next", nodeId, targetId: node.next });
        }
        if (node.prev !== null && !(node.prev in model.nodes)) {
            issues.push({ kind: "dangling_prev", nodeId, targetId: node.prev });
        }
    }

    if (model.kind === "doubly") {
        for (const nodeId of Object.keys(model.nodes)) {
            const a = model.nodes[nodeId];

            if (a.next !== null && a.next in model.nodes) {
                const b = model.nodes[a.next];
                if (b.prev !== nodeId) {
                    issues.push({
                        kind: "doubly_next_not_backlinked",
                        fromId: nodeId,
                        toId: a.next,
                    });
                }
            }

            if (a.prev !== null && a.prev in model.nodes) {
                const p = model.nodes[a.prev];
                if (p.next !== nodeId) {
                    issues.push({
                        kind: "doubly_prev_not_forwardlinked",
                        fromId: nodeId,
                        toId: a.prev,
                    });
                }
            }
        }
    }

    if (options.requireReachableFromHead === true) {
        const reachable = collectReachableViaNext(model);
        for (const nodeId of Object.keys(model.nodes)) {
            if (!reachable.has(nodeId)) {
                issues.push({ kind: "unreachable_from_head", nodeId });
            }
        }
    }

    return { ok: issues.length === 0, issues };
}
