import { useEffect, useRef, useState } from "react";
import type { IRefPhaserGame } from "./PhaserGame";
import { PhaserGame } from "./PhaserGame";
import Phaser from "phaser";
import {
    BRIDGE_DEMO_PANEL_EVENT,
    type BridgeDemoPanelPayload,
} from "./game/demo/bridge-demo-panel";
import { EventBus } from "./game/event-bus";

const SCENES_WITH_PANEL = new Set(["Level1", "Level2", "Level3"]);

function App() {
    const phaserRef = useRef<IRefPhaserGame>(null);
    const [bridgePanel, setBridgePanel] =
        useState<BridgeDemoPanelPayload | null>(null);
    const [activeSceneKey, setActiveSceneKey] = useState<string>("");

    useEffect(() => {
        const onBridgePanel = (payload: BridgeDemoPanelPayload) => {
            setBridgePanel(payload);
        };
        EventBus.on(BRIDGE_DEMO_PANEL_EVENT, onBridgePanel);
        return () => {
            EventBus.off(BRIDGE_DEMO_PANEL_EVENT, onBridgePanel);
        };
    }, []);

    const onCurrentSceneChange = (scene: Phaser.Scene) => {
        const key = scene.scene.key;
        setActiveSceneKey(key);
        if (!SCENES_WITH_PANEL.has(key)) {
            setBridgePanel(null);
        }
    };

    const showPanel = SCENES_WITH_PANEL.has(activeSceneKey);

    return (
        <div id="app">
            <div className="game-shell">
                <PhaserGame
                    ref={phaserRef}
                    onCurrentActiveSceneChange={onCurrentSceneChange}
                />
            </div>
            {showPanel && bridgePanel !== null ?
                <aside id="ui-panel">
                    <div className="bridge-demo-panel">
                        <h2 className="panel-heading">Puzzle</h2>
                        <p className="level-question">
                            {bridgePanel.questionLine}
                        </p>
                        <p className="drag-hint">{bridgePanel.dragHintLine}</p>

                        <div className="code-live-block">
                            <div className="code-live-label">
                                List as code (updates with the bridge below)
                            </div>
                            <pre className="code-comment">
                                {bridgePanel.comment}
                            </pre>
                            <pre className="code-diagram">
                                {bridgePanel.diagram}
                            </pre>
                            <pre className="code-hint">
                                {bridgePanel.codeHintLine}
                            </pre>
                        </div>

                        <div className="status-block">
                            <p
                                className={
                                    bridgePanel.structureOk ? "ok" : "warn"
                                }
                            >
                                Structure:{" "}
                                {bridgePanel.structureOk ?
                                    "all pointers OK"
                                :   "see details below"}
                            </p>
                            <pre>{bridgePanel.traversalDescription}</pre>
                            <pre>{bridgePanel.traversalOutcome}</pre>
                            <pre className="verification">
                                {bridgePanel.verificationLine}
                            </pre>
                            <pre className="structure-lines">
                                {bridgePanel.structureLines}
                            </pre>
                        </div>
                    </div>
                </aside>
            :   null}
        </div>
    );
}

export default App;
