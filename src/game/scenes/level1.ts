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
    private transitioning = false;
    private introActive = false;
    private introLayer?: Phaser.GameObjects.Container;

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
        if (this.transitioning) {
            return;
        }
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
        if (this.correctCount >= 10) {
            this.autoWalkToRightAndStart("Level2");
            return;
        }
        this.startNewRound();
    }

    private autoWalkToRightAndStart(nextSceneKey: string): void {
        const p = this.player;
        if (!p) {
            this.scene.start(nextSceneKey);
            return;
        }
        this.transitioning = true;
        this.submitButton.disableInteractive();

        const targetX = this.scale.width - 40;
        const distance = Math.max(0, targetX - p.x);
        const speedPxPerSec = 260;
        const durationMs = Math.max(250, (distance / speedPxPerSec) * 1000);

        p.setVelocity(0, 0);
        p.anims.play("right", true);
        this.tweens.add({
            targets: p,
            x: targetX,
            duration: durationMs,
            ease: "Linear",
            onComplete: () => {
                p.anims.play("turn");
                this.scene.start(nextSceneKey);
            },
        });
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
            this.player.setPosition(100, this.bridgePlayerY + 47);
            this.player.setVelocity(0, 0);
        }
    }

    create() {
        this.correctCount = 0;
        this.incorrectCount = 0;
        this.transitioning = false;
        this.introActive = true;

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x1b2e1b);

        this.background = this.add.image(512, 384, "background");
        this.background.setAlpha(0.25);

        this.player = this.physics.add.sprite(
            100,
            this.bridgePlayerY + 47,
            "alex",
        );
        this.player.setCollideWorldBounds(true);
        (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        this.player.setDepth(35);

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

        // Bird speaking animation (used in the Level 1 intro popup).
        const birdFrames = this.textures.get("bird-speaking").frameTotal;
        if (!this.anims.exists("bird-speaking-loop") && birdFrames > 1) {
            this.anims.create({
                key: "bird-speaking-loop",
                frames: this.anims.generateFrameNumbers("bird-speaking", {
                    start: 0,
                    end: Math.max(0, birdFrames - 1),
                }),
                frameRate: 5,
                repeat: -1,
            });
        }

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
        this.showIntroPopup();

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.bridgeView.destroy();
            this.submitButton.removeAllListeners();
            this.introLayer?.destroy(true);
        });
    }

    private showIntroPopup(): void {
        // Lock gameplay UI until player chooses.
        this.submitButton.disableInteractive();
        this.feedbackText.setText("");
        this.hintText.setText("");

        const overlay = this.add.rectangle(
            this.scale.width / 2,
            this.scale.height / 2,
            this.scale.width,
            this.scale.height,
            0x000000,
            0.45,
        );
        overlay.setDepth(1000);

        const panelW = Math.min(760, this.scale.width - 80);
        const panelH = 380;
        const panel = this.add.rectangle(
            this.scale.width / 2,
            this.scale.height / 2,
            panelW,
            panelH,
            0x0b1a0b,
            0.78,
        );
        panel.setStrokeStyle(2, 0xfff59d, 0.65);
        panel.setDepth(1001);

        const bird = this.add
            .sprite(
                this.scale.width / 2,
                this.scale.height / 2 - 120,
                "bird-speaking",
            )
            .setDepth(1002);
        bird.setScale(Math.min(1, panelW / 820));
        if (this.anims.exists("bird-speaking-loop")) {
            bird.anims.play("bird-speaking-loop");
        }

        const prompt = this.add
            .text(
                this.scale.width / 2,
                this.scale.height / 2 - 20,
                "Would you like to see the instructions?",
                {
                    fontFamily: "Arial Black",
                    fontSize: 24,
                    color: "#fffde7",
                    align: "center",
                    wordWrap: { width: panelW - 80 },
                },
            )
            .setOrigin(0.5)
            .setDepth(1002);

        const makeButton = (
            x: number,
            label: string,
            onClick: () => void,
        ): Phaser.GameObjects.Text => {
            const btn = this.add
                .text(x, this.scale.height / 2 + 110, label, {
                    fontFamily: "Arial Black",
                    fontSize: 22,
                    color: "#1b2e1b",
                    backgroundColor: "#c8e6c9",
                    padding: { left: 18, right: 18, top: 10, bottom: 10 },
                })
                .setOrigin(0.5)
                .setDepth(1002)
                .setInteractive({ useHandCursor: true });
            btn.on("pointerdown", () => onClick());
            return btn;
        };

        const skipBtn = makeButton(this.scale.width / 2 - 120, "Skip", () => {
            this.closeIntroPopupAndStart();
        });
        const instrBtn = makeButton(
            this.scale.width / 2 + 140,
            "Instructions",
            () => {
                prompt.setText(
                    "Hey there! welcome to linked lunancy, where you're goal is to traverse the bridge by either clicking and dragging teh bridge tiles based on the given instructions at the top of the screen of screen, move Alex to the corect tile by using the arrow keys, or by typing the correct line to based on given instructions. After answering 10 correct questions, you will move onto the next level. Good luck and have fun!",
                );
                skipBtn.setVisible(false).disableInteractive();
                instrBtn.setVisible(false).disableInteractive();

                const instructionsText = this.add
                    .text(
                        this.scale.width / 2,
                        this.scale.height / 2 + 40,
                        "",
                        {
                            fontFamily: "Arial",
                            fontSize: 18,
                            color: "#fffde7",
                            align: "left",
                            wordWrap: { width: panelW - 100 },
                            lineSpacing: 6,
                        },
                    )
                    .setOrigin(0.5)
                    .setDepth(1002);

                let continueBtn: Phaser.GameObjects.Text | null = null;
                continueBtn = makeButton(
                    this.scale.width / 2,
                    "Continue",
                    () => {
                        continueBtn?.destroy();
                        continueBtn = null;
                        instructionsText.destroy();
                        this.closeIntroPopupAndStart();
                    },
                );
                continueBtn.setY(this.scale.height / 2 + 140);
            },
        );

        // Block clicks from reaching the scene underneath.
        overlay.setInteractive(
            new Phaser.Geom.Rectangle(
                -this.scale.width / 2,
                -this.scale.height / 2,
                this.scale.width,
                this.scale.height
            ),
            (hitArea: Phaser.Geom.Rectangle, x: number, y: number) =>
                Phaser.Geom.Rectangle.Contains(hitArea, x, y)
        );

        this.introLayer = this.add.container(0, 0, [
            overlay,
            panel,
            bird,
            prompt,
            skipBtn,
            instrBtn,
        ]);
        this.introLayer.setDepth(1000);
    }

    private closeIntroPopupAndStart(): void {
        this.introActive = false;
        this.introLayer?.destroy(true);
        this.introLayer = undefined;

        // Re-enable gameplay UI and start the first round.
        this.submitButton.setInteractive({ useHandCursor: true });
        this.startNewRound();
    }

    update() {
        if (this.introActive) {
            // Keep Alex idle behind the popup.
            this.player?.setVelocityX(0);
            this.player?.anims.play("turn");
            return;
        }
        if (this.transitioning) {
            const p = this.player;
            if (p && p.anims.currentAnim?.key !== "right") {
                p.anims.play("right", true);
            }
            return;
        }
        // For keyboard questions, derive the "selected" node from where Alex is standing.
        if (
            this.currentQuestionType === "traversal_click" ||
            this.currentQuestionType === "indexed_prev_click"
        ) {
            const p = this.player;
            if (p) {
                // Use Alex's "feet" instead of his sprite center so the probe point
                // actually overlaps the plank bounds.
                const footY = p.y + p.displayHeight * 0.5;
                const nodeId = this.bridgeView.getNodeIdAtWorldPoint(
                    p.x,
                    footY,
                );
                this.selectedNodeId = nodeId;
                this.bridgeView.setSelectedNodeId(nodeId);
            }
        }

        if (this.cursors?.left.isDown) {
            this.player?.setVelocityX(-260);
            this.player?.anims.play("left", true);
        } else if (this.cursors?.right.isDown) {
            this.player?.setVelocityX(260);
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
