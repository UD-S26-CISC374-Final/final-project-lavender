import type { LinkedListModel, NodeId } from "../model/linked-list-model";

/** Ordered node ids along `.next` from `head`, stopping at null, a gap, or a cycle. */
export function getForwardChainNodeIds(model: LinkedListModel): NodeId[] {
    const ids: NodeId[] = [];
    if (model.headId === null) {
        return ids;
    }

    const seen = new Set<string>();
    let id: string | null = model.headId;

    while (id !== null) {
        if (seen.has(id)) {
            break;
        }
        seen.add(id);
        if (!(id in model.nodes)) {
            break;
        }
        ids.push(id);
        id = model.nodes[id].next;
    }

    return ids;
}
