import type { MapDefinition } from '../MapTypes';

export interface TiledMapJson {
    readonly width: number;
    readonly height: number;
    readonly tilewidth: number;
    readonly tileheight: number;
    readonly orientation?: string;
    readonly infinite?: boolean;
    readonly layers?: readonly TiledLayerJson[];
}

export interface TiledLayerJson {
    readonly name: string;
    readonly type: string;
    readonly width?: number;
    readonly height?: number;
    readonly data?: readonly number[];
    readonly encoding?: string;
    readonly compression?: string;
    readonly objects?: readonly TiledObjectJson[];
    readonly properties?: readonly TiledProperty[];
}

export interface TiledObjectJson {
    readonly id?: number;
    readonly name?: string;
    readonly type?: string;
    readonly x: number;
    readonly y: number;
    readonly width?: number;
    readonly height?: number;
    readonly point?: boolean;
    readonly properties?: readonly TiledProperty[];
}

export interface TiledProperty {
    readonly name: string;
    readonly type?: string;
    readonly value: unknown;
}

export interface TiledImportOptions {
    readonly mapId: string;
    readonly nameKey: string;
    readonly terrainLayerName?: string;
    readonly objectLayerName?: string;
}

export interface ImportedTerrainGrid {
    readonly width: number;
    readonly height: number;
    readonly gids: readonly number[];
}

export interface TiledImportResult {
    readonly map: MapDefinition;
    readonly terrain: ImportedTerrainGrid;
    readonly warnings: readonly string[];
}

export class TiledImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TiledImportError';
    }
}
