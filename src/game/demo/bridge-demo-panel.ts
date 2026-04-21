import { codeBridgeDiagram, codeHeadComment } from "../logic/code-from-model";
import {
    traverseFromHead,
    traverseFromNode,
    type TraversalStep,
    type TraverseResult,
} from "../logic/traverse";

/** One-line task text for the level (Phaser overlay + panel header). */
export function buildTraversalQuestionLine(
    steps: readonly TraversalStep[],
): string {
    if (steps.length === 0) {
        return "Starting at head, follow no hops. Which node id do you reach?";
    }
    const path = steps.map((s) => `->${s}`).join("");
    return `Starting at head, follow ${path}. Which node id do you reach?`;
}

export function buildDragHintLine(): string {
    return "Drag planks sideways to reorder. When you release, the leftmost plank becomes head and the list below updates.";
}
import {
    validateLinkedListStructure,
    type StructureIssue,
} from "../logic/validate-structure";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";

/** React (or other UI) listens for this to show live list / checks. */
export const BRIDGE_DEMO_PANEL_EVENT = "bridge-demo-panel";

export type BridgeDemoPanelPayload = {
    questionLine: string;
    dragHintLine: string;
    codeHintLine: string;
    /** Live code: comment + diagram update when the list changes. */
    comment: string;
    diagram: string;
    traversalDescription: string;
    traversalOutcome: string;
    /** Same traversal checked against an expected node id (your “compiler” / grader). */
    verificationLine: string;
    structureOk: boolean;
    structureLines: string;
};

/** Same shape as the EGDD example: head -> [5] -> [8] -> [12] -> null */
export function buildDemoSinglyList(): LinkedListModel {
    return {
        kind: "singly",
        headId: "a",
        nodes: {
            a: { id: "a", value: 5, next: "b", prev: null },
            b: { id: "b", value: 8, next: "c", prev: null },
            c: { id: "c", value: 12, next: null, prev: null },
        },
    };
}

function formatIssueLine(issue: StructureIssue): string {
    switch (issue.kind) {
        case "bad_head":
            return `  - ${issue.kind} (headId=${issue.headId})`;
        case "dangling_next":
        case "dangling_prev":
            return `  - ${issue.kind} (from=${issue.nodeId} → missing ${issue.targetId})`;
        case "doubly_next_not_backlinked":
            return `  - ${issue.kind} (${issue.fromId} → ${issue.toId})`;
        case "doubly_prev_not_forwardlinked":
            return `  - ${issue.kind} (${issue.fromId} ← ${issue.toId})`;
        case "unreachable_from_head":
            return `  - ${issue.kind} (${issue.nodeId})`;
    }
}

function formatStructureIssues(model: LinkedListModel): {
    structureOk: boolean;
    structureLines: string;
} {
    const loose = validateLinkedListStructure(model);
    const strict = validateLinkedListStructure(model, {
        requireReachableFromHead: true,
    });

    const lines: string[] = [
        `Pointer / head checks: ${loose.ok ? "OK" : `${loose.issues.length} issue(s)`}`,
    ];
    if (!loose.ok) {
        for (const issue of loose.issues) {
            lines.push(formatIssueLine(issue));
        }
    }
    lines.push(
        `Every tile reachable from head (via ->next): ${strict.ok ? "OK" : `${strict.issues.length} issue(s)`}`,
    );
    if (!strict.ok) {
        for (const issue of strict.issues) {
            lines.push(formatIssueLine(issue));
        }
    }

    return {
        structureOk: loose.ok && strict.ok,
        structureLines: lines.join("\n"),
    };
}

function formatVerificationLine(
    tr: TraverseResult,
    expectedAnswerNodeId: NodeId | undefined,
    model: LinkedListModel,
): string {
    if (expectedAnswerNodeId === undefined) {
        return "Compiler check: (no expected node — pass expectedAnswerNodeId to grade).";
    }
    if (!tr.ok) {
        return `Compiler check: FAIL — traversal errored (${tr.reason}) before comparing to expected "${expectedAnswerNodeId}".`;
    }
    const match = tr.nodeId === expectedAnswerNodeId;
    if (!match) {
        return `Compiler check: FAIL — got "${tr.nodeId}", expected "${expectedAnswerNodeId}".`;
    }
    const v = model.nodes[tr.nodeId].value;
    return `Compiler check: PASS — landed on "${tr.nodeId}" (value ${v}), matches expected.`;
}

/**
 * Fills the side panel: diagram from the model, traversal steps, structure validation,
 * and an optional expected node id for the same “compiler” logic the game can use to grade.
 */
export function buildBridgeDemoPanelPayload(
    model: LinkedListModel,
    steps: readonly TraversalStep[],
    expectedAnswerNodeId?: NodeId,
    overrides?: {
        questionLine?: string;
        dragHintLine?: string;
        codeHintLine?: string;
        traversalStartNodeId?: NodeId;
        traversalStartLabel?: string;
        traversalDescription?: string;
        traversalOutcome?: string;
        verificationLine?: string;
    },
): BridgeDemoPanelPayload {
    const questionLine =
        overrides?.questionLine ?? buildTraversalQuestionLine(steps);
    const dragHintLine = overrides?.dragHintLine ?? buildDragHintLine();
    const codeHintLine =
        overrides?.codeHintLine ?? "// No code hint for this prompt yet.";
    const comment = codeHeadComment(model);
    const diagram = codeBridgeDiagram(model);

    const traversalStartNodeId = overrides?.traversalStartNodeId;
    const startLabel = overrides?.traversalStartLabel ?? "head";
    const tr =
        traversalStartNodeId !== undefined ?
            traverseFromNode(model, traversalStartNodeId, steps)
        :   traverseFromHead(model, steps);
    const defaultTraversalDescription = `Traversal: ${startLabel}${steps.map((s) => `->${s}`).join("")}`;

    let defaultTraversalOutcome: string;
    if (tr.ok) {
        if (!(tr.nodeId in model.nodes)) {
            defaultTraversalOutcome = `Unexpected: missing node "${tr.nodeId}"`;
        } else {
            const v = model.nodes[tr.nodeId].value;
            defaultTraversalOutcome = `Lands on node "${tr.nodeId}" (value ${v})`;
        }
    } else {
        defaultTraversalOutcome = `Cannot complete: ${tr.reason} (step index ${tr.stepIndex})`;
    }

    const defaultVerificationLine = formatVerificationLine(
        tr,
        expectedAnswerNodeId,
        model,
    );
    const { structureOk, structureLines } = formatStructureIssues(model);

    return {
        questionLine,
        dragHintLine,
        codeHintLine,
        comment,
        diagram,
        traversalDescription:
            overrides?.traversalDescription ?? defaultTraversalDescription,
        traversalOutcome:
            overrides?.traversalOutcome ?? defaultTraversalOutcome,
        verificationLine:
            overrides?.verificationLine ?? defaultVerificationLine,
        structureOk,
        structureLines,
    };
}
