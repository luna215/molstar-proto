/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { substringStartsWith } from 'mol-util/string';
import { CifField, CifCategory, CifFrame } from 'mol-io/reader/cif';
import { mmCIF_Schema } from 'mol-io/reader/cif/schema/mmcif';
import { TokenBuilder, Tokenizer } from 'mol-io/reader/common/text/tokenizer';
import { PdbFile } from 'mol-io/reader/pdb/schema';
import { parseCryst1, parseRemark350, parseMtrix } from './assembly';
import { WaterNames } from 'mol-model/structure/model/types';
import { parseHelix, parseSheet } from './secondary-structure';

function _entity(): { [K in keyof mmCIF_Schema['entity']]?: CifField } {
    return {
        id: CifField.ofStrings(['1', '2', '3']),
        type: CifField.ofStrings(['polymer', 'non-polymer', 'water'])
    }
}

type AtomSiteTemplate = typeof atom_site_template extends (...args: any) => infer T ? T : never
function atom_site_template(data: string, count: number) {
    const str = () => [] as string[];
    const ts = () => TokenBuilder.create(data, 2 * count);
    return {
        index: 0,
        count,
        group_PDB: ts(),
        id: str(),
        auth_atom_id: ts(),
        label_alt_id: ts(),
        auth_comp_id: ts(),
        auth_asym_id: ts(),
        auth_seq_id: ts(),
        pdbx_PDB_ins_code: ts(),
        Cartn_x: ts(),
        Cartn_y: ts(),
        Cartn_z: ts(),
        occupancy: ts(),
        B_iso_or_equiv: ts(),
        type_symbol: ts(),
        pdbx_PDB_model_num: str(),
        label_entity_id: str()
    };
}

function _atom_site(sites: AtomSiteTemplate): { [K in keyof mmCIF_Schema['atom_site']]?: CifField } {
    const auth_asym_id = CifField.ofTokens(sites.auth_asym_id);
    const auth_atom_id = CifField.ofTokens(sites.auth_atom_id);
    const auth_comp_id = CifField.ofTokens(sites.auth_comp_id);
    const auth_seq_id = CifField.ofTokens(sites.auth_seq_id);

    return {
        auth_asym_id,
        auth_atom_id,
        auth_comp_id,
        auth_seq_id,
        B_iso_or_equiv: CifField.ofTokens(sites.B_iso_or_equiv),
        Cartn_x: CifField.ofTokens(sites.Cartn_x),
        Cartn_y: CifField.ofTokens(sites.Cartn_y),
        Cartn_z: CifField.ofTokens(sites.Cartn_z),
        group_PDB: CifField.ofTokens(sites.group_PDB),
        id: CifField.ofStrings(sites.id),

        label_alt_id: CifField.ofTokens(sites.label_alt_id),

        label_asym_id: auth_asym_id,
        label_atom_id: auth_atom_id,
        label_comp_id: auth_comp_id,
        label_seq_id: auth_seq_id,
        label_entity_id: CifField.ofStrings(sites.label_entity_id),

        occupancy: CifField.ofTokens(sites.occupancy),
        type_symbol: CifField.ofTokens(sites.type_symbol),

        pdbx_PDB_ins_code: CifField.ofTokens(sites.pdbx_PDB_ins_code),
        pdbx_PDB_model_num: CifField.ofStrings(sites.pdbx_PDB_model_num)
    };
}

function getEntityId(residueName: string, isHet: boolean) {
    if (isHet) {
        if (WaterNames.has(residueName)) return '3';
        return '2';
    }
    return '1';
}

function addAtom(sites: AtomSiteTemplate, model: string, data: Tokenizer, s: number, e: number, isHet: boolean) {
    const { data: str } = data;
    const length = e - s;

    // TODO: filter invalid atoms

    // COLUMNS        DATA TYPE       CONTENTS
    // --------------------------------------------------------------------------------
    // 1 -  6        Record name     "ATOM  "
    TokenBuilder.addToken(sites.group_PDB, Tokenizer.trim(data, s, s + 6));

    // 7 - 11        Integer         Atom serial number.
    // TODO: support HEX
    Tokenizer.trim(data, s + 6, s + 11);
    sites.id[sites.index] = data.data.substring(data.tokenStart, data.tokenEnd);

    // 13 - 16        Atom            Atom name.
    TokenBuilder.addToken(sites.auth_atom_id, Tokenizer.trim(data, s + 12, s + 16));

    // 17             Character       Alternate location indicator.
    if (str.charCodeAt(s + 16) === 32) { // ' '
        TokenBuilder.add(sites.label_alt_id, 0, 0);
    } else {
        TokenBuilder.add(sites.label_alt_id, s + 16, s + 17);
    }

    // 18 - 20        Residue name    Residue name.
    TokenBuilder.addToken(sites.auth_comp_id, Tokenizer.trim(data, s + 17, s + 20));
    const residueName = str.substring(data.tokenStart, data.tokenEnd);

    // 22             Character       Chain identifier.
    TokenBuilder.add(sites.auth_asym_id, s + 21, s + 22);

    // 23 - 26        Integer         Residue sequence number.
    // TODO: support HEX
    TokenBuilder.addToken(sites.auth_seq_id, Tokenizer.trim(data, s + 22, s + 26));

    // 27             AChar           Code for insertion of residues.
    if (str.charCodeAt(s + 26) === 32) { // ' '
        TokenBuilder.add(sites.label_alt_id, 0, 0);
    } else {
        TokenBuilder.add(sites.label_alt_id, s + 26, s + 27);
    }

    // 31 - 38        Real(8.3)       Orthogonal coordinates for X in Angstroms.
    TokenBuilder.addToken(sites.Cartn_x, Tokenizer.trim(data, s + 30, s + 38));

    // 39 - 46        Real(8.3)       Orthogonal coordinates for Y in Angstroms.
    TokenBuilder.addToken(sites.Cartn_y, Tokenizer.trim(data, s + 38, s + 46));

    // 47 - 54        Real(8.3)       Orthogonal coordinates for Z in Angstroms.
    TokenBuilder.addToken(sites.Cartn_z, Tokenizer.trim(data, s + 46, s + 54));

    // 55 - 60        Real(6.2)       Occupancy.
    TokenBuilder.addToken(sites.occupancy, Tokenizer.trim(data, s + 54, s + 60));

    // 61 - 66        Real(6.2)       Temperature factor (Default = 0.0).
    if (length >= 66) {
        TokenBuilder.addToken(sites.B_iso_or_equiv, Tokenizer.trim(data, s + 60, s + 66));
    } else {
        TokenBuilder.add(sites.label_alt_id, 0, 0);
    }

    // 73 - 76        LString(4)      Segment identifier, left-justified.
    // ignored

    // 77 - 78        LString(2)      Element symbol, right-justified.
    if (length >= 78) {
        Tokenizer.trim(data, s + 76, s + 78);

        if (data.tokenStart < data.tokenEnd) {
            TokenBuilder.addToken(sites.type_symbol, data);
        } else {
            // "guess" the symbol
            TokenBuilder.add(sites.type_symbol, s + 12, s + 13);
        }
    } else {
        TokenBuilder.add(sites.type_symbol, s + 12, s + 13);
    }

    sites.label_entity_id[sites.index] = getEntityId(residueName, isHet);
    sites.pdbx_PDB_model_num[sites.index] = model;

    sites.index++;
}

export async function pdbToMmCif(pdb: PdbFile): Promise<CifFrame> {
    const { lines } = pdb;
    const { data, indices } = lines;
    const tokenizer = Tokenizer(data);

    // Count the atoms
    let atomCount = 0;
    for (let i = 0, _i = lines.count; i < _i; i++) {
        const s = indices[2 * i], e = indices[2 * i + 1];
        switch (data[s]) {
            case 'A':
                if (substringStartsWith(data, s, e, 'ATOM  ')) atomCount++;
                break;
            case 'H':
                if (substringStartsWith(data, s, e, 'HETATM')) atomCount++;
                break;
        }
    }

    const atom_site = atom_site_template(data, atomCount);

    const helperCategories: CifCategory[] = [];

    let modelNum = 0, modelStr = '';

    for (let i = 0, _i = lines.count; i < _i; i++) {
        let s = indices[2 * i], e = indices[2 * i + 1];
        switch (data[s]) {
            case 'A':
                if (!substringStartsWith(data, s, e, 'ATOM  ')) continue;
                if (!modelNum) { modelNum++; modelStr = '' + modelNum; }
                addAtom(atom_site, modelStr, tokenizer, s, e, false);
                break;
            case 'C':
                if (substringStartsWith(data, s, e, 'CRYST1')) {
                    helperCategories.push(...parseCryst1(pdb.id || '?', data.substring(s, e)));
                }
                // TODO CONNECT records => struct_conn
                // TODO COMPND records => entity
                break;
            case 'H':
                if (substringStartsWith(data, s, e, 'HETATM')) {
                    if (!modelNum) { modelNum++; modelStr = '' + modelNum; }
                    addAtom(atom_site, modelStr, tokenizer, s, e, true);
                } else if (substringStartsWith(data, s, e, 'HELIX')) {
                    let j = i + 1;
                    while (true) {
                        s = indices[2 * j]; e = indices[2 * j + 1];
                        if (!substringStartsWith(data, s, e, 'HELIX')) break;
                        j++;
                    }
                    helperCategories.push(parseHelix(lines, i, j));
                    i = j - 1;
                }
                // TODO HETNAM records => chem_comp (at least partially, needs to be completed with common bases and amino acids)
                break;
            case 'M':
                if (substringStartsWith(data, s, e, 'MODEL ')) {
                    modelNum++;
                    modelStr = '' + modelNum;
                }
                if (substringStartsWith(data, s, e, 'MTRIX')) {
                    let j = i + 1;
                    while (true) {
                        s = indices[2 * j]; e = indices[2 * j + 1];
                        if (!substringStartsWith(data, s, e, 'MTRIX')) break;
                        j++;
                    }
                    helperCategories.push(...parseMtrix(lines, i, j));
                    i = j - 1;
                }
                // TODO MODRES records => pdbx_struct_mod_residue
                break;
            case 'O':
                // TODO ORIGX record => cif.database_PDB_matrix.origx, cif.database_PDB_matrix.origx_vector
                break;
            case 'R':
                if (substringStartsWith(data, s, e, 'REMARK 350')) {
                    let j = i + 1;
                    while (true) {
                        s = indices[2 * j]; e = indices[2 * j + 1];
                        if (!substringStartsWith(data, s, e, 'REMARK 350')) break;
                        j++;
                    }
                    helperCategories.push(...parseRemark350(lines, i, j));
                    i = j - 1;
                }
                break;
            case 'S':
                if (substringStartsWith(data, s, e, 'SHEET')) {
                    let j = i + 1;
                    while (true) {
                        s = indices[2 * j]; e = indices[2 * j + 1];
                        if (!substringStartsWith(data, s, e, 'SHEET')) break;
                        j++;
                    }
                    helperCategories.push(parseSheet(lines, i, j));
                    i = j - 1;
                }
                // TODO SCALE record => cif.atom_sites.fract_transf_matrix, cif.atom_sites.fract_transf_vector
                break;
        }
    }

    const categories = {
        entity: CifCategory.ofFields('entity', _entity()),
        atom_site: CifCategory.ofFields('atom_site', _atom_site(atom_site))
    } as any;

    for (const c of helperCategories) {
        categories[c.name] = c;
    }

    return {
        header: pdb.id || 'PDB',
        categoryNames: Object.keys(categories),
        categories
    };
}