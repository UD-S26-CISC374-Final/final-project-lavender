import Phaser, { Scene } from "phaser";
import { EventBus } from "../event-bus";

import {
    BRIDGE_DEMO_PANEL_EVENT,
    buildBridgeDemoPanelPayload,
} from "../demo/bridge-demo-panel";
import type { TraversalStep } from "../logic/traverse";
import {
    generateSinglyChainWithBoundedNextHops,
    generateSinglyChainWithTraversalTask,
} from "../logic/random-singly-bridge";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";
import { BridgePlaceholderView } from "../objects/bridge-placeholder-view";
import FpsText from "../objects/fps-text";
import { getForwardChainNodeIds } from "../logic/forward-chain";

type Level1QuestionType = "traversal_click" | "drag_largest_to_last";

type RoundTask = {
    model: LinkedListModel;
    steps: TraversalStep[];
    answerNodeId: NodeId;
    type: Level1QuestionType;
    questionLine: string;
};

export class Level1 extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    fpsText: FpsText;
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
    private selectedNodeId: NodeId | null = null;
    private correctCount = 0;
    private incorrectCount = 0;

    constructor() {
        super("Level1");
        this.bridgeView = new BridgePlaceholderView(this);
    }

    private buildTraversalClickQuestion(): RoundTask {
        const chainLength = Phaser.Math.Between(3, 6);
        const task = generateSinglyChainWithBoundedNextHops(chainLength);
        const hops = task.steps.map((step) => `.${step}`).join("");
        return {
            model: task.model,
            steps: task.steps,
            answerNodeId: task.answerNodeId,
            type: "traversal_click",
            questionLine: `Click the tile that the hiker will land on if he travels head${hops}`,
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
            questionLine: "Move the tile with the largest value to the last node.",
        };
    }

    private findLargestNodeId(chainIds: readonly NodeId[], model: LinkedListModel): NodeId {
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

    private buildCodeHintLine(model: LinkedListModel, targetNodeId: NodeId): string {
        const chain = getForwardChainNodeIds(model);
        const index = chain.indexOf(targetNodeId);
        if (index <= 0) {
            return "let node = head;";
        }
        let line = "let node = head";
        for (let i = 0; i < index; i++) {
            line += ".next";
        }
        return `${line};`;
    }

    private createRoundTask(): RoundTask {
        const type = Phaser.Math.Between(0, 1) === 0 ? "traversal_click" : "drag_largest_to_last";
        return type === "traversal_click"
            ? this.buildTraversalClickQuestion()
            : this.buildLargestToLastQuestion();
    }

    private pushPanelPayload(nextModel: LinkedListModel): void {
        const dragHintLine =
            this.currentQuestionType === "drag_largest_to_last"
                ? "Drag tiles to reorder the linked list, then press Submit."
                : "Click a tile to select your answer, then press Submit.";
        const codeHintLine =
            this.currentQuestionType === "drag_largest_to_last"
                ? this.buildCodeHintLine(nextModel, this.taskAnswerNodeId)
                : "// Click-question mode: follow head.next hops mentally.";
        EventBus.emit(
            BRIDGE_DEMO_PANEL_EVENT,
            buildBridgeDemoPanelPayload(nextModel, this.taskSteps, this.taskAnswerNodeId, {
                questionLine: this.currentQuestionLine,
                dragHintLine,
                codeHintLine,
            }),
        );
    }

    private readonly onTileSelected = (nodeId: NodeId) => {
        this.selectedNodeId = nodeId;
    };

    private readonly applyModelAndRedraw = (next: LinkedListModel) => {
        this.currentModel = next;
        this.pushPanelPayload(next);
        this.bridgeView.drawFromModel(next, this.applyModelAndRedraw, this.onTileSelected);
        this.bridgeView.setDragEnabled(this.currentQuestionType === "drag_largest_to_last");
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
        if (this.currentQuestionType === "traversal_click") {
            return this.selectedNodeId !== null && this.selectedNodeId === this.taskAnswerNodeId;
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
            this.scene.start("GameOver");
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
        this.selectedNodeId = null;
        this.hintText.setText(task.questionLine);
        this.applyModelAndRedraw(task.model);
        this.bridgeView.clearSelection();
    }

    create() {
        this.correctCount = 0;
        this.incorrectCount = 0;

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x1b2e1b);

        this.background = this.add.image(512, 384, "background");
        this.background.setAlpha(0.25);

        this.fpsText = new FpsText(this);

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
        this.fpsText.update();
    }

    changeScene() {
        this.scene.start("GameOver");
    }
}
