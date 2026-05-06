import Phaser, { Scene } from "phaser";
import { EventBus } from "../event-bus";

import {
    BRIDGE_DEMO_PANEL_EVENT,
    buildBridgeDemoPanelPayload,
} from "../demo/bridge-demo-panel";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";
import { BridgePlaceholderView } from "../objects/bridge-placeholder-view";
import { getForwardChainNodeIds } from "../logic/forward-chain";
import { codeBridgeDiagram } from "../logic/code-from-model";
import {
    generateDeleteByValueTask,
    generateInsertAfterTask,
    generatePredecessorClickTask,
    generateStructureIdentifyTask,
    type StructureKind,
} from "../logic/random-structure-task";

type Level2QuestionType =
    | "structure_identify"
    | "delete_by_value_click"
    | "insert_after_click"
    | "predecessor_click";

type RoundTask = {
    model: LinkedListModel;
    type: Level2QuestionType;
    questionLine: string;
    codeHintLine: string;
    answerNodeId?: NodeId;
    expectedKind?: StructureKind;
    insertValue?: number;
    deleteValue?: number;
    /** For delete_by_value_click only: the tile whose `.next` must be rewired. */
    predecessorNodeId?: NodeId | null;
    /** For delete_by_value_click only: the tile that should become the predecessor's new `.next`. */
    successorNodeId?: NodeId | null;
    targetValue?: number;
};

const QUESTION_GOAL = 8;

export class Level2 extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    private hintBanner!: Phaser.GameObjects.Rectangle;
    private hintText!: Phaser.GameObjects.Text;
    private scoreboardText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;
    private feedbackBackdrop!: Phaser.GameObjects.Rectangle;
    private submitButton!: Phaser.GameObjects.Text;
    private singlyButton!: Phaser.GameObjects.Text;
    private doublyButton!: Phaser.GameObjects.Text;
    private codePanelText!: Phaser.GameObjects.Text;
    private structureBadge!: Phaser.GameObjects.Text;
    private bridgeView: BridgePlaceholderView;
    private currentTask: RoundTask | null = null;
    private currentNodeLabels = new Map<NodeId, string>();
    private selectedNodeId: NodeId | null = null;
    private selectedStructureKind: StructureKind | null = null;
    private correctCount = 0;
    private incorrectCount = 0;
    private player?: Phaser.Physics.Arcade.Sprite;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private readonly bridgePlayerY = 365;
    private transitioning = false;
    private introActive = false;
    private introLayer?: Phaser.GameObjects.Container;
    private questionQueue: Level2QuestionType[] = [];

    constructor() {
        super("Level2");
        this.bridgeView = new BridgePlaceholderView(this);
    }

    private buildDisplayLabels(model: LinkedListModel): Map<NodeId, string> {
        const chain = getForwardChainNodeIds(model);
        const labels = new Map<NodeId, string>();
        for (let i = 0; i < chain.length; i++) {
            const id = chain[i];
            if (!id) {
                continue;
            }
            labels.set(id, `n${i + 1}`);
        }
        const headId = model.headId;
        if (headId !== null) {
            labels.set(headId, "head");
        }
        const tailId = chain.length > 0 ? chain[chain.length - 1] : null;
        if (tailId !== null) {
            labels.set(tailId, "tail");
        }
        return labels;
    }

    private nextQuestionType(): Level2QuestionType {
        if (this.questionQueue.length === 0) {
            const types: Level2QuestionType[] = [
                "structure_identify",
                "delete_by_value_click",
                "insert_after_click",
                "predecessor_click",
            ];
            for (let i = types.length - 1; i > 0; i--) {
                const j = Phaser.Math.Between(0, i);
                const tmp = types[i];
                types[i] = types[j];
                types[j] = tmp;
            }
            this.questionQueue.push(...types);
        }
        return this.questionQueue.shift() ?? "structure_identify";
    }

    private createRoundTask(): RoundTask {
        const type = this.nextQuestionType();
        if (type === "structure_identify") {
            const task = generateStructureIdentifyTask();
            const prevHint =
                task.expectedKind === "doubly" ?
                    "// Doubly: yellow <- prev arrows under each plank, two-way ropes."
                :   "// Singly: only one rope direction (next ->), no prev arrows.";
            return {
                model: task.model,
                type: "structure_identify",
                expectedKind: task.expectedKind,
                questionLine:
                    "Is this bridge SINGLY or DOUBLY linked? Pick a button below, then press Submit.",
                codeHintLine: prevHint,
            };
        }
        if (type === "delete_by_value_click") {
            const task = generateDeleteByValueTask();
            return {
                model: task.model,
                type: "delete_by_value_click",
                answerNodeId: task.answerNodeId,
                deleteValue: task.targetValue,
                predecessorNodeId: task.predecessorNodeId,
                successorNodeId: task.successorNodeId,
                targetValue: task.targetValue,
                questionLine: `Delete the tile with value ${task.targetValue}: walk Alex onto it, then press Submit.`,
                codeHintLine: `// Deletion: prev->next = node->next; (skip the tile being removed)`,
            };
        }
        if (type === "insert_after_click") {
            const task = generateInsertAfterTask();
            return {
                model: task.model,
                type: "insert_after_click",
                answerNodeId: task.answerNodeId,
                insertValue: task.insertValue,
                questionLine: `A new tile of value ${task.insertValue} must be inserted in sorted order. Walk Alex onto the tile it goes AFTER, then press Submit.`,
                codeHintLine: `// Insertion: newNode->next = node->next; node->next = newNode;`,
            };
        }
        const task = generatePredecessorClickTask();
        return {
            model: task.model,
            type: "predecessor_click",
            answerNodeId: task.answerNodeId,
            targetValue: task.targetValue,
            questionLine: `Walk Alex onto the node whose ->next currently points at the tile with value ${task.targetValue}. (That predecessor is what delete-by-value would rewire.)`,
            codeHintLine: `// To delete value ${task.targetValue}, you must update the PREVIOUS node's ->next.`,
        };
    }

    private readonly onTileSelected = (nodeId: NodeId) => {
        if (this.currentTask?.type === "structure_identify") {
            return;
        }
        this.selectedNodeId = nodeId;
    };

    private readonly applyModelAndRedraw = (next: LinkedListModel) => {
        this.pushPanelPayload(next);
        this.bridgeView.drawFromModel(
            next,
            this.applyModelAndRedraw,
            this.onTileSelected,
            this.currentNodeLabels,
            { accentDoubly: true },
        );
        this.bridgeView.setDragEnabled(false);
    };

    private pushPanelPayload(model: LinkedListModel): void {
        const task = this.currentTask;
        if (!task) {
            return;
        }
        const dragHintLine =
            task.type === "structure_identify" ?
                "Choose Singly or Doubly using the buttons below, then press Submit."
            :   "Use the arrow keys to walk Alex onto the correct tile, then press Submit.";
        EventBus.emit(
            BRIDGE_DEMO_PANEL_EVENT,
            buildBridgeDemoPanelPayload(model, [], task.answerNodeId, {
                questionLine: task.questionLine,
                dragHintLine,
                codeHintLine: task.codeHintLine,
            }),
        );
        this.refreshOnscreenCodePanel(model, task.codeHintLine);
        this.refreshStructureBadge(model);
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
            codeHintLine,
        ]);
    }

    private refreshStructureBadge(model: LinkedListModel): void {
        if (model.kind === "doubly") {
            this.structureBadge.setText("DOUBLY linked  next  +  prev");
            this.structureBadge.setBackgroundColor("#00838f");
            this.structureBadge.setColor("#ffffff");
        } else {
            this.structureBadge.setText("SINGLY linked  next  only");
            this.structureBadge.setBackgroundColor("#fff59d");
            this.structureBadge.setColor("#1b2e1b");
        }
    }

    private updateScoreboardText(): void {
        this.scoreboardText.setText([
            `Correct: ${this.correctCount} / ${QUESTION_GOAL}`,
            `Incorrect: ${this.incorrectCount}`,
        ]);
    }

    private isSubmissionCorrect(): boolean {
        if (!this.currentTask) {
            return false;
        }
        if (this.currentTask.type === "structure_identify") {
            return (
                this.selectedStructureKind !== null &&
                this.selectedStructureKind === this.currentTask.expectedKind
            );
        }
        return (
            this.selectedNodeId !== null &&
            this.currentTask.answerNodeId !== undefined &&
            this.selectedNodeId === this.currentTask.answerNodeId
        );
    }

    private showFeedback(text: string, color: string): void {
        this.feedbackText.setText(text);
        this.feedbackText.setColor(color);
        this.feedbackText.setVisible(true);
        this.feedbackBackdrop.setVisible(true);
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

    private animateDeletionAndAdvance(): void {
        // Plays the rewiring of prev->next visually, then moves to the next round.
        const task = this.currentTask;
        if (!task || task.type !== "delete_by_value_click") {
            this.startNewRound();
            return;
        }
        const targetId = task.answerNodeId;
        if (!targetId) {
            this.startNewRound();
            return;
        }
        const targetCenter = this.bridgeView.getTileCenter(targetId);
        if (!targetCenter) {
            this.startNewRound();
            return;
        }

        // Highlight predecessor as "now repointing" so the player connects
        // the abstract `prev->next = node->next;` to the visual outcome.
        if (task.predecessorNodeId) {
            this.bridgeView.flashCorrect(task.predecessorNodeId);
        }
        this.bridgeView.flashCorrect(targetId);
        this.time.delayedCall(700, () => {
            this.startNewRound();
        });
    }

    private submitCurrentAnswer(): void {
        if (this.transitioning) {
            return;
        }
        const correct = this.isSubmissionCorrect();
        if (correct) {
            this.correctCount += 1;
            this.showFeedback("Correct! Pointer logic checks out.", "#7ae582");
            const id =
                this.currentTask?.answerNodeId ??
                (this.selectedNodeId ?? "");
            if (id) this.bridgeView.flashCorrect(id);
        } else {
            this.incorrectCount += 1;
            const correctId = this.currentTask?.answerNodeId;
            const tellLine =
                this.currentTask?.type === "structure_identify" ?
                    `Wrong — this list was ${this.currentTask.expectedKind}.`
                : correctId ?
                    `Wrong — the correct tile was ${this.toLabel(correctId)}.`
                :   "Not quite.";
            this.showFeedback(tellLine, "#ff7043");
            this.cameras.main.shake(220, 0.006);
            this.cameras.main.flash(180, 130, 0, 0);
            const wrongId =
                this.selectedNodeId ?? this.currentTask?.answerNodeId ?? "";
            if (wrongId) this.bridgeView.flashWrong(wrongId);
        }
        this.updateScoreboardText();
        if (this.correctCount >= QUESTION_GOAL) {
            this.autoWalkToRightAndStart("Level3");
            return;
        }

        // Special case: animate the deletion if correct on a delete question.
        this.transitioning = true;
        this.submitButton.disableInteractive();
        this.singlyButton.disableInteractive();
        this.doublyButton.disableInteractive();

        const onAdvance = () => {
            this.transitioning = false;
            this.submitButton.setInteractive({ useHandCursor: true });
            // The structure buttons re-enable themselves only when the task asks for them.
            this.startNewRound();
        };

        if (correct && this.currentTask?.type === "delete_by_value_click") {
            this.animateDeletionAndAdvance();
            this.time.delayedCall(900, () => {
                this.transitioning = false;
                this.submitButton.setInteractive({ useHandCursor: true });
            });
            return;
        }
        this.time.delayedCall(correct ? 700 : 1100, onAdvance);
    }

    private toLabel(nodeId: NodeId): string {
        return this.currentNodeLabels.get(nodeId) ?? nodeId;
    }

    private autoWalkToRightAndStart(nextSceneKey: string): void {
        const p = this.player;
        if (!p) {
            this.scene.start(nextSceneKey);
            return;
        }
        this.transitioning = true;
        this.submitButton.disableInteractive();
        this.singlyButton.disableInteractive();
        this.doublyButton.disableInteractive();

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

    private setStructureSelection(kind: StructureKind): void {
        if (this.currentTask?.type !== "structure_identify") {
            return;
        }
        this.selectedStructureKind = kind;
        this.refreshStructureButtons();
    }

    private refreshStructureButtons(): void {
        const isStructureQ = this.currentTask?.type === "structure_identify";
        this.singlyButton.setVisible(isStructureQ).setActive(isStructureQ);
        this.doublyButton.setVisible(isStructureQ).setActive(isStructureQ);
        if (!isStructureQ) {
            return;
        }
        if (!this.transitioning) {
            this.singlyButton.setInteractive({ useHandCursor: true });
            this.doublyButton.setInteractive({ useHandCursor: true });
        }
        const colorFor = (selected: boolean) =>
            selected ? "#fff59d" : "#c8e6c9";
        this.singlyButton.setBackgroundColor(
            colorFor(this.selectedStructureKind === "singly"),
        );
        this.doublyButton.setBackgroundColor(
            colorFor(this.selectedStructureKind === "doubly"),
        );
    }

    private startNewRound(): void {
        const task = this.createRoundTask();
        this.currentTask = task;
        this.currentNodeLabels = this.buildDisplayLabels(task.model);
        this.selectedNodeId = null;
        this.selectedStructureKind = null;
        this.hintText.setText(task.questionLine);
        this.layoutHintBanner();
        this.applyModelAndRedraw(task.model);
        this.bridgeView.clearSelection();
        this.refreshStructureButtons();

        if (this.player) {
            const isStructure = this.currentTask.type === "structure_identify";
            const bounds = this.bridgeView.getBridgeBounds();
            const startX =
                !isStructure && bounds ?
                    bounds.minX + 16
                :   (bounds?.minX ?? 100);
            this.player.setPosition(startX, this.bridgePlayerY + 47);
            this.player.setVelocity(0, 0);
        }
    }

    private layoutHintBanner(): void {
        const padX = 24;
        const padY = 18;
        const targetWidth = this.scale.width - 240;
        this.hintText.setStyle({ wordWrap: { width: targetWidth } });
        const h = Math.max(72, this.hintText.height + padY * 2);
        this.hintBanner.setSize(this.scale.width, h);
        this.hintText.setPosition(padX, padY);
    }

    private showIntroPopup(): void {
        this.introActive = true;
        this.submitButton.disableInteractive();
        this.singlyButton.disableInteractive();
        this.doublyButton.disableInteractive();
        this.clearFeedback();

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

        // Bird above the panel so it never sits behind text.
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
                "Level 2 — Structure & Pointers",
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
                    "Now the puzzles ask you about how the list is BUILT.",
                    "",
                    "  • SINGLY linked: one rope per gap (next ->).",
                    "  • DOUBLY linked: one rope per gap PLUS yellow <- prev",
                    "    arrows under each plank (next + prev).",
                    "",
                    "Some rounds ask you to pick a tile to delete or insert.",
                    "Other rounds ask you to find the PREDECESSOR — the tile",
                    "whose ->next pointer would have to change to delete a node.",
                    "",
                    `Solve ${QUESTION_GOAL} puzzles correctly to advance to Level 3.`,
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
                "Start Level 2",
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
        startBtn.on("pointerdown", () => this.closeIntroPopupAndStart());

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

    create() {
        this.correctCount = 0;
        this.incorrectCount = 0;
        this.transitioning = false;
        this.questionQueue = [];

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x152238);

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

        // Live code panel (top right)
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

        // Permanent structure-kind badge above the bridge so the player can
        // always see whether this is singly or doubly.
        this.structureBadge = this.add
            .text(this.scale.width / 2, 200, "", {
                fontFamily: "Arial Black",
                fontSize: 16,
                color: "#1b2e1b",
                backgroundColor: "#fff59d",
                padding: { left: 10, right: 10, top: 6, bottom: 6 },
            })
            .setOrigin(0.5, 0.5)
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
            this.submitCurrentAnswer();
        });

        this.singlyButton = this.add
            .text(24, this.scale.height - 36, "Singly", {
                fontFamily: "Arial Black",
                fontSize: 22,
                color: "#1b2e1b",
                backgroundColor: "#c8e6c9",
                padding: { left: 14, right: 14, top: 8, bottom: 8 },
            })
            .setOrigin(0, 1)
            .setDepth(25)
            .setInteractive({ useHandCursor: true });
        this.singlyButton.on("pointerdown", () => {
            this.setStructureSelection("singly");
        });

        this.doublyButton = this.add
            .text(160, this.scale.height - 36, "Doubly", {
                fontFamily: "Arial Black",
                fontSize: 22,
                color: "#1b2e1b",
                backgroundColor: "#c8e6c9",
                padding: { left: 14, right: 14, top: 8, bottom: 8 },
            })
            .setOrigin(0, 1)
            .setDepth(25)
            .setInteractive({ useHandCursor: true });
        this.doublyButton.on("pointerdown", () => {
            this.setStructureSelection("doubly");
        });

        this.updateScoreboardText();
        this.showIntroPopup();

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.bridgeView.destroy();
            this.submitButton.removeAllListeners();
            this.singlyButton.removeAllListeners();
            this.doublyButton.removeAllListeners();
            this.introLayer?.destroy(true);
        });
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
        const task = this.currentTask;
        const p = this.player;
        if (task && task.type !== "structure_identify") {
            if (p) {
                const footY = p.y + p.displayHeight * 0.5;
                const nodeId = this.bridgeView.getNodeIdAtWorldPoint(p.x, footY);
                this.selectedNodeId = nodeId;
                this.bridgeView.setSelectedNodeId(nodeId);
            }

            if (this.cursors?.left.isDown) {
                p?.setVelocityX(-260);
                p?.anims.play("left", true);
            } else if (this.cursors?.right.isDown) {
                p?.setVelocityX(260);
                p?.anims.play("right", true);
            } else {
                p?.setVelocityX(0);
                p?.anims.play("turn");
            }
        } else {
            p?.setVelocityX(0);
            p?.anims.play("turn");
            this.bridgeView.setSelectedNodeId(null);
            this.selectedNodeId = null;
        }

        // Clamp Alex to the bridge.
        const bounds = this.bridgeView.getBridgeBounds();
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
    }

    changeScene() {
        this.scene.start("Level3");
    }
}
