/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { GridLookup3D } from '../../geometry';
import { sortArray } from 'mol-data/util';
import { OrderedSet } from 'mol-data/int';

const xs = [0, 0, 1];
const ys = [0, 1, 0];
const zs = [0, 0, 0];
const rs = [0, 0.5, 1/3];

describe('GridLookup3d', () => {
    it('basic', () => {
        const grid = GridLookup3D({ x: xs, y: ys, z: zs, indices: OrderedSet.ofBounds(0, 3) });

        let r = grid.find(0, 0, 0, 0);
        expect(r.count).toBe(1);
        expect(r.indices[0]).toBe(0);

        r = grid.find(0, 0, 0, 1);
        expect(r.count).toBe(3);
        expect(sortArray(r.indices)).toEqual([0, 1, 2]);
    });

    it('radius', () => {
        const grid = GridLookup3D({ x: xs, y: ys, z: zs, radius: [0, 0.5, 1 / 3], indices: OrderedSet.ofBounds(0, 3) });

        let r = grid.find(0, 0, 0, 0);
        expect(r.count).toBe(1);
        expect(r.indices[0]).toBe(0);

        r = grid.find(0, 0, 0, 0.5);
        expect(r.count).toBe(2);
        expect(sortArray(r.indices)).toEqual([0, 1]);
    });

    it('indexed', () => {
        const grid = GridLookup3D({ x: xs, y: ys, z: zs, indices: OrderedSet.ofSingleton(1), radius: rs });

        let r = grid.find(0, 0, 0, 0);
        expect(r.count).toBe(0);

        r = grid.find(0, 0, 0, 0.5);
        expect(r.count).toBe(1);
        expect(sortArray(r.indices)).toEqual([0]);
    });
});