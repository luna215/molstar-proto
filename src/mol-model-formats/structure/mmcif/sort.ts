/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { mmCIF_Database } from 'mol-io/reader/cif/schema/mmcif';
import { createRangeArray, makeBuckets } from 'mol-data/util';
import { Column, Table } from 'mol-data/db';
import { RuntimeContext } from 'mol-task';

export type SortedAtomSite = mmCIF_Database['atom_site'] & { sourceIndex: Column<number> }

function isIdentity(xs: ArrayLike<number>) {
    for (let i = 0, _i = xs.length; i < _i; i++) {
        if (xs[i] !== i) return false;
    }
    return true;
}

export async function sortAtomSite(ctx: RuntimeContext, atom_site: mmCIF_Database['atom_site'], start: number, end: number) {
    const indices = createRangeArray(start, end - 1);

    const { label_entity_id, label_asym_id, label_seq_id } = atom_site;
    const entityBuckets = makeBuckets(indices, label_entity_id.value);
    if (ctx.shouldUpdate) await ctx.update();
    for (let ei = 0, _eI = entityBuckets.length - 1; ei < _eI; ei++) {
        const chainBuckets = makeBuckets(indices, label_asym_id.value, { start: entityBuckets[ei], end: entityBuckets[ei + 1] });
        for (let cI = 0, _cI = chainBuckets.length - 1; cI < _cI; cI++) {
            const aI = chainBuckets[cI];
            // are we in HETATM territory?
            if (label_seq_id.valueKind(aI) !== Column.ValueKind.Present) continue;

            makeBuckets(indices, label_seq_id.value, { sort: true, start: aI, end: chainBuckets[cI + 1] });
            if (ctx.shouldUpdate) await ctx.update();
        }
        if (ctx.shouldUpdate) await ctx.update();
    }

    if (isIdentity(indices) && indices.length === atom_site._rowCount) {
        return { atom_site, sourceIndex: Column.ofIntArray(indices) };
    }

    return {
        atom_site: Table.view(atom_site, atom_site._schema, indices) as mmCIF_Database['atom_site'],
        sourceIndex: Column.ofIntArray(indices)
    };
}