import type { Scene } from "phaser";
import Phaser from "phaser";

import { getForwardChainNodeIds } from "../logic/forward-chain";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";
import { rechainSinglyInOrder } from "../model/linked-list-model";

const TILE_W = 88;
const TILE_H = 52;
const STEP_X = 108;

type ChainUpdated = (next: LinkedListModel) => void;
type TileSelected = (nodeId: NodeId) => void;
type NodeLabelById = ReadonlyMap<NodeId, string>;

/**
 * Placeholder planks + ropes + hiker. Planks are draggable; dropping re-links `.next`
 * left-to-right and sets `head` to the leftmost tile.
 */
export class BridgePlaceholderView {
    private readonly scene: Scene;
    private layer: Phaser.GameObjects.Container | null = null;
    private tileContainers: Phaser.GameObjects.Container[] = [];
    private tileByNodeId = new Map<NodeId, Phaser.GameObjects.Container>();
    private ropeGraphics: Phaser.GameObjects.Graphics[] = [];
    private lastModel: LinkedListModel | null = null;
    private onChainUpdated: ChainUpdated | null = null;
    private onTileSelected: TileSelected | null = null;
    private bridgeWorldY = 430;
    private layoutStartX = 240;
    private dragMinX = 160;
    private dragMaxX = 920;
    private dragListening = false;
    private dragEnabled = true;
    private selectedTileNodeId: NodeId | null = null;
    /** Chain order when the current drag began (insertion reordering uses this as the base). */
    private orderAtDragStart: NodeId[] = [];
    private draggingNodeId: NodeId | null = null;

    private readonly onDragStart = (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.GameObject,
    ) => {
        if (!this.lastModel || this.tileContainers.length === 0) {
            return;
        }
        const c = gameObject as Phaser.GameObjects.Container;
        c.setDepth(30);
        this.orderAtDragStart = [...getForwardChainNodeIds(this.lastModel)];
        this.draggingNodeId = String(c.getData("nodeId"));
        for (const g of this.ropeGraphics) {
            g.setVisible(false);
        }
    };

    private readonly onDrag = (
        _pointer: Phaser.Input.Pointer,
        _gameObject: Phaser.GameObjects.GameObject,
        dragX: number,
    ) => {
        if (
            !this.draggingNodeId ||
            this.orderAtDragStart.length === 0 ||
            !this.lastModel
        ) {
            return;
        }
        const n = this.orderAtDragStart.length;
        const clampedX = Phaser.Math.Clamp(dragX, this.dragMinX, this.dragMaxX);

        const insertIndex = Phaser.Math.Clamp(
            Math.round((clampedX - this.layoutStartX) / STEP_X),
            0,
            n - 1,
        );
        const without = this.orderAtDragStart.filter(
            (id) => id !== this.draggingNodeId,
        );
        const tentative: NodeId[] = [...without];
        tentative.splice(insertIndex, 0, this.draggingNodeId);

        tentative.forEach((id, slot) => {
            const tile = this.tileByNodeId.get(id);
            if (!tile) {
                return;
            }
            tile.x = this.layoutStartX + slot * STEP_X;
            tile.y = this.bridgeWorldY;
        });
    };

    private readonly onDragEnd = (
        pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.GameObject,
    ) => {
        void pointer;
        void gameObject;
        for (const g of this.ropeGraphics) {
            g.setVisible(true);
        }
        this.draggingNodeId = null;
        this.orderAtDragStart = [];

        if (
            !this.onChainUpdated ||
            !this.lastModel ||
            this.tileContainers.length === 0
        ) {
            return;
        }
        const sorted = [...this.tileContainers].sort(
            (a, b) =>
                a.x - b.x ||
                String(a.getData("nodeId")).localeCompare(
                    String(b.getData("nodeId")),
                ),
        );
        const orderedIds = sorted.map(
            (container): NodeId => String(container.getData("nodeId")),
        );
        const nextModel = rechainSinglyInOrder(this.lastModel, orderedIds);
        this.onChainUpdated(nextModel);
    };

    private readonly onTilePointerDown = (nodeId: NodeId) => {
        this.setSelectedNodeId(nodeId);
        if (this.onTileSelected) {
            this.onTileSelected(nodeId);
        }
    };

    constructor(scene: Scene) {
        this.scene = scene;
    }

    destroy(): void {
        this.stopDragInput();
        this.layer?.destroy(true);
        this.layer = null;
        this.tileContainers = [];
        this.tileByNodeId.clear();
        this.ropeGraphics = [];
        this.lastModel = null;
        this.onChainUpdated = null;
        this.onTileSelected = null;
        this.selectedTileNodeId = null;
        this.orderAtDragStart = [];
        this.draggingNodeId = null;
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
    drawFromModel(
        model: LinkedListModel,
        onChainUpdated?: ChainUpdated,
        onTileSelected?: TileSelected,
        nodeLabelById?: NodeLabelById,
    ): void {
        this.destroy();

        this.lastModel = model;
        this.onChainUpdated = onChainUpdated ?? null;
        this.onTileSelected = onTileSelected ?? null;

        const root = this.scene.add.container(0, 0);
        root.setDepth(5);
        this.layer = root;

        const chain = getForwardChainNodeIds(model);
        this.bridgeWorldY = 430;
        const startX = 240;
        this.layoutStartX = startX;
        this.ropeGraphics = [];
        this.tileByNodeId.clear();
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
            rope.lineBetween(
                ropeFromX,
                this.bridgeWorldY,
                cx - TILE_W / 2,
                this.bridgeWorldY,
            );
            this.ropeGraphics.push(rope);
            root.add(rope);

            const tile = this.scene.add.container(cx, this.bridgeWorldY);
            tile.setData("nodeId", id);

            // Use a pixel-art image for the plank and a transparent rectangle as a border
            const plankImage = this.scene.add
                .image(0, 0, "tile")
                .setOrigin(0.5)
                .setDisplaySize(TILE_W, TILE_H);
            const plankBorder = this.scene.add
                .rectangle(0, 0, TILE_W, TILE_H, 0x000000, 0)
                .setStrokeStyle(2, 0x5d4037);
            const valueLabel = this.scene.add
                .text(0, 0, String(node.value), {
                    fontFamily: "Arial Black",
                    fontSize: 22,
                    color: "#3e2723",
                })
                .setOrigin(0.5);
            const idHint = this.scene.add
                .text(0, 30, nodeLabelById?.get(id) ?? id, {
                    fontFamily: "Arial",
                    fontSize: 11,
                    color: "#efebe9",
                })
                .setOrigin(0.5);

            tile.add([plankImage, plankBorder, valueLabel, idHint]);

            const hitArea = new Phaser.Geom.Rectangle(
                -TILE_W / 2,
                -32,
                TILE_W,
                TILE_H + 40,
            );
            tile.setInteractive(
                hitArea,
                (r: Phaser.Geom.Rectangle, x: number, y: number) =>
                    Phaser.Geom.Rectangle.Contains(r, x, y),
            );
            tile.on("pointerdown", () => {
                const tileId = String(tile.getData("nodeId"));
                this.onTilePointerDown(tileId);
            });
            this.scene.input.setDraggable(tile, this.dragEnabled);

            root.add(tile);
            this.tileContainers.push(tile);
            this.tileByNodeId.set(id, tile);

            ropeFromX = cx + TILE_W / 2;
        }

        if (chain.length > 0) {
            const lastCx = startX + (chain.length - 1) * STEP_X + TILE_W / 2;
            const ropeEnd = this.scene.add.graphics();
            ropeEnd.lineStyle(5, 0xcbb69a, 0.95);
            ropeEnd.lineBetween(
                lastCx,
                this.bridgeWorldY,
                rightBankX - 55,
                this.bridgeWorldY,
            );
            this.ropeGraphics.push(ropeEnd);
            root.add(ropeEnd);
        }

        this.refreshSelectionVisuals();

        if (
            this.dragEnabled &&
            this.tileContainers.length > 0 &&
            this.onChainUpdated
        ) {
            this.startDragInput();
        }
    }

    setDragEnabled(enabled: boolean): void {
        this.dragEnabled = enabled;
        for (const tile of this.tileContainers) {
            this.scene.input.setDraggable(tile, enabled);
        }
        if (!enabled) {
            this.stopDragInput();
            return;
        }
        if (this.tileContainers.length > 0 && this.onChainUpdated) {
            this.startDragInput();
        }
    }

    clearSelection(): void {
        this.setSelectedNodeId(null);
    }

    getSelectedNodeId(): NodeId | null {
        return this.selectedTileNodeId;
    }

    /** Programmatically set which tile is "selected" (for keyboard-controlled levels). */
    setSelectedNodeId(nodeId: NodeId | null): void {
        this.selectedTileNodeId = nodeId;
        this.refreshSelectionVisuals();
    }

    /** Returns the node id of the tile under the given point, if any. */
    getNodeIdAtWorldPoint(x: number, y: number): NodeId | null {
        for (const tile of this.tileContainers) {
            const bounds = tile.getBounds();
            if (bounds.contains(x, y)) {
                return String(tile.getData("nodeId"));
            }
        }
        return null;
    }

    private refreshSelectionVisuals(): void {
        for (const tile of this.tileContainers) {
            const nodeId = String(tile.getData("nodeId"));
            const image = tile.list.find(
                (item): item is Phaser.GameObjects.Image =>
                    item instanceof Phaser.GameObjects.Image,
            );
            const border = tile.list.find(
                (item): item is Phaser.GameObjects.Rectangle =>
                    item instanceof Phaser.GameObjects.Rectangle,
            );
            if (!image || !border) {
                continue;
            }
            const isSelected = this.selectedTileNodeId === nodeId;
            // Tint the image slightly when selected and thicken the border
            image.clearTint();
            border.setStrokeStyle(isSelected ? 4 : 2, isSelected ? 0xfff59d : 0x5d4037);
            if (isSelected) {
                image.setTint(0xfff59d);
            }
        }
    }
}
