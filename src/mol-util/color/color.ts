/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { NumberArray } from 'mol-util/type-helpers';

/** RGB color triplet expressed as a single number */
export type Color = { readonly '@type': 'color' } & number

export function Color(hex: number) { return hex as Color }

export namespace Color {
    export function toStyle(hexColor: Color) {
        return `rgb(${hexColor >> 16 & 255}, ${hexColor >> 8 & 255}, ${hexColor & 255})`
    }

    export function toHexString(hexColor: Color) {
        return '0x' + ('000000' + hexColor.toString(16)).slice(-6)
    }

    export function toRgbString(hexColor: Color) {
        return `RGB: ${Color.toRgb(hexColor).join(', ')}`
    }

    export function toRgb(hexColor: Color) {
        return [ hexColor >> 16 & 255, hexColor >> 8 & 255, hexColor & 255 ]
    }

    export function toRgbNormalized(hexColor: Color) {
        return [ (hexColor >> 16 & 255) / 255, (hexColor >> 8 & 255) / 255, (hexColor & 255) / 255 ]
    }

    export function fromRgb(r: number, g: number, b: number): Color {
        return ((r << 16) | (g << 8) | b) as Color
    }

    export function fromNormalizedRgb(r: number, g: number, b: number): Color {
        return (((r * 255) << 16) | ((g * 255) << 8) | (b * 255)) as Color
    }

    export function fromArray(array: NumberArray, offset: number): Color {
        return fromRgb(array[offset], array[offset + 1], array[offset + 2])
    }

    export function fromNormalizedArray(array: NumberArray, offset: number): Color {
        return fromNormalizedRgb(array[offset], array[offset + 1], array[offset + 2])
    }

    /** Copies hex color to rgb array */
    export function toArray(hexColor: Color, array: NumberArray, offset: number) {
        array[ offset ] = (hexColor >> 16 & 255)
        array[ offset + 1 ] = (hexColor >> 8 & 255)
        array[ offset + 2 ] = (hexColor & 255)
        return array
    }

    /** Copies normalized (0 to 1) hex color to rgb array */
    export function toArrayNormalized<T extends NumberArray>(hexColor: Color, array: T, offset: number) {
        array[ offset ] = (hexColor >> 16 & 255) / 255
        array[ offset + 1 ] = (hexColor >> 8 & 255) / 255
        array[ offset + 2 ] = (hexColor & 255) / 255
        return array
    }

    /** Linear interpolation between two colors */
    export function interpolate(c1: Color, c2: Color, t: number): Color {
        const r1 = c1 >> 16 & 255
        const g1 = c1 >> 8 & 255
        const b1 = c1 & 255
        const r2 = c2 >> 16 & 255
        const g2 = c2 >> 8 & 255
        const b2 = c2 & 255

        const r = r1 + (r2 - r1) * t
        const g = g1 + (g2 - g1) * t
        const b = b1 + (b2 - b1) * t

        return ((r << 16) | (g << 8) | b) as Color
    }
}

export type ColorTable<T extends { [k: string]: number[] }> = { [k in keyof T]: Color[] }
export function ColorTable<T extends { [k: string]: number[] }>(o: T) { return o as unknown as ColorTable<T> }

export type ColorMap<T extends { [k: string]: number }> = { [k in keyof T]: Color }
export function ColorMap<T extends { [k: string]: number }>(o: T) { return o as unknown as ColorMap<T> }