import { useEffect, useRef, useState } from "react";
import type { IRefPhaserGame } from "./PhaserGame";
import { PhaserGame } from "./PhaserGame";
import Phaser from "phaser";
import type { ChangeableScene } from "./game/reactable-scene";
import {
    BRIDGE_DEMO_PANEL_EVENT,
    type BridgeDemoPanelPayload,
} from "./game/demo/bridge-demo-panel";
import { EventBus } from "./game/event-bus";

/**
 * React Component that wraps the Phaser game and provides UI controls
 * to interact with the game.
 *
 * You can add buttons to change scenes, move sprites, and add new sprites
 * to the game world.
 *
 * If you need to invoke scene-specific functions,
 * update the `ChangeableScene` interface in `reactable-scene.ts` and implement
 * them in the corresponding scenes. The `changeScene` method demonstrates
 * a method that would be available in all scenes, while `moveSprite` is
 * specific to the `MainMenu` scene.
 *
 * If you don't need Scene-specific interactions, you can just use the
 * scene directly as in `addSprite`.
 *
 * If you need to invoke a function when a scene becomes active, you can
 * use the `onCurrentActiveSceneChange` prop of the `PhaserGame` component.
 *
 * If you don't want any React UI, then you can just get rid of these functions
 * and the TSX that's not needed (i.e., just return the `<PhaserGame />` component).
 *
 * @returns
 */
function App() {
    // The sprite can only be moved in the MainMenu Scene
    const [canMoveSprite, setCanMoveSprite] = useState(true);

    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame>(null);
    const [spritePosition, setSpritePosition] = useState({ x: 0, y: 0 });
    const [bridgePanel, setBridgePanel] =
        useState<BridgeDemoPanelPayload | null>(null);

    useEffect(() => {
        const onBridgePanel = (payload: BridgeDemoPanelPayload) => {
            setBridgePanel(payload);
        };
        EventBus.on(BRIDGE_DEMO_PANEL_EVENT, onBridgePanel);
        return () => {
            EventBus.off(BRIDGE_DEMO_PANEL_EVENT, onBridgePanel);
        };
    }, []);

    // Change the current scene by invoking the changeScene method
    const changeScene = () => {
        if (phaserRef.current) {
            const scene = phaserRef.current.scene as ChangeableScene | null;

            if (scene) {
                scene.changeScene();
            }
        }
    };

    // Move the sprite in the MainMenu scene by invoking the moveSprite method
    // This method may not exist in some scenes.
    const moveSprite = () => {
        if (phaserRef.current) {
            const scene = phaserRef.current.scene as
                | (Phaser.Scene & ChangeableScene)
                | null;

            // Only MainMenu scene has moveSprite method
            if (scene && scene.scene.key === "MainMenu" && scene.moveSprite) {
                scene.moveSprite(({ x, y }: { x: number; y: number }) => {
                    setSpritePosition({ x, y });
                });
            }
        }
    };

    // Add a new sprite to the current scene, doesn't require scene-specific methods
    const addSprite = () => {
        if (phaserRef.current) {
            const scene = phaserRef.current.scene;

            if (scene) {
                // Add more stars
                const x = Phaser.Math.Between(64, scene.scale.width - 64);
                const y = Phaser.Math.Between(64, scene.scale.height - 64);

                //  `add.sprite` is a Phaser GameObjectFactory method and it returns a Sprite Game Object instance
                const star = scene.add.sprite(x, y, "star");

                //  ... which you can then act upon. Here we create a Phaser Tween to fade the star sprite in and out.
                //  You could, of course, do this from within the Phaser Scene code, but this is just an example
                //  showing that Phaser objects and systems can be acted upon from outside of Phaser itself.
                scene.add.tween({
                    targets: star,
                    duration: 500 + Math.random() * 1000,
                    alpha: 0,
                    yoyo: true,
                    repeat: -1,
                });
            }
        }
    };

    // Event emitted from the PhaserGame component
    const onCurrentSceneChange = (scene: Phaser.Scene) => {
        setCanMoveSprite(scene.scene.key !== "MainMenu");
        if (scene.scene.key !== "Level1") {
            setBridgePanel(null);
        }
    };

    return (
        <div id="app">
            <div className="game-shell">
                <PhaserGame
                    ref={phaserRef}
                    onCurrentActiveSceneChange={onCurrentSceneChange}
                />
            </div>
            <div id="ui-panel">
                <div>
                    <button className="button" onClick={changeScene}>
                        Change Scene
                    </button>
                </div>
                <div>
                    <button
                        disabled={canMoveSprite}
                        className="button"
                        onClick={moveSprite}
                    >
                        Toggle Movement
                    </button>
                </div>
                <div className="spritePosition">
                    Sprite Position:
                    <pre>{`{\n  x: ${spritePosition.x}\n  y: ${spritePosition.y}\n}`}</pre>
                </div>
                <div>
                    <button className="button" onClick={addSprite}>
                        Add New Sprite
                    </button>
                </div>
                {bridgePanel ?
                    <div className="bridge-demo-panel">
                        <p className="level-question">
                            {bridgePanel.questionLine}
                        </p>
                        <p className="drag-hint">{bridgePanel.dragHintLine}</p>
                        <div className="code-live-block">
                            <div className="code-live-label">
                                List as code (updates when you drag planks)
                            </div>
                            <pre>{bridgePanel.comment}</pre>
                            <pre>{bridgePanel.diagram}</pre>
                            <pre>{bridgePanel.codeHintLine}</pre>
                        </div>
                        <p className={bridgePanel.structureOk ? "ok" : "warn"}>
                            Structure:{" "}
                            {bridgePanel.structureOk ? "OK" : "See details"}
                        </p>
                        <pre>{bridgePanel.traversalDescription}</pre>
                        <pre>{bridgePanel.traversalOutcome}</pre>
                        <pre className="verification">
                            {bridgePanel.verificationLine}
                        </pre>
                        <pre>{bridgePanel.structureLines}</pre>
                    </div>
                :   null}
            </div>
        </div>
    );
}

export default App;
