import type { Scene } from "phaser";
import Phaser from "phaser";

import { getForwardChainNodeIds } from "../logic/forward-chain";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";
import { rechainSinglyInOrder } from "../model/linked-list-model";

const TILE_W = 88;
const TILE_H = 52;
const STEP_X = 108;

type ChainUpdated = (next: LinkedListModel) => void;

/**
 * Placeholder planks + ropes + hiker. Planks are draggable; dropping re-links `.next`
 * left-to-right and sets `head` to the leftmost tile.
 */
export class BridgePlaceholderView {
    private readonly scene: Scene;
    private layer: Phaser.GameObjects.Container | null = null;
    private tileContainers: Phaser.GameObjects.Container[] = [];
    private lastModel: LinkedListModel | null = null;
    private onChainUpdated: ChainUpdated | null = null;
    private bridgeWorldY = 430;
    private dragMinX = 160;
    private dragMaxX = 920;
    private dragListening = false;

    private readonly onDragStart = (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.GameObject,
    ) => {
        (gameObject as Phaser.GameObjects.Container).setDepth(30);
    };

    private readonly onDrag = (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.GameObject,
        dragX: number,
    ) => {
        const c = gameObject as Phaser.GameObjects.Container;
        c.x = Phaser.Math.Clamp(dragX, this.dragMinX, this.dragMaxX);
        c.y = this.bridgeWorldY;
    };

    private readonly onDragEnd = () => {
        if (!this.onChainUpdated || !this.lastModel || this.tileContainers.length === 0) {
            return;
        }
        const sorted = [...this.tileContainers].sort(
            (a, b) => a.x - b.x || String(a.getData("nodeId")).localeCompare(String(b.getData("nodeId"))),
        );
        const orderedIds = sorted.map((c): NodeId => String(c.getData("nodeId")));
        const nextModel = rechainSinglyInOrder(this.lastModel, orderedIds);
        this.onChainUpdated(nextModel);
    };

    constructor(scene: Scene) {
        this.scene = scene;
    }

    destroy(): void {
        this.stopDragInput();
        this.layer?.destroy(true);
        this.layer = null;
        this.tileContainers = [];
        this.lastModel = null;
        this.onChainUpdated = null;
    }

    private stopDragInput(): void {
        if (!this.dragListening) {
            return;
        }
        this.scene.input.off("dragstart", this.onDragStart);
        this.scene.input.off("drag", this.onDrag);
        this.scene.input.off("dragend", this.onDragEnd);
        this.dragListening = false;
    }

    private startDragInput(): void {
        if (this.dragListening) {
            return;
        }
        this.scene.input.on("dragstart", this.onDragStart);
        this.scene.input.on("drag", this.onDrag);
        this.scene.input.on("dragend", this.onDragEnd);
        this.dragListening = true;
    }

    /**
     * @param onChainUpdated Called after a drop with a new model (left → right = `head` → `.next` chain).
     */
    drawFromModel(model: LinkedListModel, onChainUpdated?: ChainUpdated): void {
        this.destroy();

        this.lastModel = model;
        this.onChainUpdated = onChainUpdated ?? null;

        const root = this.scene.add.container(0, 0);
        root.setDepth(5);
        this.layer = root;

        const chain = getForwardChainNodeIds(model);
        this.bridgeWorldY = 430;
        const startX = 240;
        const w = this.scene.scale.width;
        this.dragMinX = Math.max(120, Math.floor(w * 0.08));
        this.dragMaxX = Math.min(w - 120, Math.floor(w * 0.92));

        const leftBank = this.scene.add
            .rectangle(95, this.bridgeWorldY, 110, 200, 0x4e342e)
            .setStrokeStyle(3, 0x3e2723);
        const rightBankX = startX + Math.max(chain.length, 1) * STEP_X + 120;
        const rightBank = this.scene.add
            .rectangle(rightBankX, this.bridgeWorldY, 110, 200, 0x4e342e)
            .setStrokeStyle(3, 0x3e2723);
        root.add(leftBank);
        root.add(rightBank);

        if (chain.length === 0) {
            const msg = this.scene.add
                .text(
                    w / 2,
                    360,
                    "No forward chain from head.\nSet head and .next links to see planks.",
                    {
                        fontFamily: "Arial",
                        fontSize: 20,
                        color: "#ffccbc",
                        align: "center",
                    },
                )
                .setOrigin(0.5);
            root.add(msg);
            return;
        }

        let ropeFromX = 95 + 55;

        this.tileContainers = [];

        for (let i = 0; i < chain.length; i++) {
            const id = chain[i];
            if (!id || !(id in model.nodes)) {
                continue;
            }
            const node = model.nodes[id];
            const cx = startX + i * STEP_X;

            const rope = this.scene.add.graphics();
            rope.lineStyle(5, 0xcbb69a, 0.95);
            rope.lineBetween(ropeFromX, this.bridgeWorldY, cx - TILE_W / 2, this.bridgeWorldY);
            root.add(rope);

            const tile = this.scene.add.container(cx, this.bridgeWorldY);
            tile.setData("nodeId", id);

            const plank = this.scene.add
                .rectangle(0, 0, TILE_W, TILE_H, 0xa1887f)
                .setStrokeStyle(2, 0x5d4037);
            const valueLabel = this.scene.add
                .text(0, 0, String(node.value), {
                    fontFamily: "Arial Black",
                    fontSize: 22,
                    color: "#3e2723",
                })
                .setOrigin(0.5);
            const idHint = this.scene.add
                .text(0, 30, id, {
                    fontFamily: "Arial",
                    fontSize: 11,
                    color: "#efebe9",
                })
                .setOrigin(0.5);

            tile.add([plank, valueLabel, idHint]);

            const hitArea = new Phaser.Geom.Rectangle(-TILE_W / 2, -32, TILE_W, TILE_H + 40);
            tile.setInteractive(
                hitArea,
                (r: Phaser.Geom.Rectangle, x: number, y: number) =>
                    Phaser.Geom.Rectangle.Contains(r, x, y),
            );
            this.scene.input.setDraggable(tile);

            root.add(tile);
            this.tileContainers.push(tile);

            ropeFromX = cx + TILE_W / 2;
        }

        if (chain.length > 0) {
            const lastCx = startX + (chain.length - 1) * STEP_X + TILE_W / 2;
            const ropeEnd = this.scene.add.graphics();
            ropeEnd.lineStyle(5, 0xcbb69a, 0.95);
            ropeEnd.lineBetween(lastCx, this.bridgeWorldY, rightBankX - 55, this.bridgeWorldY);
            root.add(ropeEnd);
        }

        const hikerX = 130;
        const hikerY = this.bridgeWorldY - 95;
        const hiker = this.scene.add.circle(hikerX, hikerY, 18, 0x42a5f5).setStrokeStyle(3, 0x0d47a1);
        const hikerTag = this.scene.add
            .text(hikerX, hikerY - 32, "Hiker", {
                fontFamily: "Arial",
                fontSize: 14,
                color: "#e3f2fd",
            })
            .setOrigin(0.5);
        root.add(hiker);
        root.add(hikerTag);

        if (this.tileContainers.length > 0 && this.onChainUpdated) {
            this.startDragInput();
        }
    }
}
