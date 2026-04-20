import { EventBus } from "../event-bus";
import { Scene } from "phaser";
import FpsText from "../objects/fps-text";

export class BridgeDragLevel extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    fpsText: FpsText;
    bridgeTiles: Phaser.GameObjects.Image[] = [];
    slots: { x: number; y: number; occupied: boolean }[] = [];

    constructor() {
        super("bridgeDragLevel");
    }

    create() {
        this.camera = this.cameras.main;
        this.add.image(160, 600, "cliff-left");
        this.add.image(864, 600, "cliff-right");
        this.background = this.add.image(512, 384, "background");
        this.background.setAlpha(0.5);
        this.fpsText = new FpsText(this);

        this.slots = [
            { x: 400, y: 400, occupied: false },
            { x: 464, y: 400, occupied: false },
            { x: 528, y: 400, occupied: false },
        ];
        for (let i = 0; i < 5; i++) {
            const tile = this.add.image(200 + i * 100, 500, "bridge-tile");

            tile.setInteractive({ draggable: true }); // make clickable + draggable
            this.input.setDraggable(tile);

            this.bridgeTiles.push(tile);
        }

        this.input.on(
            "drag",
            (
                _pointer: Phaser.Input.Pointer,
                gameObject: Phaser.GameObjects.Image,
                dragX: number,
                dragY: number,
            ) => {
                gameObject.x = dragX;
                gameObject.y = dragY;
            },
        );

        const SNAP_DISTANCE = 50;

        this.input.on(
            "dragend",
            (
                _pointer: Phaser.Input.Pointer,
                gameObject: Phaser.GameObjects.Image,
            ) => {
                // don't re-lock already locked tiles
                if (gameObject.getData("locked")) return;

                let closestSlot = null;
                let minDist = SNAP_DISTANCE;

                for (const slot of this.slots) {
                    if (slot.occupied) continue;

                    const dist = Phaser.Math.Distance.Between(
                        gameObject.x,
                        gameObject.y,
                        slot.x,
                        slot.y,
                    );

                    if (dist < minDist) {
                        minDist = dist;
                        closestSlot = slot;
                    }
                }

                if (closestSlot) {
                    // snap into place
                    gameObject.x = closestSlot.x;
                    gameObject.y = closestSlot.y;

                    // mark slot as used
                    closestSlot.occupied = true;

                    // lock tile
                    gameObject.setData("locked", true);
                    gameObject.disableInteractive();

                    // optional: small visual feedback
                    gameObject.setTint(0x88ff88);
                }
            },
        );

        EventBus.emit("current-scene-ready", this);
    }

    update() {
        this.fpsText.update();
    }

    changeScene() {
        this.scene.start("GameOver");
    }
}
