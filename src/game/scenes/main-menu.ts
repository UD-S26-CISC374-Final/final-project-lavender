import { GameObjects, Scene } from "phaser";

import { EventBus } from "../event-bus";
import type { ChangeableScene } from "../reactable-scene";

export class MainMenu extends Scene implements ChangeableScene {
    background: GameObjects.Image;
    logo: GameObjects.Image;
    title: GameObjects.Text;
    private startButton!: GameObjects.Text;
    logoTween: Phaser.Tweens.Tween | null;

    constructor() {
        super("MainMenu");
    }

    create() {
        this.background = this.add.image(512, 384, "background");

        this.logo = this.add.image(512, 300, "logo").setDepth(100);

        this.title = this.add
            .text(512, 460, "Main Menu", {
                fontFamily: "Arial Black",
                fontSize: 38,
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 8,
                align: "center",
            })
            .setOrigin(0.5)
            .setDepth(100);

        this.startButton = this.add
            .text(512, 560, "Start", {
                fontFamily: "Arial Black",
                fontSize: 30,
                color: "#1b2e1b",
                backgroundColor: "#c8e6c9",
                padding: { left: 22, right: 22, top: 12, bottom: 12 },
            })
            .setOrigin(0.5)
            .setDepth(100)
            .setInteractive({ useHandCursor: true });
        this.startButton.on("pointerdown", () => this.changeScene());

        this.input.keyboard?.on("keydown-ENTER", () => this.changeScene());

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.startButton.removeAllListeners();
            this.input.keyboard?.off("keydown-ENTER");
        });
    }

    changeScene() {
        if (this.logoTween) {
            this.logoTween.stop();
            this.logoTween = null;
        }

        this.scene.start("Level1");
    }

    moveSprite(callback: ({ x, y }: { x: number; y: number }) => void) {
        if (this.logoTween) {
            if (this.logoTween.isPlaying()) {
                this.logoTween.pause();
            } else {
                this.logoTween.play();
            }
        } else {
            this.logoTween = this.tweens.add({
                targets: this.logo,
                x: { value: 750, duration: 3000, ease: "Back.easeInOut" },
                y: { value: 80, duration: 1500, ease: "Sine.easeOut" },
                yoyo: true,
                repeat: -1,
                onUpdate: () => {
                    callback({
                        x: Math.floor(this.logo.x),
                        y: Math.floor(this.logo.y),
                    });
                },
            });
        }
    }
}
