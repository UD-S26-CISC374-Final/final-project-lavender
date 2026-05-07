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
import { codeBridgeDiagram } from "../logic/code-from-model";

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

const QUESTION_GOAL = 8;

export class Level1 extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    private hintBanner!: Phaser.GameObjects.Rectangle;
    private hintText!: Phaser.GameObjects.Text;
    private scoreboardText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;
    private feedbackBackdrop!: Phaser.GameObjects.Rectangle;
    private submitButton!: Phaser.GameObjects.Text;
    private codePanelText!: Phaser.GameObjects.Text;
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
    private arrowTutorialLayer?: Phaser.GameObjects.Container;
    private playerHasMoved = false;
    /** Round-robin shuffle queue used to avoid back-to-back repeats. */
    private questionQueue: Level1QuestionType[] = [];
    private bgAudio?: Phaser.Sound.BaseSound;

    constructor() {
        super("Level1");
        this.bridgeView = new BridgePlaceholderView(this);
    }

    private ensureBgAudio(): void {
        const existing = this.sound.get("bgAudio") as
            | Phaser.Sound.BaseSound
            | null;
        const bg =
            existing ??
            this.sound.add("bgAudio", {
                loop: true,
                volume: 0.35,
            });
        this.bgAudio = bg;
        if (!bg.isPlaying) {
            bg.play();
        }
    }

    private playButtonSound(): void {
        this.sound.play("buttonSound");
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
            questionLine: `Walk Alex to the tile he reaches if he travels  head${hops}, then press Submit.`,
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
            questionLine: `Walk Alex to the node at  ${startLabel}${path}, then press Submit.`,
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
                "Drag the tile holding the LARGEST value to the very end (tail position), then press Submit.",
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

    private nextQuestionType(): Level1QuestionType {
        if (this.questionQueue.length === 0) {
            const types: Level1QuestionType[] = [
                "traversal_click",
                "drag_largest_to_last",
                "indexed_prev_click",
            ];
            // Shuffle in place (Fisher-Yates)
            for (let i = types.length - 1; i > 0; i--) {
                const j = Phaser.Math.Between(0, i);
                const tmp = types[i];
                types[i] = types[j];
                types[j] = tmp;
            }
            this.questionQueue.push(...types);
        }
        return this.questionQueue.shift() ?? "traversal_click";
    }

    private createRoundTask(): RoundTask {
        const type = this.nextQuestionType();
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
                "Click + drag a plank to reorder. Move the largest value to the right end."
            :   "Use the arrow keys to walk Alex onto the correct tile, then press Submit.";
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
        this.refreshOnscreenCodePanel(nextModel, codeHintLine);
    }

    private refreshOnscreenCodePanel(
        model: LinkedListModel,
        codeHintLine: string,
    ): void {
        const diagram = codeBridgeDiagram(model);
        this.codePanelText.setText([
            `// linked list (${model.kind})`,
            diagram,
            "",
            "// what your move means in code",
            codeHintLine,
        ]);
    }

    private readonly onTileSelected = (nodeId: NodeId) => {
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
            { accentDoubly: true },
        );
        this.bridgeView.setDragEnabled(
            this.currentQuestionType === "drag_largest_to_last",
        );
        if (this.currentQuestionType === "drag_largest_to_last") {
            this.bridgeView.setDragMoveCallback((tileX) => {
                if (!this.player) return;
                this.player.x = tileX;
            });
        } else {
            this.bridgeView.setDragMoveCallback(null);
        }
    };

    private updateScoreboardText(): void {
        this.scoreboardText.setText([
            `Correct: ${this.correctCount} / ${QUESTION_GOAL}`,
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

    private playTraversalAnimationIfApplicable(): number {
        if (!this.currentModel) return 0;
        if (
            this.currentQuestionType !== "traversal_click" &&
            this.currentQuestionType !== "indexed_prev_click"
        ) {
            return 0;
        }
        const startId =
            this.currentTraversalStartNodeId ??
            this.currentModel.headId ??
            undefined;
        if (!startId) return 0;
        const path: NodeId[] = [startId];
        let cur: NodeId = startId;
        for (const step of this.taskSteps) {
            if (!(cur in this.currentModel.nodes)) break;
            const node = this.currentModel.nodes[cur];
            const nextId = step === "next" ? node.next : node.prev;
            if (nextId === null || !(nextId in this.currentModel.nodes)) break;
            path.push(nextId);
            cur = nextId;
        }
        return this.bridgeView.animateTraversal(path, 280);
    }

    private showFeedback(text: string, color: string): void {
        this.feedbackText.setText(text);
        this.feedbackText.setColor(color);
        this.feedbackText.setVisible(true);
        this.feedbackBackdrop.setVisible(true);
        // Pulse to draw attention
        this.tweens.killTweensOf(this.feedbackText);
        this.feedbackText.setScale(0.85);
        this.tweens.add({
            targets: this.feedbackText,
            scale: 1.0,
            duration: 220,
            ease: "Back.easeOut",
        });
    }

    private clearFeedback(): void {
        this.feedbackText.setText("");
        this.feedbackText.setVisible(false);
        this.feedbackBackdrop.setVisible(false);
    }

    private submitCurrentAnswer(): void {
        if (this.transitioning) {
            return;
        }
        const isCorrect = this.isSubmissionCorrect();
        if (isCorrect) {
            this.sound.play("correctSound");
            this.correctCount += 1;
            this.showFeedback(
                "Correct! The pointers led right to that node.",
                "#7ae582",
            );
            this.bridgeView.flashCorrect(this.taskAnswerNodeId);
        } else {
            this.sound.play("errorSound");
            this.incorrectCount += 1;
            this.showFeedback(
                "Not quite — follow the arrows again. New puzzle coming up.",
                "#ff7043",
            );
            this.cameras.main.shake(220, 0.006);
            this.cameras.main.flash(180, 130, 0, 0);
            const wrongId =
                this.selectedNodeId ?? this.currentModel?.headId ?? "";
            if (wrongId) this.bridgeView.flashWrong(wrongId);
        }
        this.updateScoreboardText();
        if (this.correctCount >= QUESTION_GOAL) {
            this.autoWalkToRightAndStart("Level2");
            return;
        }

        // For traversal-style questions, animate the correct path so the
        // player visually connects the code (head->next->next) with the
        // visited nodes. Then start the next round.
        const animMs = this.playTraversalAnimationIfApplicable();
        if (animMs > 0) {
            this.transitioning = true;
            this.submitButton.disableInteractive();
            this.time.delayedCall(animMs + 350, () => {
                this.transitioning = false;
                this.submitButton.setInteractive({ useHandCursor: true });
                this.startNewRound();
            });
            return;
        }

        // Otherwise short pause so the feedback can be read.
        this.transitioning = true;
        this.submitButton.disableInteractive();
        this.time.delayedCall(800, () => {
            this.transitioning = false;
            this.submitButton.setInteractive({ useHandCursor: true });
            this.startNewRound();
        });
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
        this.layoutHintBanner();
        this.applyModelAndRedraw(task.model);
        this.bridgeView.clearSelection();

        // Reset Alex onto the bridge start for keyboard questions.
        if (this.player) {
            const isKeyboard =
                this.currentQuestionType === "traversal_click" ||
                this.currentQuestionType === "indexed_prev_click";
            const bounds = this.bridgeView.getBridgeBounds();
            const startX =
                isKeyboard && bounds ? bounds.minX + 16 : (bounds?.minX ?? 100);
            this.player.setPosition(startX, this.bridgePlayerY + 47);
            this.player.setVelocity(0, 0);
            // Show arrow-key tutorial only the first time a keyboard round
            // appears AND only until the player actually moves.
            if (isKeyboard && !this.playerHasMoved) {
                this.showArrowTutorial();
            } else {
                this.hideArrowTutorial();
            }
        }
    }

    create() {
        this.ensureBgAudio();

        this.correctCount = 0;
        this.incorrectCount = 0;
        this.transitioning = false;
        this.introActive = true;
        this.playerHasMoved = false;
        this.questionQueue = [];

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

        // Top hint banner (large, prominent)
        this.hintBanner = this.add
            .rectangle(0, 0, this.scale.width, 80, 0x000000, 0.55)
            .setOrigin(0, 0)
            .setStrokeStyle(2, 0xfff59d, 0.6)
            .setDepth(9);
        this.hintText = this.add
            .text(24, 18, "", {
                fontFamily: "Arial Black",
                fontSize: 22,
                color: "#fffde7",
                lineSpacing: 4,
                wordWrap: { width: this.scale.width - 240 },
            })
            .setDepth(10);

        this.scoreboardText = this.add
            .text(this.scale.width - 24, 22, "", {
                fontFamily: "Arial Black",
                fontSize: 20,
                color: "#fffde7",
                align: "right",
            })
            .setOrigin(1, 0)
            .setDepth(20);

        // Bottom-center feedback (so it does not overlap top hint or buttons).
        this.feedbackBackdrop = this.add
            .rectangle(
                this.scale.width / 2,
                this.scale.height - 110,
                720,
                52,
                0x000000,
                0.55,
            )
            .setStrokeStyle(2, 0xfff59d, 0.45)
            .setDepth(19)
            .setVisible(false);
        this.feedbackText = this.add
            .text(this.scale.width / 2, this.scale.height - 110, "", {
                fontFamily: "Arial Black",
                fontSize: 22,
                color: "#e3f2fd",
                align: "center",
                wordWrap: { width: 700 },
            })
            .setOrigin(0.5)
            .setDepth(20)
            .setVisible(false);

        // On-canvas live code panel (top right under scoreboard).
        // Visible from Level 1 so players see the linked list as code from
        // the very first puzzle and learn that the code panel is gameplay
        // information, not decoration.
        const panelW = 360;
        const panelH = 110;
        this.add
            .rectangle(
                this.scale.width - 16,
                70,
                panelW,
                panelH,
                0x0b1a0b,
                0.78,
            )
            .setOrigin(1, 0)
            .setStrokeStyle(2, 0x4dd0e1, 0.7)
            .setDepth(15);
        this.add
            .text(this.scale.width - 16 - panelW + 10, 76, "Live Code", {
                fontFamily: "Arial Black",
                fontSize: 13,
                color: "#80deea",
            })
            .setDepth(16);
        this.codePanelText = this.add
            .text(this.scale.width - 16 - panelW + 10, 96, "", {
                fontFamily: "Consolas, monospace",
                fontSize: 13,
                color: "#fffde7",
                lineSpacing: 2,
                wordWrap: { width: panelW - 20 },
            })
            .setDepth(16);

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
            this.playButtonSound();
            this.submitCurrentAnswer();
        });

        this.updateScoreboardText();
        this.showIntroPopup();

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.bridgeView.destroy();
            this.submitButton.removeAllListeners();
            this.introLayer?.destroy(true);
            this.arrowTutorialLayer?.destroy(true);
        });
    }

    private layoutHintBanner(): void {
        // Recompute banner height based on text wrap so the banner always
        // fully contains the (now larger) hint text.
        const padX = 24;
        const padY = 18;
        const targetWidth = this.scale.width - 240;
        this.hintText.setStyle({ wordWrap: { width: targetWidth } });
        const h = Math.max(72, this.hintText.height + padY * 2);
        this.hintBanner.setSize(this.scale.width, h);
        this.hintText.setPosition(padX, padY);
    }

    private showIntroPopup(): void {
        this.submitButton.disableInteractive();
        this.clearFeedback();
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

        const panelW = Math.min(820, this.scale.width - 80);
        const panelH = 460;
        const panelCenterY = this.scale.height / 2 + 40;
        const panel = this.add.rectangle(
            this.scale.width / 2,
            panelCenterY,
            panelW,
            panelH,
            0x0b1a0b,
            0.86,
        );
        panel.setStrokeStyle(2, 0xfff59d, 0.65);
        panel.setDepth(1001);

        // Move the bird ABOVE the panel so it never sits behind the text.
        const bird = this.add
            .sprite(
                this.scale.width / 2,
                panelCenterY - panelH / 2 - 70,
                "bird-speaking",
            )
            .setDepth(1002);
        bird.setScale(Math.min(0.85, panelW / 980));
        if (this.anims.exists("bird-speaking-loop")) {
            bird.anims.play("bird-speaking-loop");
        }

        const title = this.add
            .text(
                this.scale.width / 2,
                panelCenterY - panelH / 2 + 24,
                "Welcome to Linked Lunacy!",
                {
                    fontFamily: "Arial Black",
                    fontSize: 28,
                    color: "#fff59d",
                },
            )
            .setOrigin(0.5, 0)
            .setDepth(1002);

        const body = this.add
            .text(
                this.scale.width / 2,
                panelCenterY - panelH / 2 + 80,
                [
                    "Each plank in the bridge is a NODE in a linked list.",
                    "The ropes between planks are the next pointers (->next).",
                    "",
                    "Your job: solve the puzzle shown at the top of the screen.",
                    "  • Walk Alex with the LEFT / RIGHT arrow keys.",
                    "  • Some rounds let you click + drag a plank to reorder it.",
                    "  • Watch the live code box on the right — it always",
                    "    matches the bridge below it.",
                    "",
                    `Solve ${QUESTION_GOAL} puzzles correctly to advance to Level 2.`,
                ].join("\n"),
                {
                    fontFamily: "Arial",
                    fontSize: 18,
                    color: "#fffde7",
                    align: "left",
                    lineSpacing: 4,
                    wordWrap: { width: panelW - 80 },
                },
            )
            .setOrigin(0.5, 0)
            .setDepth(1002);

        const startBtn = this.add
            .text(
                this.scale.width / 2,
                panelCenterY + panelH / 2 - 36,
                "Start Level 1",
                {
                    fontFamily: "Arial Black",
                    fontSize: 22,
                    color: "#1b2e1b",
                    backgroundColor: "#c8e6c9",
                    padding: { left: 22, right: 22, top: 10, bottom: 10 },
                },
            )
            .setOrigin(0.5, 0.5)
            .setDepth(1002)
            .setInteractive({ useHandCursor: true });
        startBtn.on("pointerdown", () => {
            this.playButtonSound();
            this.closeIntroPopupAndStart();
        });

        overlay.setInteractive(
            new Phaser.Geom.Rectangle(
                -this.scale.width / 2,
                -this.scale.height / 2,
                this.scale.width,
                this.scale.height,
            ),
            (hitArea: Phaser.Geom.Rectangle, x: number, y: number) =>
                Phaser.Geom.Rectangle.Contains(hitArea, x, y),
        );

        this.introLayer = this.add.container(0, 0, [
            overlay,
            panel,
            bird,
            title,
            body,
            startBtn,
        ]);
        this.introLayer.setDepth(1000);
    }

    private closeIntroPopupAndStart(): void {
        this.introActive = false;
        this.introLayer?.destroy(true);
        this.introLayer = undefined;

        this.submitButton.setInteractive({ useHandCursor: true });
        this.startNewRound();
    }

    private showArrowTutorial(): void {
        this.hideArrowTutorial();
        const p = this.player;
        if (!p) return;

        const text = this.add
            .text(
                p.x + 28,
                p.y - 48,
                "← →  use arrow keys",
                {
                    fontFamily: "Arial Black",
                    fontSize: 16,
                    color: "#1b2e1b",
                    backgroundColor: "#fff59d",
                    padding: { left: 8, right: 8, top: 4, bottom: 4 },
                },
            )
            .setOrigin(0, 0.5)
            .setDepth(40);
        this.tweens.add({
            targets: text,
            y: text.y - 6,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });
        this.arrowTutorialLayer = this.add.container(0, 0, [text]);
        this.arrowTutorialLayer.setDepth(40);
    }

    private hideArrowTutorial(): void {
        this.arrowTutorialLayer?.destroy(true);
        this.arrowTutorialLayer = undefined;
    }

    update() {
        if (this.introActive) {
            this.player?.setVelocityX(0);
            this.player?.anims.play("turn");
            return;
        }
        if (this.transitioning) {
            return;
        }
        // For keyboard questions, derive the "selected" node from where Alex stands.
        if (
            this.currentQuestionType === "traversal_click" ||
            this.currentQuestionType === "indexed_prev_click"
        ) {
            const p = this.player;
            if (p) {
                const footY = p.y + p.displayHeight * 0.5;
                const nodeId = this.bridgeView.getNodeIdAtWorldPoint(
                    p.x,
                    footY,
                );
                this.selectedNodeId = nodeId;
                this.bridgeView.setSelectedNodeId(nodeId);
            }
        }

        const p = this.player;
        const bounds = this.bridgeView.getBridgeBounds();
        if (this.cursors?.left.isDown) {
            p?.setVelocityX(-260);
            p?.anims.play("left", true);
            if (!this.playerHasMoved) {
                this.playerHasMoved = true;
                this.hideArrowTutorial();
            }
        } else if (this.cursors?.right.isDown) {
            p?.setVelocityX(260);
            p?.anims.play("right", true);
            if (!this.playerHasMoved) {
                this.playerHasMoved = true;
                this.hideArrowTutorial();
            }
        } else {
            p?.setVelocityX(0);
            p?.anims.play("turn");
        }

        // Clamp Alex to the bridge bounds so he can't walk off and "fall".
        if (p && bounds) {
            if (p.x < bounds.minX) {
                p.x = bounds.minX;
                p.setVelocityX(0);
            }
            if (p.x > bounds.maxX) {
                p.x = bounds.maxX;
                p.setVelocityX(0);
            }
        }

        // Keep the arrow tutorial near Alex while it's visible.
        if (this.arrowTutorialLayer && p) {
            const list = this.arrowTutorialLayer.list;
            if (list.length > 0) {
                const child = list[0] as Phaser.GameObjects.Text;
                child.x = p.x + 28;
            }
        }
    }

    changeScene() {
        this.scene.start("Level2");
    }
}
