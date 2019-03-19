/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { ValueCell } from 'mol-util/value-cell'
import { Vec2 } from 'mol-math/linear-algebra'
import { TextureImage, createTextureImage } from 'mol-gl/renderable/util';
import { Transparency } from 'mol-theme/transparency';

export type TransparencyData = {
    tTransparency: ValueCell<TextureImage<Uint8Array>>
    uTransparencyTexDim: ValueCell<Vec2>
    dTransparency: ValueCell<boolean>,
    dTransparencyVariant: ValueCell<string>,
}

export function applyTransparencyValue(array: Uint8Array, start: number, end: number, value: number) {
    for (let i = start; i < end; ++i) {
        array[i] = value * 255
    }
    return true
}

export function clearTransparency(array: Uint8Array, start: number, end: number) {
    array.fill(0, start, end)
}

export function createTransparency(count: number, variant: Transparency.Variant, transparencyData?: TransparencyData): TransparencyData {
    const transparency = createTextureImage(Math.max(1, count), 1, transparencyData && transparencyData.tTransparency.ref.value.array)
    if (transparencyData) {
        ValueCell.update(transparencyData.tTransparency, transparency)
        ValueCell.update(transparencyData.uTransparencyTexDim, Vec2.create(transparency.width, transparency.height))
        ValueCell.update(transparencyData.dTransparency, count > 0)
        ValueCell.update(transparencyData.dTransparencyVariant, variant)
        return transparencyData
    } else {
        return {
            tTransparency: ValueCell.create(transparency),
            uTransparencyTexDim: ValueCell.create(Vec2.create(transparency.width, transparency.height)),
            dTransparency: ValueCell.create(count > 0),
            dTransparencyVariant: ValueCell.create(variant),
        }
    }
}

const emptyTransparencyTexture = { array: new Uint8Array(1), width: 1, height: 1 }
export function createEmptyTransparency(transparencyData?: TransparencyData): TransparencyData {
    if (transparencyData) {
        ValueCell.update(transparencyData.tTransparency, emptyTransparencyTexture)
        ValueCell.update(transparencyData.uTransparencyTexDim, Vec2.create(1, 1))
        return transparencyData
    } else {
        return {
            tTransparency: ValueCell.create(emptyTransparencyTexture),
            uTransparencyTexDim: ValueCell.create(Vec2.create(1, 1)),
            dTransparency: ValueCell.create(false),
            dTransparencyVariant: ValueCell.create('single'),
        }
    }
}