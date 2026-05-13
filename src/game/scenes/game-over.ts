import { EventBus } from "../event-bus";
import { Scene } from "phaser";

export class GameOver extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    gameOverText: Phaser.GameObjects.Text;
    private mainMenuButton!: Phaser.GameObjects.Text;

    constructor() {
        super("GameOver");
    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0xff0000);

        this.background = this.add.image(512, 384, "background");
        this.background.setAlpha(0.5);

        this.gameOverText = this.add
            .text(512, 384, "Game Over", {
                fontFamily: "Arial Black",
                fontSize: 64,
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 8,
                align: "center",
            })
            .setOrigin(0.5)
            .setDepth(100);

        this.mainMenuButton = this.add
            .text(512, 500, "Main Menu", {
                fontFamily: "Arial Black",
                fontSize: 30,
                color: "#1b2e1b",
                backgroundColor: "#c8e6c9",
                padding: { left: 22, right: 22, top: 12, bottom: 12 },
            })
            .setOrigin(0.5)
            .setDepth(100)
            .setInteractive({ useHandCursor: true });
        this.mainMenuButton.on("pointerdown", () => this.changeScene());

        this.input.keyboard?.on("keydown-ENTER", () => this.changeScene());

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.mainMenuButton?.removeAllListeners();
            this.input.keyboard?.off("keydown-ENTER");
        });
    }

    changeScene() {
        // Full restart so a fresh playthrough behaves identically.
        if (typeof window !== "undefined") {
            window.location.reload();
            return;
        }
        this.scene.start("MainMenu");
    }
}
