import Phaser, { Scene } from "phaser";
import { EventBus } from "../event-bus";

import {
    BRIDGE_DEMO_PANEL_EVENT,
    buildBridgeDemoPanelPayload,
    buildTraversalQuestionLine,
} from "../demo/bridge-demo-panel";
import type { TraversalStep } from "../logic/traverse";
import { generateSinglyChainWithTraversalTask } from "../logic/random-singly-bridge";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";
import { BridgePlaceholderView } from "../objects/bridge-placeholder-view";
import FpsText from "../objects/fps-text";

export class Level1 extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    fpsText: FpsText;
    hintText: Phaser.GameObjects.Text;
    private bridgeView: BridgePlaceholderView;
    private taskSteps!: TraversalStep[];
    private taskAnswerNodeId!: NodeId;

    constructor() {
        super("Level1");
        this.bridgeView = new BridgePlaceholderView(this);
    }

    private readonly applyModelAndRedraw = (next: LinkedListModel) => {
        EventBus.emit(
            BRIDGE_DEMO_PANEL_EVENT,
            buildBridgeDemoPanelPayload(next, this.taskSteps, this.taskAnswerNodeId),
        );
        this.bridgeView.drawFromModel(next, this.applyModelAndRedraw);
    };

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x1b2e1b);

        this.background = this.add.image(512, 384, "background");
        this.background.setAlpha(0.25);

        this.fpsText = new FpsText(this);

        const chainLength = Phaser.Math.Between(3, 6);
        const task = generateSinglyChainWithTraversalTask(chainLength, 2);

        this.taskSteps = task.steps;
        this.taskAnswerNodeId = task.answerNodeId;

        const questionOnly = buildTraversalQuestionLine(task.steps);
        this.hintText = this.add
            .text(24, 16, questionOnly, {
                fontFamily: "Arial",
                fontSize: 18,
                color: "#fffde7",
                lineSpacing: 4,
                wordWrap: { width: this.scale.width - 48 },
            })
            .setDepth(10);

        this.bridgeView.drawFromModel(task.model, this.applyModelAndRedraw);
        EventBus.emit(
            BRIDGE_DEMO_PANEL_EVENT,
            buildBridgeDemoPanelPayload(task.model, task.steps, task.answerNodeId),
        );

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.bridgeView.destroy();
        });
    }

    update() {
        this.fpsText.update();
    }

    changeScene() {
        this.scene.start("GameOver");
    }
}
