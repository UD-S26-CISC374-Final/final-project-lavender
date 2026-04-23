import Phaser, { Scene } from "phaser";
import { EventBus } from "../event-bus";

import {
    BRIDGE_DEMO_PANEL_EVENT,
    buildBridgeDemoPanelPayload,
} from "../demo/bridge-demo-panel";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";
import { BridgePlaceholderView } from "../objects/bridge-placeholder-view";
import { getForwardChainNodeIds } from "../logic/forward-chain";
import {
    generateDeleteByValueTask,
    generateInsertAfterTask,
    generateStructureIdentifyTask,
    type StructureKind,
} from "../logic/random-structure-task";

type Level2QuestionType =
    | "structure_identify"
    | "delete_by_value_click"
    | "insert_after_click";

type RoundTask = {
    model: LinkedListModel;
    type: Level2QuestionType;
    questionLine: string;
    codeHintLine: string;
    answerNodeId?: NodeId;
    expectedKind?: StructureKind;
    insertValue?: number;
    deleteValue?: number;
};

// Geometry constants must stay in sync with BridgePlaceholderView so the
// backlink overlay lines up with the rendered planks.
const TILE_W = 88;
const STEP_X = 108;
const BRIDGE_LAYOUT_START_X = 240;
const BRIDGE_WORLD_Y = 430;

export class Level2 extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    hintText: Phaser.GameObjects.Text;
    private scoreboardText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;
    private submitButton!: Phaser.GameObjects.Text;
    private singlyButton!: Phaser.GameObjects.Text;
    private doublyButton!: Phaser.GameObjects.Text;
    private bridgeView: BridgePlaceholderView;
    private backLinkGraphics: Phaser.GameObjects.Graphics | null = null;
    private currentTask: RoundTask | null = null;
    private currentNodeLabels = new Map<NodeId, string>();
    private selectedNodeId: NodeId | null = null;
    private selectedStructureKind: StructureKind | null = null;
    private correctCount = 0;
    private incorrectCount = 0;
    private player?: Phaser.Physics.Arcade.Sprite;
    private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
    private readonly bridgePlayerY = 365;

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

    private createRoundTask(): RoundTask {
        const roll = Phaser.Math.Between(0, 2);
        if (roll === 0) {
            const task = generateStructureIdentifyTask();
            const prevHint =
                task.expectedKind === "doubly" ?
                    "Yellow backlinks under each plank mark ->prev connections."
                :   "No backlinks appear — only ->next connections.";
            return {
                model: task.model,
                type: "structure_identify",
                expectedKind: task.expectedKind,
                questionLine:
                    "Is this bridge a singly or doubly linked list? Choose Singly or Doubly, then press Submit.",
                codeHintLine: `// ${prevHint} Doubly lists have both ->next and ->prev; singly lists have only ->next.`,
            };
        }
        if (roll === 1) {
            const task = generateDeleteByValueTask();
            return {
                model: task.model,
                type: "delete_by_value_click",
                answerNodeId: task.answerNodeId,
                deleteValue: task.targetValue,
                questionLine: `Move Alex onto the tile with value ${task.targetValue} that must be removed, then press Submit.`,
                codeHintLine: `// To delete node with value ${task.targetValue}: prev->next = node->next;`,
            };
        }
        const task = generateInsertAfterTask();
        return {
            model: task.model,
            type: "insert_after_click",
            answerNodeId: task.answerNodeId,
            insertValue: task.insertValue,
            questionLine: `A new tile with value ${task.insertValue} must be inserted in sorted order. Move Alex onto the tile it should come AFTER, then press Submit.`,
            codeHintLine: `// To insert value ${task.insertValue}: newNode->next = node->next; node->next = newNode;`,
        };
    }

    private readonly onTileSelected = (nodeId: NodeId) => {
        if (this.currentTask?.type === "structure_identify") {
            return;
        }
        // Click-to-select is disabled for keyboard questions, but keep this for safety.
        this.selectedNodeId = nodeId;
    };

    private readonly applyModelAndRedraw = (next: LinkedListModel) => {
        this.pushPanelPayload(next);
        this.bridgeView.drawFromModel(
            next,
            this.applyModelAndRedraw,
            this.onTileSelected,
            this.currentNodeLabels,
        );
        this.bridgeView.setDragEnabled(false);
        this.drawDoublyBackLinks(next);
    };

    private drawDoublyBackLinks(model: LinkedListModel): void {
        if (this.backLinkGraphics) {
            this.backLinkGraphics.destroy();
            this.backLinkGraphics = null;
        }
        if (model.kind !== "doubly") {
            return;
        }
        const chain = getForwardChainNodeIds(model);
        if (chain.length < 2) {
            return;
        }
        const graphics = this.add.graphics();
        graphics.setDepth(6);
        graphics.lineStyle(3, 0xffd54f, 0.95);
        const y = BRIDGE_WORLD_Y + 40;
        for (let i = 1; i < chain.length; i++) {
            const rightCx = BRIDGE_LAYOUT_START_X + i * STEP_X;
            const leftCx = BRIDGE_LAYOUT_START_X + (i - 1) * STEP_X;
            const xFrom = rightCx - TILE_W / 2;
            const xTo = leftCx + TILE_W / 2;
            graphics.lineBetween(xFrom, y, xTo, y);
            graphics.fillStyle(0xffd54f, 1);
            graphics.fillTriangle(xTo, y, xTo + 8, y - 5, xTo + 8, y + 5);
        }
        this.backLinkGraphics = graphics;
    }

    private pushPanelPayload(model: LinkedListModel): void {
        const task = this.currentTask;
        if (!task) {
            return;
        }
        const dragHintLine =
            task.type === "structure_identify" ?
                "Choose Singly or Doubly using the buttons, then press Submit."
            : task.type === "delete_by_value_click" ?
                "Use arrow keys to move Alex onto the tile, then press Submit to delete."
            :   "Use arrow keys to move Alex onto the tile, then press Submit.";
        EventBus.emit(
            BRIDGE_DEMO_PANEL_EVENT,
            buildBridgeDemoPanelPayload(model, [], task.answerNodeId, {
                questionLine: task.questionLine,
                dragHintLine,
                codeHintLine: task.codeHintLine,
            }),
        );
    }

    private updateScoreboardText(): void {
        this.scoreboardText.setText([
            `Correct: ${this.correctCount}`,
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

    private submitCurrentAnswer(): void {
        const correct = this.isSubmissionCorrect();
        if (correct) {
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
            this.scene.start("Level3");
            return;
        }
        this.startNewRound();
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
        this.applyModelAndRedraw(task.model);
        this.bridgeView.clearSelection();
        this.refreshStructureButtons();

        if (this.player && this.currentTask.type !== "structure_identify") {
            this.player.setPosition(100, this.bridgePlayerY + 47);
            this.player.setVelocity(0, 0);
        }
    }

    create() {
        this.correctCount = 0;
        this.incorrectCount = 0;

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
            .text(this.scale.width / 2, 18, "Level 2", {
                fontFamily: "Arial Black",
                fontSize: 22,
                color: "#ffecb3",
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
        this.startNewRound();

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.bridgeView.destroy();
            this.submitButton.removeAllListeners();
            this.singlyButton.removeAllListeners();
            this.doublyButton.removeAllListeners();
            if (this.backLinkGraphics) {
                this.backLinkGraphics.destroy();
                this.backLinkGraphics = null;
            }
        });
    }

    update() {
        const task = this.currentTask;
        if (task && task.type !== "structure_identify") {
            const p = this.player;
            if (p) {
                // Use Alex's "feet" instead of his sprite center so the probe point
                // overlaps the plank bounds reliably.
                const footY = p.y + p.displayHeight * 0.5;
                const nodeId = this.bridgeView.getNodeIdAtWorldPoint(p.x, footY);
                this.selectedNodeId = nodeId;
                this.bridgeView.setSelectedNodeId(nodeId);
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
        } else {
            this.player?.setVelocityX(0);
            this.player?.anims.play("turn");
            this.bridgeView.setSelectedNodeId(null);
            this.selectedNodeId = null;
        }
    }

    changeScene() {
        this.scene.start("Level3");
    }
}
