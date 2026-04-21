import Phaser, { Scene } from "phaser";
import { EventBus } from "../event-bus";

import {
    BRIDGE_DEMO_PANEL_EVENT,
    buildBridgeDemoPanelPayload,
} from "../demo/bridge-demo-panel";
import type { TraversalStep } from "../logic/traverse";
import type { TraverseResult } from "../logic/traverse";
import { traverseFromHead, traverseFromNode } from "../logic/traverse";
import {
    generateIndexedDoublyTraversalTask,
    generateSinglyChainWithBoundedNextHops,
    generateSinglyChainWithTraversalTask,
} from "../logic/random-singly-bridge";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";
import { BridgePlaceholderView } from "../objects/bridge-placeholder-view";
import { getForwardChainNodeIds } from "../logic/forward-chain";

type Level1QuestionType =
    | "traversal_click"
    | "drag_largest_to_last"
    | "indexed_prev_click";

type RoundTask = {
    model: LinkedListModel;
    steps: TraversalStep[];
    answerNodeId: NodeId;
    type: Level1QuestionType;
    questionLine: string;
    codeHintLine: string;
    traversalStartNodeId?: NodeId;
    traversalStartLabel?: string;
};

export class Level1 extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    hintText: Phaser.GameObjects.Text;
    private scoreboardText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;
    private submitButton!: Phaser.GameObjects.Text;
    private bridgeView: BridgePlaceholderView;
    private taskSteps: TraversalStep[] = [];
    private taskAnswerNodeId: NodeId = "";
    private currentModel: LinkedListModel | null = null;
    private currentQuestionType: Level1QuestionType = "traversal_click";
    private currentQuestionLine = "";
    private currentCodeHintLine = "";
    private currentTraversalStartNodeId?: NodeId;
    private currentTraversalStartLabel?: string;
    private currentNodeLabels = new Map<NodeId, string>();
    private dragBaseNodeLabels = new Map<NodeId, string>();
    private dragBaseOrder: NodeId[] = [];
    private selectedNodeId: NodeId | null = null;
    private correctCount = 0;
    private incorrectCount = 0;
    private player?: Phaser.Physics.Arcade.Sprite;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private readonly bridgePlayerY = 365;

    constructor() {
        super("Level1");
        this.bridgeView = new BridgePlaceholderView(this);
    }

    private buildTraversalClickQuestion(): RoundTask {
        const chainLength = Phaser.Math.Between(3, 6);
        const task = generateSinglyChainWithBoundedNextHops(chainLength);
        const hops = task.steps.map((step) => `->${step}`).join("");
        return {
            model: task.model,
            steps: task.steps,
            answerNodeId: task.answerNodeId,
            type: "traversal_click",
            questionLine: `Move Alex to the tile he will land on if he travels head${hops}, then press Submit.`,
            codeHintLine: `let node = head${hops};`,
        };
    }

    private buildNodeLabels(model: LinkedListModel): Map<NodeId, string> {
        const chain = getForwardChainNodeIds(model);
        const labels = new Map<NodeId, string>();
        for (let i = 0; i < chain.length; i++) {
            const id = chain[i];
            if (!id) {
                continue;
            }
            labels.set(id, `n${i + 1}`);
        }
        return labels;
    }

    private buildDisplayLabels(model: LinkedListModel): Map<NodeId, string> {
        const labels = this.buildNodeLabels(model);
        const chain = getForwardChainNodeIds(model);
        const headId = model.headId;
        const tailId = chain.length > 0 ? chain[chain.length - 1] : null;
        if (headId !== null) {
            labels.set(headId, "head");
        }
        if (tailId !== null) {
            labels.set(tailId, "tail");
        }
        return labels;
    }

    private labelForNode(
        model: LinkedListModel,
        nodeId: NodeId,
        labels: Map<NodeId, string>,
    ): string {
        const chain = getForwardChainNodeIds(model);
        const headId = model.headId;
        const tailId = chain.length > 0 ? chain[chain.length - 1] : null;
        if (nodeId === headId) {
            return "head";
        }
        if (nodeId === tailId) {
            return "tail";
        }
        return labels.get(nodeId) ?? nodeId;
    }

    private buildIndexedPrevClickQuestion(): RoundTask {
        const chainLength = Phaser.Math.Between(4, 6);
        const task = generateIndexedDoublyTraversalTask(chainLength);
        const labels = this.buildNodeLabels(task.model);
        const startLabel = this.labelForNode(
            task.model,
            task.startNodeId,
            labels,
        );
        const path = task.steps.map((step) => `->${step}`).join("");
        return {
            model: task.model,
            steps: task.steps,
            answerNodeId: task.answerNodeId,
            type: "indexed_prev_click",
            questionLine: `Move Alex to the node at ${startLabel}${path}, then press Submit.`,
            codeHintLine: `let node = ${startLabel}${path};`,
            traversalStartNodeId: task.startNodeId,
            traversalStartLabel: startLabel,
        };
    }

    private buildLargestToLastQuestion(): RoundTask {
        const chainLength = Phaser.Math.Between(4, 6);
        const task = generateSinglyChainWithTraversalTask(chainLength, 0);
        const chainIds = getForwardChainNodeIds(task.model);
        const largestNodeId = this.findLargestNodeId(chainIds, task.model);
        return {
            model: task.model,
            steps: [],
            answerNodeId: largestNodeId,
            type: "drag_largest_to_last",
            questionLine:
                "Move the tile with the largest value to the last node.",
            codeHintLine: this.buildCodeHintLine(task.model, largestNodeId),
        };
    }

    private findLargestNodeId(
        chainIds: readonly NodeId[],
        model: LinkedListModel,
    ): NodeId {
        let largestId = model.headId ?? "";
        if (chainIds.length > 0) {
            largestId = chainIds[0] ?? largestId;
        }
        let largestValue = Number.NEGATIVE_INFINITY;
        for (const id of chainIds) {
            const node = model.nodes[id];
            if (node.value > largestValue) {
                largestValue = node.value;
                largestId = id;
            }
        }
        return largestId;
    }

    private buildCodeHintLine(
        model: LinkedListModel,
        targetNodeId: NodeId,
    ): string {
        const chain = getForwardChainNodeIds(model);
        const index = chain.indexOf(targetNodeId);
        if (index <= 0) {
            return "let node = head;";
        }
        let line = "let node = head";
        for (let i = 0; i < index; i++) {
            line += "->next";
        }
        return `${line};`;
    }

    private createRoundTask(): RoundTask {
        const roll = Phaser.Math.Between(0, 2);
        const type: Level1QuestionType =
            roll === 0 ? "traversal_click"
            : roll === 1 ? "drag_largest_to_last"
            : "indexed_prev_click";
        return (
            type === "traversal_click" ? this.buildTraversalClickQuestion()
            : type === "drag_largest_to_last" ?
                this.buildLargestToLastQuestion()
            :   this.buildIndexedPrevClickQuestion()
        );
    }

    private buildDragMovementCodeHint(
        model: LinkedListModel,
        movedNodeId: NodeId,
    ): string {
        const movedLabel =
            this.dragBaseNodeLabels.get(movedNodeId) ?? movedNodeId;
        const currentOrder = getForwardChainNodeIds(model);
        const fromIndex = this.dragBaseOrder.indexOf(movedNodeId);
        const toIndex = currentOrder.indexOf(movedNodeId);
        if (fromIndex < 0 || toIndex < 0) {
            return `let ${movedLabel} = ${movedLabel};`;
        }
        const delta = toIndex - fromIndex;
        if (delta <= 0) {
            return `let ${movedLabel} = ${movedLabel}; // moved ${Math.abs(delta)} slot(s) left`;
        }
        const hops = "->next".repeat(delta);
        return `let ${movedLabel} = ${movedLabel}${hops};`;
    }

    private buildDragCompilerStatus(
        model: LinkedListModel,
        movedNodeId: NodeId,
    ): {
        traversalDescription: string;
        traversalOutcome: string;
        verificationLine: string;
    } {
        const movedLabel =
            this.dragBaseNodeLabels.get(movedNodeId) ?? movedNodeId;
        const currentOrder = getForwardChainNodeIds(model);
        const fromIndex = this.dragBaseOrder.indexOf(movedNodeId);
        const toIndex = currentOrder.indexOf(movedNodeId);
        const tailId =
            currentOrder.length > 0 ?
                currentOrder[currentOrder.length - 1]
            :   null;
        const atTail = tailId !== null && tailId === movedNodeId;
        const fromSlot = fromIndex >= 0 ? fromIndex + 1 : 0;
        const toSlot = toIndex >= 0 ? toIndex + 1 : 0;
        return {
            traversalDescription: `Movement: ${movedLabel} from slot ${fromSlot} to slot ${toSlot}`,
            traversalOutcome:
                toIndex >= fromIndex ?
                    `${movedLabel} shifted right by ${Math.max(0, toIndex - fromIndex)} slot(s).`
                :   `${movedLabel} shifted left by ${Math.max(0, fromIndex - toIndex)} slot(s).`,
            verificationLine:
                atTail ?
                    `Compiler check: PASS — ${movedLabel} is now the tail node.`
                :   `Compiler check: FAIL — ${movedLabel} is not at tail yet.`,
        };
    }

    private toDisplayNodeLabel(nodeId: NodeId): string {
        return this.currentNodeLabels.get(nodeId) ?? nodeId;
    }

    private buildTraversalCompilerStatus(model: LinkedListModel): {
        traversalOutcome: string;
        verificationLine: string;
    } {
        const startNodeId = this.currentTraversalStartNodeId;
        const steps: readonly TraversalStep[] = this.taskSteps;
        const tr: TraverseResult =
            startNodeId !== undefined ?
                traverseFromNode(model, startNodeId, steps)
            :   traverseFromHead(model, steps);

        if (!tr.ok) {
            return {
                traversalOutcome: `Cannot complete: ${tr.reason} (step index ${tr.stepIndex})`,
                verificationLine: `Compiler check: FAIL — traversal errored (${tr.reason}).`,
            };
        }
        const landedNode = model.nodes[tr.nodeId];
        const landedLabel = this.toDisplayNodeLabel(tr.nodeId);
        const expectedLabel = this.toDisplayNodeLabel(this.taskAnswerNodeId);
        const traversalOutcome = `Lands on node "${landedLabel}" (value ${landedNode.value})`;
        const verificationLine =
            tr.nodeId === this.taskAnswerNodeId ?
                `Compiler check: PASS — landed on "${landedLabel}", matches expected "${expectedLabel}".`
            :   `Compiler check: FAIL — got "${landedLabel}", expected "${expectedLabel}".`;
        return { traversalOutcome, verificationLine };
    }

    private pushPanelPayload(nextModel: LinkedListModel): void {
        const dragHintLine =
            this.currentQuestionType === "drag_largest_to_last" ?
                "Drag tiles to reorder the linked list, then press Submit."
            :   "Use arrow keys to move Alex onto a tile, then press Submit.";
        const dragOverrides =
            this.currentQuestionType === "drag_largest_to_last" ?
                this.buildDragCompilerStatus(nextModel, this.taskAnswerNodeId)
            :   undefined;
        const codeHintLine =
            this.currentQuestionType === "drag_largest_to_last" ?
                this.buildDragMovementCodeHint(nextModel, this.taskAnswerNodeId)
            :   this.currentCodeHintLine;
        const clickOverrides =
            this.currentQuestionType === "drag_largest_to_last" ?
                undefined
            :   this.buildTraversalCompilerStatus(nextModel);
        EventBus.emit(
            BRIDGE_DEMO_PANEL_EVENT,
            buildBridgeDemoPanelPayload(
                nextModel,
                this.taskSteps,
                this.taskAnswerNodeId,
                {
                    questionLine: this.currentQuestionLine,
                    dragHintLine,
                    codeHintLine,
                    traversalStartNodeId: this.currentTraversalStartNodeId,
                    traversalStartLabel: this.currentTraversalStartLabel,
                    traversalDescription: dragOverrides?.traversalDescription,
                    traversalOutcome:
                        dragOverrides?.traversalOutcome ??
                        clickOverrides?.traversalOutcome,
                    verificationLine:
                        dragOverrides?.verificationLine ??
                        clickOverrides?.verificationLine,
                },
            ),
        );
    }

    private readonly onTileSelected = (nodeId: NodeId) => {
        // Click-to-select is disabled for keyboard questions, but keep this for safety.
        this.selectedNodeId = nodeId;
    };

    private readonly applyModelAndRedraw = (next: LinkedListModel) => {
        this.currentModel = next;
        this.pushPanelPayload(next);
        this.bridgeView.drawFromModel(
            next,
            this.applyModelAndRedraw,
            this.onTileSelected,
            this.currentNodeLabels,
        );
        this.bridgeView.setDragEnabled(
            this.currentQuestionType === "drag_largest_to_last",
        );
    };

    private updateScoreboardText(): void {
        this.scoreboardText.setText([
            `Correct: ${this.correctCount}`,
            `Incorrect: ${this.incorrectCount}`,
        ]);
    }

    private isSubmissionCorrect(): boolean {
        if (!this.currentModel) {
            return false;
        }
        if (
            this.currentQuestionType === "traversal_click" ||
            this.currentQuestionType === "indexed_prev_click"
        ) {
            const current = this.selectedNodeId;
            return current !== null && current === this.taskAnswerNodeId;
        }
        const chain = getForwardChainNodeIds(this.currentModel);
        if (chain.length === 0) {
            return false;
        }
        const lastNodeId = chain[chain.length - 1];
        return lastNodeId === this.taskAnswerNodeId;
    }

    private submitCurrentAnswer(): void {
        const isCorrect = this.isSubmissionCorrect();
        if (isCorrect) {
            this.correctCount += 1;
            this.feedbackText.setText("Correct! Great work.");
            this.feedbackText.setColor("#7ae582");
        } else {
            this.incorrectCount += 1;
            this.feedbackText.setText("Not quite. New puzzle generated.");
            this.feedbackText.setColor("#ff9e6c");
        }
        this.updateScoreboardText();
        if (this.correctCount - this.incorrectCount >= 5) {
            this.scene.start("Level2");
            return;
        }
        this.startNewRound();
    }

    private startNewRound(): void {
        const task = this.createRoundTask();
        this.taskSteps = task.steps;
        this.taskAnswerNodeId = task.answerNodeId;
        this.currentQuestionType = task.type;
        this.currentQuestionLine = task.questionLine;
        this.currentCodeHintLine = task.codeHintLine;
        this.currentTraversalStartNodeId = task.traversalStartNodeId;
        this.currentTraversalStartLabel = task.traversalStartLabel;
        this.currentNodeLabels = this.buildDisplayLabels(task.model);
        this.dragBaseOrder = getForwardChainNodeIds(task.model);
        this.dragBaseNodeLabels = this.buildNodeLabels(task.model);
        this.selectedNodeId = null;
        this.hintText.setText(task.questionLine);
        this.applyModelAndRedraw(task.model);
        this.bridgeView.clearSelection();

        // Reset Alex onto the bridge start for keyboard questions.
        if (
            this.player &&
            (this.currentQuestionType === "traversal_click" ||
                this.currentQuestionType === "indexed_prev_click")
        ) {
            this.player.setPosition(240, this.bridgePlayerY);
            this.player.setVelocity(0, 0);
        }
    }

    create() {
        this.correctCount = 0;
        this.incorrectCount = 0;

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x1b2e1b);

        this.background = this.add.image(512, 384, "background");
        this.background.setAlpha(0.25);

        this.player = this.physics.add.sprite(240, this.bridgePlayerY, "alex");
        this.player.setCollideWorldBounds(true);
        (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

        this.anims.create({
            key: "left",
            frames: this.anims.generateFrameNumbers("alex", {
                start: 1,
                end: 4,
            }),
            frameRate: 10,
            repeat: -1,
        });

        this.anims.create({
            key: "turn",
            frames: [{ key: "alex", frame: 5 }],
            frameRate: 20,
        });

        this.anims.create({
            key: "right",
            frames: this.anims.generateFrameNumbers("alex", {
                start: 6,
                end: 9,
            }),
            frameRate: 10,
            repeat: -1,
        });

        this.cursors = this.input.keyboard?.createCursorKeys();

        this.hintText = this.add
            .text(24, 16, "", {
                fontFamily: "Arial",
                fontSize: 18,
                color: "#fffde7",
                lineSpacing: 4,
                wordWrap: { width: this.scale.width - 48 },
            })
            .setDepth(10);

        this.scoreboardText = this.add
            .text(this.scale.width - 24, 18, "", {
                fontFamily: "Arial Black",
                fontSize: 20,
                color: "#fffde7",
                align: "right",
            })
            .setOrigin(1, 0)
            .setDepth(20);

        this.feedbackText = this.add
            .text(24, 72, "", {
                fontFamily: "Arial",
                fontSize: 18,
                color: "#e3f2fd",
            })
            .setDepth(20);

        this.submitButton = this.add
            .text(this.scale.width - 24, this.scale.height - 36, "Submit", {
                fontFamily: "Arial Black",
                fontSize: 26,
                color: "#1b2e1b",
                backgroundColor: "#c8e6c9",
                padding: { left: 18, right: 18, top: 8, bottom: 8 },
            })
            .setOrigin(1, 1)
            .setDepth(25)
            .setInteractive({ useHandCursor: true });
        this.submitButton.on("pointerdown", () => {
            this.submitCurrentAnswer();
        });

        this.updateScoreboardText();
        this.startNewRound();

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.bridgeView.destroy();
            this.submitButton.removeAllListeners();
        });
    }

    update() {
        // For keyboard questions, derive the "selected" node from where Alex is standing.
        if (
            this.currentQuestionType === "traversal_click" ||
            this.currentQuestionType === "indexed_prev_click"
        ) {
            const p = this.player;
            if (p) {
                const nodeId = this.bridgeView.getNodeIdAtWorldPoint(p.x, p.y);
                this.selectedNodeId = nodeId;
                this.bridgeView.setSelectedNodeId(nodeId);
            }
        }

        if (this.cursors?.left.isDown) {
            this.player?.setVelocityX(-160);
            this.player?.anims.play("left", true);
        } else if (this.cursors?.right.isDown) {
            this.player?.setVelocityX(160);
            this.player?.anims.play("right", true);
        } else {
            this.player?.setVelocityX(0);
            this.player?.anims.play("turn");
        }
    }

    changeScene() {
        this.scene.start("Level2");
    }
}
