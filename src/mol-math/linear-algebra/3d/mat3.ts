/**
 * Copyright (c) 2017-2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

/*
 * This code has been modified from https://github.com/toji/gl-matrix/,
 * copyright (c) 2015, Brandon Jones, Colin MacKenzie IV.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 */

import { Mat4 } from '../3d'
import { NumberArray } from 'mol-util/type-helpers';

interface Mat3 extends Array<number> { [d: number]: number, '@type': 'mat3', length: 9 }

namespace Mat3 {
    export function zero(): Mat3 {
        // force double backing array by 0.1.
        const ret = [0.1, 0, 0, 0, 0, 0, 0, 0, 0];
        ret[0] = 0.0;
        return ret as any;
    }

    export function identity(): Mat3 {
        const out = zero();
        out[0] = 1;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        out[4] = 1;
        out[5] = 0;
        out[6] = 0;
        out[7] = 0;
        out[8] = 1;
        return out;
    }

    export function setIdentity(mat: Mat3): Mat3 {
        mat[0] = 1;
        mat[1] = 0;
        mat[2] = 0;
        mat[3] = 0;
        mat[4] = 1;
        mat[5] = 0;
        mat[6] = 0;
        mat[7] = 0;
        mat[8] = 1;
        return mat;
    }

    export function toArray(a: Mat3, out: NumberArray, offset: number) {
        out[offset + 0] = a[0];
        out[offset + 1] = a[1];
        out[offset + 2] = a[2];
        out[offset + 3] = a[3];
        out[offset + 4] = a[4];
        out[offset + 5] = a[5];
        out[offset + 6] = a[6];
        out[offset + 7] = a[7];
        out[offset + 8] = a[8];
    }

    export function fromArray(a: Mat3, array: NumberArray, offset: number) {
        a[0] = array[offset + 0]
        a[1] = array[offset + 1]
        a[2] = array[offset + 2]
        a[3] = array[offset + 3]
        a[4] = array[offset + 4]
        a[5] = array[offset + 5]
        a[6] = array[offset + 6]
        a[7] = array[offset + 7]
        a[8] = array[offset + 8]
        return a
    }

    /**
     * Copies the upper-left 3x3 values into the given mat3.
     */
    export function fromMat4(out: Mat3, a: Mat4) {
        out[0] = a[0];
        out[1] = a[1];
        out[2] = a[2];
        out[3] = a[4];
        out[4] = a[5];
        out[5] = a[6];
        out[6] = a[8];
        out[7] = a[9];
        out[8] = a[10];
        return out;
    }

    export function hasNaN(m: Mat3) {
        for (let i = 0; i < 9; i++) if (isNaN(m[i])) return true
        return false
    }

    /**
     * Creates a new Mat3 initialized with values from an existing matrix
     */
    export function clone(a: Mat3) {
        return Mat3.copy(Mat3.zero(), a);
    }

    export function setValue(a: Mat3, i: number, j: number, value: number) {
        a[3 * j + i] = value;
    }

    export function getValue(a: Mat3, i: number, j: number) {
        return a[3 * j + i];
    }

    /**
     * Copy the values from one Mat3 to another
     */
    export function copy(out: Mat3, a: Mat3) {
        out[0] = a[0];
        out[1] = a[1];
        out[2] = a[2];
        out[3] = a[3];
        out[4] = a[4];
        out[5] = a[5];
        out[6] = a[6];
        out[7] = a[7];
        out[8] = a[8];
        return out;
    }

    /**
     * Transpose the values of a Mat3
     */
    export function transpose(out: Mat3, a: Mat3) {
        // If we are transposing ourselves we can skip a few steps but have to cache some values
        if (out === a) {
            const a01 = a[1], a02 = a[2], a12 = a[5];
            out[1] = a[3];
            out[2] = a[6];
            out[3] = a01;
            out[5] = a[7];
            out[6] = a02;
            out[7] = a12;
        } else {
            out[0] = a[0];
            out[1] = a[3];
            out[2] = a[6];
            out[3] = a[1];
            out[4] = a[4];
            out[5] = a[7];
            out[6] = a[2];
            out[7] = a[5];
            out[8] = a[8];
        }
        return out;
    }

    /**
     * Inverts a Mat3
     */
    export function invert(out: Mat3, a: Mat3): Mat3 {
        const a00 = a[0], a01 = a[1], a02 = a[2];
        const a10 = a[3], a11 = a[4], a12 = a[5];
        const a20 = a[6], a21 = a[7], a22 = a[8];

        const b01 = a22 * a11 - a12 * a21;
        const b11 = -a22 * a10 + a12 * a20;
        const b21 = a21 * a10 - a11 * a20;

        // Calculate the determinant
        let det = a00 * b01 + a01 * b11 + a02 * b21;

        if (!det) {
            console.warn('non-invertible matrix.', a);
            return out;
        }
        det = 1.0 / det;

        out[0] = b01 * det;
        out[1] = (-a22 * a01 + a02 * a21) * det;
        out[2] = (a12 * a01 - a02 * a11) * det;
        out[3] = b11 * det;
        out[4] = (a22 * a00 - a02 * a20) * det;
        out[5] = (-a12 * a00 + a02 * a10) * det;
        out[6] = b21 * det;
        out[7] = (-a21 * a00 + a01 * a20) * det;
        out[8] = (a11 * a00 - a01 * a10) * det;
        return out;
    }

    export function determinant(a: Mat3) {
        const a00 = a[0], a01 = a[1], a02 = a[2];
        const a10 = a[3], a11 = a[4], a12 = a[5];
        const a20 = a[6], a21 = a[7], a22 = a[8];

        const b01 = a22 * a11 - a12 * a21;
        const b11 = -a22 * a10 + a12 * a20;
        const b21 = a21 * a10 - a11 * a20;

        // Calculate the determinant
        return a00 * b01 + a01 * b11 + a02 * b21;
    }
}

export default Mat3