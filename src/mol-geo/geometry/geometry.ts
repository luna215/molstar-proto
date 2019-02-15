/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Mesh } from './mesh/mesh';
import { Points } from './points/points';
import { Text } from './text/text';
import { RenderableState } from 'mol-gl/renderable';
import { LocationIterator } from '../util/location-iterator';
import { ColorType } from './color-data';
import { SizeType } from './size-data';
import { Lines } from './lines/lines';
import { ParamDefinition as PD } from 'mol-util/param-definition'
import { DirectVolume } from './direct-volume/direct-volume';
import { Color } from 'mol-util/color';
import { Spheres } from './spheres/spheres';
import { arrayMax } from 'mol-util/array';
import { TransformData } from './transform-data';
import { Theme } from 'mol-theme/theme';
import { RenderObjectValuesType } from 'mol-gl/render-object';
import { ValueOf } from 'mol-util/type-helpers';

export type GeometryKindType = {
    'mesh': Mesh,
    'points': Points,
    'spheres': Spheres,
    'text': Text,
    'lines': Lines,
    'direct-volume': DirectVolume,
}
export type GeometryKindParams = {
    'mesh': Mesh.Params,
    'points': Points.Params,
    'spheres': Spheres.Params,
    'text': Text.Params,
    'lines': Lines.Params,
    'direct-volume': DirectVolume.Params,
}
export type GeometryKind = keyof GeometryKindType
export type Geometry = ValueOf<GeometryKindType>

export interface GeometryUtils<G extends Geometry, P extends PD.Params = GeometryKindParams[G['kind']], V = RenderObjectValuesType[G['kind']]> {
    Params: P
    createEmpty(geometry?: G): G
    createValues(geometry: G, transform: TransformData, locationIt: LocationIterator, theme: Theme, props: PD.Values<P>): V
    createValuesSimple(geometry: G, props: Partial<PD.Values<P>>, colorValue: Color, sizeValue: number, transform?: TransformData): V
    updateValues(values: V, props: PD.Values<P>): void
    updateBoundingSphere(values: V, geometry: G): void
    createRenderableState(props: Partial<PD.Values<P>>): RenderableState
    updateRenderableState(state: RenderableState, props: PD.Values<P>): void
}

export namespace Geometry {
    export type Params<G extends Geometry> = GeometryKindParams[G['kind']]

    export function getDrawCount(geometry: Geometry): number {
        switch (geometry.kind) {
            case 'mesh': return geometry.triangleCount * 3
            case 'points': return geometry.pointCount
            case 'spheres': return geometry.sphereCount * 2 * 3
            case 'text': return geometry.charCount * 2 * 3
            case 'lines': return geometry.lineCount * 2 * 3
            case 'direct-volume': return 12 * 3
        }
    }

    export function getGroupCount(geometry: Geometry): number {
        switch (geometry.kind) {
            case 'mesh':
            case 'points':
            case 'spheres':
            case 'text':
            case 'lines':
                return getDrawCount(geometry) === 0 ? 0 : (arrayMax(geometry.groupBuffer.ref.value) + 1)
            case 'direct-volume':
                return 1
        }
    }

    export function getUtils<G extends Geometry>(geometry: G): GeometryUtils<G> {
        // TODO avoid casting
        switch (geometry.kind) {
            case 'mesh': return Mesh.Utils as any
            case 'points': return Points.Utils as any
            case 'spheres': return Spheres.Utils as any
            case 'text': return Text.Utils as any
            case 'lines': return Lines.Utils as any
            case 'direct-volume': return DirectVolume.Utils as any
        }
        throw new Error('unknown geometry kind')
    }

    export function getGranularity(locationIt: LocationIterator, granularity: ColorType | SizeType) {
        // Always use 'group' granularity for 'complex' location iterators,
        // i.e. for which an instance may include multiple units
        return granularity === 'instance' && locationIt.isComplex ? 'group' : granularity
    }
}