/**
 * Copyright (c) 2018-2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author David Sehnal <david.sehnal@gmail.com>
 */

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P]
}
export type TypedIntArray = Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array
export type TypedFloatArray = Float32Array | Float64Array

export type TypedArray = TypedIntArray | TypedFloatArray
export type NumberArray = TypedArray | number[]
export type UintArray = Uint8Array | Uint16Array | Uint32Array | number[]
export type ValueOf<T> = T[keyof T]
export type ArrayCtor<T> = { new(size: number): { [i: number]: T, length: number } }
/** assignable ArrayLike version */
export type AssignableArrayLike<T> =  { [i: number]: T, length: number }