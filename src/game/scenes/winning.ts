import Phaser, { Scene } from "phaser";
import { EventBus } from "../event-bus";

const ENDING_KEYS = [
    "ending1",
    "ending2",
    "ending3",
    "ending4",
    "ending5",
    "ending6",
    "ending7",
] as const;

const SLIDE_MS = 1200;

export class Winning extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    private backdrop!: Phaser.GameObjects.Image;
    private menuButton!: Phaser.GameObjects.Text;
    private slideIndex = 0;

    constructor() {
        super("Winning");
    }

    create() {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x0a0a12);

        this.backdrop = this.add
            .image(this.scale.width / 2, this.scale.height / 2, ENDING_KEYS[0])
            .setDepth(0);
        this.fitEndingToScreen();

        this.slideIndex = 0;
        this.scheduleNextSlide();

        EventBus.emit("current-scene-ready", this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.menuButton.removeAllListeners();
        });
    }

    private fitEndingToScreen(): void {
        this.backdrop.setDisplaySize(this.scale.width, this.scale.height);
    }

    private scheduleNextSlide(): void {
        if (this.slideIndex >= ENDING_KEYS.length - 1) {
            this.showMainMenuButton();
            return;
        }
        this.time.delayedCall(SLIDE_MS, () => {
            this.slideIndex += 1;
            this.backdrop.setTexture(ENDING_KEYS[this.slideIndex]);
            this.fitEndingToScreen();
            this.scheduleNextSlide();
        });
    }

    private showMainMenuButton(): void {
        this.menuButton = this.add
            .text(
                this.scale.width / 2,
                this.scale.height - 48,
                "Return to Main Menu",
                {
                    fontFamily: "Arial Black",
                    fontSize: 26,
                    color: "#1b2e1b",
                    backgroundColor: "#c8e6c9",
                    padding: { left: 22, right: 22, top: 12, bottom: 12 },
                },
            )
            .setOrigin(0.5, 1)
            .setDepth(100)
            .setInteractive({ useHandCursor: true });
        this.menuButton.on("pointerdown", () => {
            this.sound.play("buttonSound", { volume: 0.6 });
            this.scene.start("MainMenu");
        });
    }
}
