import Phaser, { Scene } from "phaser";
import { EventBus } from "../event-bus";
import {
    BRIDGE_DEMO_PANEL_EVENT,
    buildBridgeDemoPanelPayload,
} from "../demo/bridge-demo-panel";
import { BridgePlaceholderView } from "../objects/bridge-placeholder-view";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";
import { getForwardChainNodeIds } from "../logic/forward-chain";
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
    hintText: Phaser.GameObjects.Text;
    private scoreboardText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;
    private submitButton!: Phaser.GameObjects.Text;
    private inputText!: Phaser.GameObjects.Text;

    private bridgeView: BridgePlaceholderView;
    private player?: Phaser.Physics.Arcade.Sprite;
    private currentTask: RoundTask | null = null;
    private currentNodeLabels = new Map<NodeId, string>();
    private typedBuffer = "";
    private correctCount = 0;
    private incorrectCount = 0;
    private acceptingInput = true;
    private readonly bridgePlayerY = 365;

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

    private createRoundTask(): RoundTask {
        // Ensure we have at least 4 nodes so `curr->next->next` exists for some tasks.
        for (let attempt = 0; attempt < 12; attempt++) {
            const model = generateRandomSinglyChain(Phaser.Math.Between(4, 6));
            const chain = getForwardChainNodeIds(model);
            if (chain.length < 4) continue;

            const roll = Phaser.Math.Between(0, 3);
            const type: Level3TaskType =
                roll === 0 ? "skip_next"
                : roll === 1 ? "point_next_to_head"
                : roll === 2 ? "delete_head"
                : "cut_after_curr";

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

            // cut_after_curr
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

        // Fallback (should be rare)
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
                    "Type your code below (example: curr->next = curr->next->next;) then press Submit.",
                codeHintLine:
                    "// Only ONE statement. Use reassignment (e.g. curr->next = ...).",
            }),
        );
    }

    private readonly applyModelAndRedraw = (next: LinkedListModel) => {
        this.pushPanelPayload(next);
        this.bridgeView.drawFromModel(
            next,
            undefined,
            undefined,
            this.currentNodeLabels,
        );
        this.bridgeView.setDragEnabled(false);
    };

    private updateScoreboardText(): void {
        this.scoreboardText.setText([
            `Correct: ${this.correctCount}`,
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
        // cut_after_curr
        const nextModel = cloneSinglyModel(task.model);
        nextModel.nodes[task.currId] = {
            ...nextModel.nodes[task.currId],
            next: null,
        };
        return nextModel;
    }

    private submitCurrentAnswer(): void {
        const task = this.currentTask;
        const correct = this.isTypedAnswerCorrect();
        if (correct) {
            this.correctCount += 1;
            this.feedbackText.setText("Correct! Statement compiled.");
            this.feedbackText.setColor("#7ae582");
        } else {
            this.incorrectCount += 1;
            const answer =
                task?.expectedStatements[0] ?
                    `Correct answer: ${task.expectedStatements[0]}`
                :   "";
            this.feedbackText.setText(
                answer ? `Not quite.\n${answer}` : "Not quite.",
            );
            this.feedbackText.setColor("#ff9e6c");
        }
        this.updateScoreboardText();

        if (this.correctCount - this.incorrectCount >= 5) {
            this.scene.start("GameOver");
            return;
        }

        const nextModel = this.applyTypedAnswerIfCorrect();
        if (nextModel) {
            // Show the effect briefly, then move on.
            this.acceptingInput = false;
            this.currentTask = { ...this.currentTask!, model: nextModel };
            this.applyModelAndRedraw(nextModel);
            this.time.delayedCall(650, () => {
                this.acceptingInput = true;
                this.startNewRound();
            });
            return;
        }

        // If incorrect, give the player a moment to read the answer.
        if (!correct) {
            this.acceptingInput = false;
            this.time.delayedCall(1200, () => {
                this.acceptingInput = true;
                this.startNewRound();
            });
            return;
        }

        this.startNewRound();
    }

    private startNewRound(): void {
        const task = this.createRoundTask();
        this.currentTask = task;
        this.currentNodeLabels = this.buildDisplayLabels(
            task.model,
            task.currId,
        );
        this.hintText.setText(task.promptLine);
        this.clearTyped();
        this.applyModelAndRedraw(task.model);
        this.bridgeView.clearSelection();
    }

    create() {
        this.correctCount = 0;
        this.incorrectCount = 0;

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x231942);

        this.background = this.add.image(512, 384, "background");
        this.background.setAlpha(0.25);

        this.player = this.physics.add.sprite(240, this.bridgePlayerY, "alex");
        this.player.setCollideWorldBounds(true);
        (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

        this.anims.create({
            key: "turn",
            frames: [{ key: "alex", frame: 5 }],
            frameRate: 20,
        });
        this.player.anims.play("turn");

        this.hintText = this.add
            .text(24, 16, "", {
                fontFamily: "Arial",
                fontSize: 18,
                color: "#fffde7",
                lineSpacing: 4,
                wordWrap: { width: this.scale.width - 48 },
            })
            .setDepth(10);

        /*this.add
            .text(this.scale.width / 2, 18, "Level 3", {
                fontFamily: "Arial Black",
                fontSize: 22,
                color: "#e9d8fd",
            })
            .setOrigin(0.5, 0)
            .setDepth(20);
*/
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
                // Basic input filter; allows symbols used in assignments.
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
        this.startNewRound();
        this.refreshInputText();

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.bridgeView.destroy();
            this.submitButton.removeAllListeners();
            this.input.keyboard?.removeAllListeners();
        });
    }

    update() {
        this.refreshInputText();
    }
}
