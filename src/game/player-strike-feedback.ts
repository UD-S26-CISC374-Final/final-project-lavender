import type { Scene } from "phaser";

const WRONG_FACE_MS = 650;

/** Briefly swap Alex to the wrong-answer portrait, then restore idle. */
export function showBriefAlexWrong(
    scene: Scene,
    player: Phaser.Physics.Arcade.Sprite,
): void {
    player.anims.stop();
    player.setTexture("alex_wrong");
    scene.time.delayedCall(WRONG_FACE_MS, () => {
        if (!player.active) return;
        player.setTexture("alex", 5);
        player.anims.play("turn");
    });
}

/** Third strike: keep `alex_wrong`, fall off-screen, then start `nextSceneKey`. */
export function runAlexWrongFallToScene(
    scene: Scene,
    player: Phaser.Physics.Arcade.Sprite,
    nextSceneKey: string,
): void {
    player.anims.stop();
    player.setTexture("alex_wrong");
    const body = player.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
        body.setAllowGravity(false);
        body.setVelocity(0, 0);
    }
    player.setCollideWorldBounds(false);
    player.setDepth(200);
    if (body) {
        player.refreshBody();
    }
    scene.tweens.add({
        targets: player,
        y: scene.scale.height + 160,
        angle: 22,
        duration: 2200,
        ease: "Cubic.easeIn",
        onComplete: () => {
            scene.scene.start(nextSceneKey);
        },
    });
}
