/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { SpacegroupCell, Box3D } from 'mol-math/geometry'
import { Tensor, Mat4, Vec3 } from 'mol-math/linear-algebra'

/** The basic unit cell that contains the data. */
interface VolumeData {
    readonly cell: SpacegroupCell,
    readonly fractionalBox: Box3D,
    readonly data: Tensor,
    readonly dataStats: Readonly<{
        min: number,
        max: number,
        mean: number,
        sigma: number
    }>
}

namespace VolumeData {
    export const Empty: VolumeData = {
        cell: SpacegroupCell.Zero,
        fractionalBox: Box3D.empty(),
        data: Tensor.create(Tensor.Space([0, 0, 0], [0, 1, 2]), Tensor.Data1([])),
        dataStats: { min: 0, max: 0, mean: 0, sigma: 0 }
    }

    const _scale = Mat4.zero(), _translate = Mat4.zero();
    export function getGridToCartesianTransform(volume: VolumeData) {
        const { data: { space } } = volume;
        const scale = Mat4.fromScaling(_scale, Vec3.div(Vec3.zero(), Box3D.size(Vec3.zero(), volume.fractionalBox), Vec3.ofArray(space.dimensions)));
        const translate = Mat4.fromTranslation(_translate, volume.fractionalBox.min);
        return Mat4.mul3(Mat4.zero(), volume.cell.fromFractional, translate, scale);
    }

    export function areEquivalent(volA: VolumeData, volB: VolumeData) {
        return volA === volB
    }
}

type VolumeIsoValue = VolumeIsoValue.Absolute | VolumeIsoValue.Relative

namespace VolumeIsoValue {
    export type Relative = Readonly<{ kind: 'relative', stats: VolumeData['dataStats'], relativeValue: number }>
    export type Absolute = Readonly<{ kind: 'absolute', stats: VolumeData['dataStats'], absoluteValue: number }>

    export function absolute(stats: VolumeData['dataStats'], value: number): Absolute { return { kind: 'absolute', stats, absoluteValue: value }; }
    export function relative(stats: VolumeData['dataStats'], value: number): Relative { return { kind: 'relative', stats, relativeValue: value }; }

    export function calcAbsolute(stats: VolumeData['dataStats'], relativeValue: number): number {
        return relativeValue * stats.sigma + stats.mean
    }

    export function calcRelative(stats: VolumeData['dataStats'], absoluteValue: number): number {
        return stats.sigma === 0 ? 0 : ((absoluteValue - stats.mean) / stats.sigma)
    }

    export function toAbsolute(value: VolumeIsoValue): Absolute {
        if (value.kind === 'absolute') return value;
        return {
            kind: 'absolute',
            stats: value.stats,
            absoluteValue: calcAbsolute(value.stats, value.relativeValue)
        }
    }

    export function toRelative(value: VolumeIsoValue): Relative {
        if (value.kind === 'relative') return value;
        return {
            kind: 'relative',
            stats: value.stats,
            relativeValue: calcRelative(value.stats, value.absoluteValue)
        }
    }
}

export { VolumeData, VolumeIsoValue }