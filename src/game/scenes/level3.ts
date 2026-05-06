import Phaser, { Scene } from "phaser";
import { EventBus } from "../event-bus";
import {
    BRIDGE_DEMO_PANEL_EVENT,
    buildBridgeDemoPanelPayload,
} from "../demo/bridge-demo-panel";
import { BridgePlaceholderView } from "../objects/bridge-placeholder-view";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";
import { getForwardChainNodeIds } from "../logic/forward-chain";
import { codeBridgeDiagram } from "../logic/code-from-model";
import { generateRandomSinglyChain } from "../logic/random-singly-bridge";

type Level3TaskType =
    | "skip_next"
    | "point_next_to_head"
    | "delete_head"
    | "cut_after_curr";

type RoundTask = {
    type: Level3TaskType;
    model: LinkedListModel;
    currId: NodeId;
    promptLine: string;
    expectedStatements: string[];
};

const QUESTION_GOAL = 6;

function normalizeStatement(raw: string): string {
    return raw.replaceAll(/\s+/g, "").replaceAll(/;+$/g, "").toLowerCase();
}

function cloneSinglyModel(model: LinkedListModel): LinkedListModel {
    return {
        ...model,
        nodes: Object.fromEntries(
            Object.entries(model.nodes).map(([id, node]) => [id, { ...node }]),
        ),
    };
}

function applySkipNext(
    model: LinkedListModel,
    currId: NodeId,
): LinkedListModel {
    const nextId = model.nodes[currId].next;
    if (nextId === null) {
        return model;
    }
    const nextNext = model.nodes[nextId].next;
    const nextModel = cloneSinglyModel(model);
    nextModel.nodes[currId] = { ...nextModel.nodes[currId], next: nextNext };
    return nextModel;
}

function applyPointNextToHead(
    model: LinkedListModel,
    currId: NodeId,
): LinkedListModel {
    const nextModel = cloneSinglyModel(model);
    nextModel.nodes[currId] = {
        ...nextModel.nodes[currId],
        next: model.headId ?? null,
    };
    return nextModel;
}

export class Level3 extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    private hintBanner!: Phaser.GameObjects.Rectangle;
    private hintText!: Phaser.GameObjects.Text;
    private scoreboardText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;
    private feedbackBackdrop!: Phaser.GameObjects.Rectangle;
    private submitButton!: Phaser.GameObjects.Text;
    private inputText!: Phaser.GameObjects.Text;
    private codePanelText!: Phaser.GameObjects.Text;

    private bridgeView: BridgePlaceholderView;
    private player?: Phaser.Physics.Arcade.Sprite;
    private currentTask: RoundTask | null = null;
    private currentNodeLabels = new Map<NodeId, string>();
    private typedBuffer = "";
    private correctCount = 0;
    private incorrectCount = 0;
    private acceptingInput = true;
    private readonly bridgePlayerY = 365;
    private transitioning = false;
    private introActive = false;
    private introLayer?: Phaser.GameObjects.Container;
    private taskQueue: Level3TaskType[] = [];

    constructor() {
        super("Level3");
        this.bridgeView = new BridgePlaceholderView(this);
    }

    private buildDisplayLabels(model: LinkedListModel, currId: NodeId) {
        const chain = getForwardChainNodeIds(model);
        const labels = new Map<NodeId, string>();
        for (let i = 0; i < chain.length; i++) {
            const id = chain[i];
            if (!id) continue;
            labels.set(id, `n${i + 1}`);
        }
        if (model.headId !== null) labels.set(model.headId, "head");
        const tailId = chain.length > 0 ? chain[chain.length - 1] : null;
        if (tailId !== null) labels.set(tailId, "tail");
        labels.set(currId, "curr");
        return labels;
    }

    private nextTaskType(): Level3TaskType {
        if (this.taskQueue.length === 0) {
            const types: Level3TaskType[] = [
                "skip_next",
                "point_next_to_head",
                "delete_head",
                "cut_after_curr",
            ];
            for (let i = types.length - 1; i > 0; i--) {
                const j = Phaser.Math.Between(0, i);
                const tmp = types[i];
                types[i] = types[j];
                types[j] = tmp;
            }
            this.taskQueue.push(...types);
        }
        return this.taskQueue.shift() ?? "skip_next";
    }

    private createRoundTask(): RoundTask {
        for (let attempt = 0; attempt < 12; attempt++) {
            const model = generateRandomSinglyChain(Phaser.Math.Between(4, 6));
            const chain = getForwardChainNodeIds(model);
            if (chain.length < 4) continue;

            const type = this.nextTaskType();

            if (type === "skip_next") {
                const currIndex = Phaser.Math.Between(0, chain.length - 3);
                const currId = chain[currIndex] ?? "";
                if (!currId) continue;
                return {
                    type,
                    model,
                    currId,
                    promptLine:
                        "Type ONE reassignment statement that deletes the node AFTER curr by skipping it.",
                    expectedStatements: ["curr->next = curr->next->next;"],
                };
            }

            if (type === "point_next_to_head") {
                const currIndex = Phaser.Math.Between(1, chain.length - 2);
                const currId = chain[currIndex] ?? "";
                if (!currId) continue;
                return {
                    type,
                    model,
                    currId,
                    promptLine:
                        "Type ONE reassignment statement that makes curr->next point to head.",
                    expectedStatements: ["curr->next = head;"],
                };
            }

            if (type === "delete_head") {
                const currId = model.headId ?? "";
                if (!currId) continue;
                return {
                    type,
                    model,
                    currId,
                    promptLine:
                        "Type ONE reassignment statement that deletes the head node by moving head forward by one.",
                    expectedStatements: ["head = head->next;"],
                };
            }

            const currIndex = Phaser.Math.Between(0, chain.length - 2);
            const currId = chain[currIndex] ?? "";
            if (!currId) continue;
            return {
                type,
                model,
                currId,
                promptLine:
                    "Type ONE reassignment statement that cuts the bridge after curr (so curr becomes the last reachable node).",
                expectedStatements: ["curr->next = null;"],
            };
        }

        const model = generateRandomSinglyChain(5);
        const chain = getForwardChainNodeIds(model);
        const currId = chain[1];
        return {
            type: "point_next_to_head",
            model,
            currId,
            promptLine:
                "Type ONE reassignment statement that makes curr->next point to head.",
            expectedStatements: ["curr->next = head;"],
        };
    }

    private pushPanelPayload(model: LinkedListModel): void {
        const task = this.currentTask;
        if (!task) return;

        EventBus.emit(
            BRIDGE_DEMO_PANEL_EVENT,
            buildBridgeDemoPanelPayload(model, [], undefined, {
                questionLine: task.promptLine,
                dragHintLine:
                    "Type your code below (example: curr->next = curr->next->next;) then press Submit or Enter.",
                codeHintLine:
                    "// Only ONE statement. Use reassignment (e.g. curr->next = ...).",
            }),
        );
        this.refreshOnscreenCodePanel(model);
    }

    private refreshOnscreenCodePanel(model: LinkedListModel): void {
        const diagram = codeBridgeDiagram(model);
        const expected = this.currentTask?.expectedStatements[0] ?? "";
        this.codePanelText.setText([
            `// linked list (${model.kind})`,
            diagram,
            "",
            "// goal pattern (you must type the exact code):",
            expected,
        ]);
    }

    private readonly applyModelAndRedraw = (next: LinkedListModel) => {
        this.pushPanelPayload(next);
        this.bridgeView.drawFromModel(
            next,
            undefined,
            undefined,
            this.currentNodeLabels,
            { accentDoubly: false },
        );
        this.bridgeView.setDragEnabled(false);
    };

    private updateScoreboardText(): void {
        this.scoreboardText.setText([
            `Correct: ${this.correctCount} / ${QUESTION_GOAL}`,
            `Incorrect: ${this.incorrectCount}`,
        ]);
    }

    private refreshInputText(): void {
        const caret =
            this.acceptingInput && Math.floor(this.time.now / 400) % 2 === 0 ?
                "|"
            :   " ";
        const shown = this.typedBuffer.length === 0 ? "" : this.typedBuffer;
        this.inputText.setText(`${shown}${caret}`);
    }

    private clearTyped(): void {
        this.typedBuffer = "";
        this.refreshInputText();
    }

    private isTypedAnswerCorrect(): boolean {
        const task = this.currentTask;
        if (!task) return false;
        const typed = normalizeStatement(this.typedBuffer);
        return task.expectedStatements.some(
            (s) => normalizeStatement(s) === typed,
        );
    }

    private applyTypedAnswerIfCorrect(): LinkedListModel | null {
        const task = this.currentTask;
        if (!task) return null;
        if (!this.isTypedAnswerCorrect()) return null;
        if (task.type === "skip_next")
            return applySkipNext(task.model, task.currId);
        if (task.type === "point_next_to_head")
            return applyPointNextToHead(task.model, task.currId);
        if (task.type === "delete_head") {
            const head = task.model.headId;
            if (head === null) return task.model;
            const nextHead = task.model.nodes[head].next;
            return { ...task.model, headId: nextHead };
        }
        const nextModel = cloneSinglyModel(task.model);
        nextModel.nodes[task.currId] = {
            ...nextModel.nodes[task.currId],
            next: null,
        };
        return nextModel;
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

    private submitCurrentAnswer(): void {
        if (this.transitioning) {
            return;
        }
        const task = this.currentTask;
        const correct = this.isTypedAnswerCorrect();
        if (correct) {
            this.correctCount += 1;
            this.showFeedback(
                "Correct! Statement compiled and applied.",
                "#7ae582",
            );
            if (task) this.bridgeView.flashCorrect(task.currId);
        } else {
            this.incorrectCount += 1;
            const answer =
                task?.expectedStatements[0] ?
                    `Expected:  ${task.expectedStatements[0]}`
                :   "";
            this.showFeedback(
                answer ? `Not quite.  ${answer}` : "Not quite.",
                "#ff7043",
            );
            if (task) this.bridgeView.flashWrong(task.currId);
            this.cameras.main.shake(220, 0.006);
            this.cameras.main.flash(180, 130, 0, 0);
        }
        this.updateScoreboardText();

        if (this.correctCount >= QUESTION_GOAL) {
            this.autoWalkToRightAndStart("GameOver");
            return;
        }

        const nextModel = this.applyTypedAnswerIfCorrect();
        if (nextModel) {
            this.acceptingInput = false;
            this.currentTask = { ...this.currentTask!, model: nextModel };
            this.applyModelAndRedraw(nextModel);
            this.time.delayedCall(900, () => {
                this.acceptingInput = true;
                this.startNewRound();
            });
            return;
        }

        if (!correct) {
            this.acceptingInput = false;
            this.time.delayedCall(1500, () => {
                this.acceptingInput = true;
                this.startNewRound();
            });
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
        this.acceptingInput = false;
        this.submitButton.disableInteractive();

        const targetX = this.scale.width - 40;
        const distance = Math.max(0, targetX - p.x);
        const speedPxPerSec = 260;
        const durationMs = Math.max(250, (distance / speedPxPerSec) * 1000);

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
        this.currentTask = task;
        this.currentNodeLabels = this.buildDisplayLabels(
            task.model,
            task.currId,
        );
        this.hintText.setText(task.promptLine);
        this.layoutHintBanner();
        this.clearTyped();
        this.applyModelAndRedraw(task.model);
        this.bridgeView.clearSelection();
        // Position Alex over the curr tile so the player can SEE which node
        // their typed code is acting on.
        const center = this.bridgeView.getTileCenter(task.currId);
        if (this.player && center) {
            this.player.setPosition(center.x, this.bridgePlayerY + 47);
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
        this.acceptingInput = false;
        this.submitButton.disableInteractive();
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
                "Level 3 — Type the Code",
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
                    "Now you write the actual code.",
                    "",
                    "Each round shows the bridge with one tile labeled curr.",
                    "Type ONE assignment that performs the operation",
                    "described at the top of the screen, then press Enter or Submit.",
                    "",
                    "Tips:",
                    "  • Type a period ( . ) and the game writes -> for you.",
                    "  • Use head, curr, ->next, and null.",
                    "  • Watch the bridge — it visually updates when you compile.",
                    "",
                    `Solve ${QUESTION_GOAL} rounds correctly to finish the game.`,
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
                "Start Level 3",
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
        this.acceptingInput = true;
        this.submitButton.setInteractive({ useHandCursor: true });
        this.startNewRound();
    }

    create() {
        this.correctCount = 0;
        this.incorrectCount = 0;
        this.transitioning = false;
        this.taskQueue = [];

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x231942);

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
        this.player.anims.play("turn");

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
                this.scale.height - 180,
                720,
                52,
                0x000000,
                0.6,
            )
            .setStrokeStyle(2, 0xfff59d, 0.45)
            .setDepth(19)
            .setVisible(false);
        this.feedbackText = this.add
            .text(this.scale.width / 2, this.scale.height - 180, "", {
                fontFamily: "Arial Black",
                fontSize: 20,
                color: "#e3f2fd",
                align: "center",
                wordWrap: { width: 700 },
            })
            .setOrigin(0.5)
            .setDepth(20)
            .setVisible(false);

        // Live code panel (top right)
        const panelW = 360;
        const panelH = 130;
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

        this.add
            .text(24, this.scale.height - 120, "Your code (one line):", {
                fontFamily: "Arial Black",
                fontSize: 18,
                color: "#fffde7",
            })
            .setDepth(25);

        this.inputText = this.add
            .text(24, this.scale.height - 92, "", {
                fontFamily: "Consolas, Courier New, monospace",
                fontSize: 22,
                color: "#1b2e1b",
                backgroundColor: "#c8e6c9",
                padding: { left: 12, right: 12, top: 10, bottom: 10 },
                wordWrap: { width: this.scale.width - 180 },
            })
            .setDepth(25);

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
        this.submitButton.on("pointerdown", () => this.submitCurrentAnswer());

        this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
            if (this.introActive) return;
            if (!this.acceptingInput) return;
            if (e.key === "Enter") {
                this.submitCurrentAnswer();
                return;
            }
            if (e.key === "Backspace") {
                this.typedBuffer = this.typedBuffer.slice(0, -1);
                this.refreshInputText();
                return;
            }
            if (e.key === "Escape") {
                this.clearTyped();
                return;
            }
            if (e.key.length === 1) {
                if (this.typedBuffer.length >= 80) return;
                if (e.key === ".") {
                    this.typedBuffer += "->";
                } else {
                    this.typedBuffer += e.key;
                }
                this.refreshInputText();
            }
        });

        this.updateScoreboardText();
        this.showIntroPopup();
        this.refreshInputText();

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.bridgeView.destroy();
            this.submitButton.removeAllListeners();
            this.input.keyboard?.removeAllListeners();
            this.introLayer?.destroy(true);
        });
    }

    update() {
        this.refreshInputText();
    }
    changeScene() {
        this.scene.start("GameOver");
    }
}
