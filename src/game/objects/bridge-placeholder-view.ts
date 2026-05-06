import type { Scene } from "phaser";
import Phaser from "phaser";

import { getForwardChainNodeIds } from "../logic/forward-chain";
import type { LinkedListModel, NodeId } from "../model/linked-list-model";
import { rechainSinglyInOrder } from "../model/linked-list-model";

const TILE_W = 88;
const TILE_H = 52;
const STEP_X = 108;
const CLIFF_H = 850;
const CLIFF_W = 450;

type ChainUpdated = (next: LinkedListModel) => void;
type TileSelected = (nodeId: NodeId) => void;
type NodeLabelById = ReadonlyMap<NodeId, string>;

type DrawOptions = {
    /**
     * When true (default), the visuals emphasize a doubly-linked list:
     * orange tinted planks and visible <-> connectors. Has no effect when the
     * underlying model is singly-linked.
     */
    accentDoubly?: boolean;
};

/**
 * Draws the bridge: planks (nodes), ropes (->next), arrowheads, optional <-prev
 * connectors for doubly lists, and label badges. Handles drag-to-reorder and
 * exposes helpers used by the level scenes (selection visuals, traversal
 * animation, correct/wrong flashes, and bridge-bounds for clamping the player).
 */
export class BridgePlaceholderView {
    private readonly scene: Scene;
    private layer: Phaser.GameObjects.Container | null = null;
    private tileContainers: Phaser.GameObjects.Container[] = [];
    private tileByNodeId = new Map<NodeId, Phaser.GameObjects.Container>();
    private ropeGraphics: Phaser.GameObjects.Graphics[] = [];
    private backLinkGraphics: Phaser.GameObjects.Graphics | null = null;
    private lastModel: LinkedListModel | null = null;
    private onChainUpdated: ChainUpdated | null = null;
    private onTileSelected: TileSelected | null = null;
    private bridgeWorldY: number = 485;
    private layoutStartX: number = 240;
    private dragMinX = 160;
    private dragMaxX = 920;
    private dragListening = false;
    private dragEnabled = true;
    private selectedTileNodeId: NodeId | null = null;
    private accentDoubly = true;
    /** Chain order when the current drag began. */
    private orderAtDragStart: NodeId[] = [];
    private draggingNodeId: NodeId | null = null;
    private draggedTileMover: ((tileX: number) => void) | null = null;

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
        if (this.backLinkGraphics) {
            this.backLinkGraphics.setVisible(false);
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

        // Notify the level so it can move other game objects (like Alex)
        // along with the dragged tile.
        if (this.draggedTileMover) {
            const tile = this.tileByNodeId.get(this.draggingNodeId);
            if (tile) {
                this.draggedTileMover(tile.x);
            }
        }
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
        if (this.backLinkGraphics) {
            this.backLinkGraphics.setVisible(true);
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
        if (this.backLinkGraphics) {
            this.backLinkGraphics.destroy();
            this.backLinkGraphics = null;
        }
        this.lastModel = null;
        this.onChainUpdated = null;
        this.onTileSelected = null;
        this.selectedTileNodeId = null;
        this.orderAtDragStart = [];
        this.draggingNodeId = null;
        this.draggedTileMover = null;
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
        options?: DrawOptions,
    ): void {
        this.destroy();

        this.lastModel = model;
        this.onChainUpdated = onChainUpdated ?? null;
        this.onTileSelected = onTileSelected ?? null;
        this.accentDoubly = options?.accentDoubly !== false;

        const root = this.scene.add.container(0, 0);
        root.setDepth(5);
        this.layer = root;

        const chain = getForwardChainNodeIds(model);
        this.bridgeWorldY = 485;
        const startX = 240;
        this.layoutStartX = startX;
        this.ropeGraphics = [];
        this.tileByNodeId.clear();
        const w = this.scene.scale.width;
        this.dragMinX = Math.max(120, Math.floor(w * 0.08));
        this.dragMaxX = Math.min(w - 120, Math.floor(w * 0.92));

        const leftBank = this.scene.add
            .image(30, 800, "cliff")
            .setOrigin(0.5, 1)
            .setDisplaySize(CLIFF_H, CLIFF_W);
        const rightBankX = w;
        const rightBank = this.scene.add
            .image(rightBankX, 800, "cliff")
            .setOrigin(0.5, 1)
            .setDisplaySize(CLIFF_H, CLIFF_W)
            .setFlipX(true);
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

        const isDoubly = model.kind === "doubly" && this.accentDoubly;

        // Color palette: singly = warm wood / yellow accents; doubly = cool teal accents
        const ropeColor = isDoubly ? 0x4dd0e1 : 0xcbb69a;
        const ropeBorderTint = isDoubly ? 0x00838f : 0x5d4037;

        let ropeFromX = 180;

        this.tileContainers = [];

        for (let i = 0; i < chain.length; i++) {
            const id = chain[i];
            if (!id || !(id in model.nodes)) {
                continue;
            }
            const node = model.nodes[id];
            const cx = startX + i * STEP_X;

            // ->next rope (always drawn)
            const rope = this.scene.add.graphics();
            rope.lineStyle(6, ropeColor, 0.95);
            rope.lineBetween(
                ropeFromX,
                this.bridgeWorldY,
                cx - TILE_W / 2,
                this.bridgeWorldY,
            );
            // Right-pointing arrowhead just before the plank
            this.drawArrow(
                rope,
                cx - TILE_W / 2 - 14,
                this.bridgeWorldY,
                "right",
                ropeColor,
            );
            this.ropeGraphics.push(rope);
            root.add(rope);

            const tile = this.scene.add.container(cx, this.bridgeWorldY);
            tile.setData("nodeId", id);

            const plankImage = this.scene.add
                .image(0, 0, "tile")
                .setOrigin(0.5)
                .setDisplaySize(TILE_W, TILE_H);
            const plankBorder = this.scene.add
                .rectangle(0, 0, TILE_W, TILE_H, 0x000000, 0)
                .setStrokeStyle(2, ropeBorderTint);
            const valueLabel = this.scene.add
                .text(0, -2, String(node.value), {
                    fontFamily: "Arial Black",
                    fontSize: 22,
                    color: "#3e2723",
                })
                .setOrigin(0.5);
            const idHint = this.scene.add
                .text(0, 18, nodeLabelById?.get(id) ?? id, {
                    fontFamily: "Arial Black",
                    fontSize: 12,
                    color: "#fffde7",
                    backgroundColor: "#3e2723",
                    padding: { left: 4, right: 4, top: 1, bottom: 1 },
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

        // Trailing rope to the right cliff
        if (chain.length > 0) {
            const lastCx = startX + (chain.length - 1) * STEP_X + TILE_W / 2;
            const ropeEnd = this.scene.add.graphics();
            ropeEnd.lineStyle(6, ropeColor, 0.95);
            ropeEnd.lineBetween(
                lastCx,
                this.bridgeWorldY,
                rightBankX - 145,
                this.bridgeWorldY,
            );
            this.drawArrow(
                ropeEnd,
                rightBankX - 145 - 14,
                this.bridgeWorldY,
                "right",
                ropeColor,
            );
            this.ropeGraphics.push(ropeEnd);
            root.add(ropeEnd);
        }

        // Doubly-linked: visible <- prev arrows under each plank
        if (isDoubly && chain.length >= 2) {
            const back = this.scene.add.graphics();
            back.setDepth(6);
            const backY = this.bridgeWorldY + 36;
            back.lineStyle(4, 0xffd54f, 0.95);
            for (let i = 1; i < chain.length; i++) {
                const rightCx = startX + i * STEP_X;
                const leftCx = startX + (i - 1) * STEP_X;
                const xFrom = rightCx - TILE_W / 2;
                const xTo = leftCx + TILE_W / 2;
                back.lineBetween(xFrom, backY, xTo, backY);
                this.drawArrow(back, xTo + 6, backY, "left", 0xffd54f);
            }
            const label = this.scene.add
                .text(
                    startX - 10,
                    backY,
                    "<- prev",
                    {
                        fontFamily: "Arial Black",
                        fontSize: 12,
                        color: "#1b2e1b",
                        backgroundColor: "#ffd54f",
                        padding: { left: 4, right: 4, top: 2, bottom: 2 },
                    },
                )
                .setOrigin(1, 0.5)
                .setDepth(6);
            const nextLabel = this.scene.add
                .text(
                    startX - 10,
                    this.bridgeWorldY,
                    "next ->",
                    {
                        fontFamily: "Arial Black",
                        fontSize: 12,
                        color: "#1b2e1b",
                        backgroundColor: "#4dd0e1",
                        padding: { left: 4, right: 4, top: 2, bottom: 2 },
                    },
                )
                .setOrigin(1, 0.5)
                .setDepth(6);
            root.add(back);
            root.add(label);
            root.add(nextLabel);
            this.backLinkGraphics = back;
        } else {
            // Singly: small "next ->" reminder near the head
            const nextLabel = this.scene.add
                .text(
                    startX - 10,
                    this.bridgeWorldY - 2,
                    "next ->",
                    {
                        fontFamily: "Arial Black",
                        fontSize: 12,
                        color: "#3e2723",
                        backgroundColor: "#fff59d",
                        padding: { left: 4, right: 4, top: 2, bottom: 2 },
                    },
                )
                .setOrigin(1, 0.5)
                .setDepth(6);
            root.add(nextLabel);
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

    private drawArrow(
        g: Phaser.GameObjects.Graphics,
        tipX: number,
        tipY: number,
        direction: "left" | "right",
        color: number,
    ): void {
        const size = 9;
        const dir = direction === "right" ? -1 : 1;
        g.fillStyle(color, 1);
        g.fillTriangle(
            tipX,
            tipY,
            tipX + dir * size,
            tipY - size * 0.7,
            tipX + dir * size,
            tipY + size * 0.7,
        );
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

    /** Subscribe to receive the current dragged tile's x while drag is in progress. */
    setDragMoveCallback(cb: ((tileX: number) => void) | null): void {
        this.draggedTileMover = cb;
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

    /** Returns the world-space center of a tile (or null if not present). */
    getTileCenter(nodeId: NodeId): { x: number; y: number } | null {
        const tile = this.tileByNodeId.get(nodeId);
        if (!tile) {
            return null;
        }
        return { x: tile.x, y: tile.y };
    }

    /** Returns how far Alex can walk along the bridge before falling off. */
    getBridgeBounds(): { minX: number; maxX: number; y: number } | null {
        if (this.tileContainers.length === 0) {
            return null;
        }
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        for (const t of this.tileContainers) {
            minX = Math.min(minX, t.x - TILE_W / 2);
            maxX = Math.max(maxX, t.x + TILE_W / 2);
        }
        // Allow Alex to step a little past the first/last plank (onto the rope/bank).
        return { minX: minX - 36, maxX: maxX + 36, y: this.bridgeWorldY };
    }

    /** Brief green flash + slight pulse on a tile (correct answer). */
    flashCorrect(nodeId: NodeId): void {
        const tile = this.tileByNodeId.get(nodeId);
        if (!tile) {
            return;
        }
        const image = this.findImage(tile);
        if (image) {
            image.setTint(0x7ae582);
            this.scene.tweens.add({
                targets: image,
                scale: 1.18,
                duration: 180,
                yoyo: true,
                onComplete: () => {
                    image.clearTint();
                    image.setScale(1);
                    this.refreshSelectionVisuals();
                },
            });
        }
    }

    /** Brief red flash + shake on a tile (wrong answer). */
    flashWrong(nodeId: NodeId): void {
        const tile = this.tileByNodeId.get(nodeId);
        if (!tile) {
            return;
        }
        const image = this.findImage(tile);
        if (image) {
            image.setTint(0xff5252);
        }
        const baseX = tile.x;
        this.scene.tweens.add({
            targets: tile,
            x: { from: baseX - 6, to: baseX + 6 },
            duration: 60,
            yoyo: true,
            repeat: 3,
            onComplete: () => {
                tile.x = baseX;
                if (image) {
                    image.clearTint();
                }
                this.refreshSelectionVisuals();
            },
        });
    }

    /**
     * Briefly highlight each node id in `path` in sequence to visualize a
     * traversal. Returns total duration in ms.
     */
    animateTraversal(path: NodeId[], stepMs = 320): number {
        let delay = 0;
        for (const id of path) {
            const tile = this.tileByNodeId.get(id);
            if (!tile) {
                continue;
            }
            const image = this.findImage(tile);
            if (!image) {
                continue;
            }
            this.scene.time.delayedCall(delay, () => {
                image.setTint(0x80deea);
                this.scene.tweens.add({
                    targets: image,
                    scale: 1.12,
                    duration: stepMs * 0.45,
                    yoyo: true,
                    onComplete: () => {
                        image.clearTint();
                        image.setScale(1);
                        this.refreshSelectionVisuals();
                    },
                });
            });
            delay += stepMs;
        }
        return delay;
    }

    private findImage(
        tile: Phaser.GameObjects.Container,
    ): Phaser.GameObjects.Image | undefined {
        return tile.list.find(
            (item): item is Phaser.GameObjects.Image =>
                item instanceof Phaser.GameObjects.Image,
        );
    }

    private refreshSelectionVisuals(): void {
        for (const tile of this.tileContainers) {
            const nodeId = String(tile.getData("nodeId"));
            const image = this.findImage(tile);
            const border = tile.list.find(
                (item): item is Phaser.GameObjects.Rectangle =>
                    item instanceof Phaser.GameObjects.Rectangle,
            );
            if (!image || !border) {
                continue;
            }
            const isSelected = this.selectedTileNodeId === nodeId;
            image.clearTint();
            border.setStrokeStyle(
                isSelected ? 4 : 2,
                isSelected ? 0xfff59d : 0x5d4037,
            );
            if (isSelected) {
                image.setTint(0xfff59d);
            }
        }
    }
}
