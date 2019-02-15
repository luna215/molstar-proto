/**
 * Copyright (c) 2017-2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { Column, Table } from 'mol-data/db';
import { mmCIF_Database, mmCIF_Schema } from 'mol-io/reader/cif/schema/mmcif';
import { Spacegroup, SpacegroupCell, SymmetryOperator } from 'mol-math/geometry';
import { Tensor, Vec3 } from 'mol-math/linear-algebra';
import { RuntimeContext } from 'mol-task';
import UUID from 'mol-util/uuid';
import { Model } from 'mol-model/structure/model/model';
import { Entities } from 'mol-model/structure/model/properties/common';
import { CustomProperties } from 'mol-model/structure/model/properties/custom';
import { ModelSymmetry } from 'mol-model/structure/model/properties/symmetry';
import { createAssemblies } from './assembly';
import { getAtomicHierarchyAndConformation } from './atomic';
import { ComponentBond } from './bonds';
import { getIHMCoarse, EmptyIHMCoarse, IHMData } from './ihm';
import { getSecondaryStructureMmCif } from './secondary-structure';
import { getSequence } from './sequence';
import { sortAtomSite } from './sort';
import { StructConn } from './bonds/struct_conn';
import { ChemicalComponent } from 'mol-model/structure/model/properties/chemical-component';
import { getMoleculeType, MoleculeType } from 'mol-model/structure/model/types';
import { ModelFormat } from '../format';
import { SaccharideComponentMap, SaccharideComponent, SaccharidesSnfgMap, SaccharideCompIdMap, UnknownSaccharideComponent } from 'mol-model/structure/structure/carbohydrates/constants';
import mmCIF_Format = ModelFormat.mmCIF
import { memoize1 } from 'mol-util/memoize';

export async function _parse_mmCif(format: mmCIF_Format, ctx: RuntimeContext) {
    const formatData = getFormatData(format)
    const isIHM = format.data.ihm_model_list._rowCount > 0;
    return isIHM ? await readIHM(ctx, format, formatData) : await readStandard(ctx, format, formatData);
}

type AtomSite = mmCIF_Database['atom_site']

function getSymmetry(format: mmCIF_Format): ModelSymmetry {
    const assemblies = createAssemblies(format);
    const spacegroup = getSpacegroup(format);
    const isNonStandardCrytalFrame = checkNonStandardCrystalFrame(format, spacegroup);
    return { assemblies, spacegroup, isNonStandardCrytalFrame, ncsOperators: getNcsOperators(format) };
}

function checkNonStandardCrystalFrame(format: mmCIF_Format, spacegroup: Spacegroup) {
    const { atom_sites } = format.data;
    if (atom_sites._rowCount === 0) return false;
    // TODO: parse atom_sites transform and check if it corresponds to the toFractional matrix
    return false;
}

function getSpacegroup(format: mmCIF_Format): Spacegroup {
    const { symmetry, cell } = format.data;
    if (symmetry._rowCount === 0 || cell._rowCount === 0) return Spacegroup.ZeroP1;
    const groupName = symmetry['space_group_name_H-M'].value(0);
    const spaceCell = SpacegroupCell.create(groupName,
        Vec3.create(cell.length_a.value(0), cell.length_b.value(0), cell.length_c.value(0)),
        Vec3.scale(Vec3.zero(), Vec3.create(cell.angle_alpha.value(0), cell.angle_beta.value(0), cell.angle_gamma.value(0)), Math.PI / 180));

    return Spacegroup.create(spaceCell);
}

function getNcsOperators(format: mmCIF_Format) {
    const { struct_ncs_oper } = format.data;
    if (struct_ncs_oper._rowCount === 0) return void 0;
    const { id, matrix, vector } = struct_ncs_oper;

    const matrixSpace = mmCIF_Schema.struct_ncs_oper.matrix.space, vectorSpace = mmCIF_Schema.struct_ncs_oper.vector.space;

    const opers: SymmetryOperator[] = [];
    for (let i = 0; i < struct_ncs_oper._rowCount; i++) {
        const m = Tensor.toMat3(matrixSpace, matrix.value(i));
        const v = Tensor.toVec3(vectorSpace, vector.value(i));
        if (!SymmetryOperator.checkIfRotationAndTranslation(m, v)) continue;
        opers[opers.length] = SymmetryOperator.ofRotationAndOffset(`ncs_${id.value(i)}`, m, v);
    }
    return opers;
}

function getModifiedResidueNameMap(format: mmCIF_Format): Model['properties']['modifiedResidues'] {
    const data = format.data.pdbx_struct_mod_residue;
    const parentId = new Map<string, string>();
    const details = new Map<string, string>();
    const comp_id = data.label_comp_id.isDefined ? data.label_comp_id : data.auth_comp_id;
    const parent_id = data.parent_comp_id, details_data = data.details;

    for (let i = 0; i < data._rowCount; i++) {
        const id = comp_id.value(i);
        parentId.set(id, parent_id.value(i));
        details.set(id, details_data.value(i));
    }

    return { parentId, details };
}

function getChemicalComponentMap(format: mmCIF_Format): Model['properties']['chemicalComponentMap'] {
    const map = new Map<string, ChemicalComponent>();
    const { chem_comp } = format.data
    if (chem_comp._rowCount > 0) {
        const { id } = format.data.chem_comp
        for (let i = 0, il = id.rowCount; i < il; ++i) {
            map.set(id.value(i), Table.getRow(format.data.chem_comp, i))
        }
    }
    return map
}

function getSaccharideComponentMap(format: mmCIF_Format): SaccharideComponentMap {
    const map = new Map<string, SaccharideComponent>();
    const { pdbx_chem_comp_identifier } = format.data
    if (pdbx_chem_comp_identifier._rowCount > 0) {
        const { comp_id, type, identifier } = pdbx_chem_comp_identifier
        for (let i = 0, il = pdbx_chem_comp_identifier._rowCount; i < il; ++i) {
            if (type.value(i) === 'SNFG CARB SYMBOL') {
                const snfgName = identifier.value(i)
                const saccharideComp = SaccharidesSnfgMap.get(snfgName)
                if (saccharideComp) {
                    map.set(comp_id.value(i), saccharideComp)
                } else {
                    console.warn(`Unknown SNFG name '${snfgName}'`)
                }
            }
        }
    } else if (format.data.chem_comp._rowCount > 0) {
        const { id, type  } = format.data.chem_comp
        for (let i = 0, il = id.rowCount; i < il; ++i) {
            const _id = id.value(i)
            const _type = type.value(i)
            if (SaccharideCompIdMap.has(_id)) {
                map.set(_id, SaccharideCompIdMap.get(_id)!)
            } else if (!map.has(_id) && getMoleculeType(_type, _id) === MoleculeType.saccharide) {
                map.set(_id, UnknownSaccharideComponent)
            }
        }
    } else {
        const uniqueNames = getUniqueComponentNames(format)
        SaccharideCompIdMap.forEach((v, k) => {
            if (uniqueNames.has(k)) map.set(k, v)
        })
    }
    return map
}

const getUniqueComponentNames = memoize1((format: mmCIF_Format) => {
    const uniqueNames = new Set<string>()
    const data = format.data.atom_site
    const comp_id = data.label_comp_id.isDefined ? data.label_comp_id : data.auth_comp_id;
    for (let i = 0, il = comp_id.rowCount; i < il; ++i) {
        uniqueNames.add(comp_id.value(i))
    }
    return uniqueNames
})

export interface FormatData {
    modifiedResidues: Model['properties']['modifiedResidues']
    chemicalComponentMap: Model['properties']['chemicalComponentMap']
    saccharideComponentMap: Model['properties']['saccharideComponentMap']
}

function getFormatData(format: mmCIF_Format): FormatData {
    return {
        modifiedResidues: getModifiedResidueNameMap(format),
        chemicalComponentMap: getChemicalComponentMap(format),
        saccharideComponentMap: getSaccharideComponentMap(format)
    }
}

function createStandardModel(format: mmCIF_Format, atom_site: AtomSite, entities: Entities, formatData: FormatData, previous?: Model): Model {
    const atomic = getAtomicHierarchyAndConformation(format, atom_site, entities, formatData, previous);
    if (previous && atomic.sameAsPrevious) {
        return {
            ...previous,
            id: UUID.create22(),
            modelNum: atom_site.pdbx_PDB_model_num.value(0),
            atomicConformation: atomic.conformation,
            _dynamicPropertyData: Object.create(null)
        };
    }

    const coarse = EmptyIHMCoarse;
    const label = format.data.entry.id.valueKind(0) === Column.ValueKind.Present
        ? format.data.entry.id.value(0)
        : format.data._name;

    return {
        id: UUID.create22(),
        label,
        sourceData: format,
        modelNum: atom_site.pdbx_PDB_model_num.value(0),
        entities,
        symmetry: getSymmetry(format),
        sequence: getSequence(format.data, entities, atomic.hierarchy, formatData.modifiedResidues.parentId),
        atomicHierarchy: atomic.hierarchy,
        atomicConformation: atomic.conformation,
        coarseHierarchy: coarse.hierarchy,
        coarseConformation: coarse.conformation,
        properties: {
            secondaryStructure: getSecondaryStructureMmCif(format.data, atomic.hierarchy),
            ...formatData
        },
        customProperties: new CustomProperties(),
        _staticPropertyData: Object.create(null),
        _dynamicPropertyData: Object.create(null)
    };
}

function createModelIHM(format: mmCIF_Format, data: IHMData, formatData: FormatData): Model {
    const atomic = getAtomicHierarchyAndConformation(format, data.atom_site, data.entities, formatData);
    const coarse = getIHMCoarse(data, formatData);

    return {
        id: UUID.create22(),
        label: data.model_name,
        sourceData: format,
        modelNum: data.model_id,
        entities: data.entities,
        symmetry: getSymmetry(format),
        sequence: getSequence(format.data, data.entities, atomic.hierarchy, formatData.modifiedResidues.parentId),
        atomicHierarchy: atomic.hierarchy,
        atomicConformation: atomic.conformation,
        coarseHierarchy: coarse.hierarchy,
        coarseConformation: coarse.conformation,
        properties: {
            secondaryStructure: getSecondaryStructureMmCif(format.data, atomic.hierarchy),
            ...formatData
        },
        customProperties: new CustomProperties(),
        _staticPropertyData: Object.create(null),
        _dynamicPropertyData: Object.create(null)
    };
}

function attachProps(model: Model) {
    ComponentBond.attachFromMmCif(model);
    StructConn.attachFromMmCif(model);
}

function findModelEnd(num: Column<number>, startIndex: number) {
    const rowCount = num.rowCount;
    if (!num.isDefined) return rowCount;
    let endIndex = startIndex + 1;
    while (endIndex < rowCount && num.areValuesEqual(startIndex, endIndex)) endIndex++;
    return endIndex;
}

async function readStandard(ctx: RuntimeContext, format: mmCIF_Format, formatData: FormatData) {
    const atomCount = format.data.atom_site._rowCount;
    const entities: Entities = { data: format.data.entity, getEntityIndex: Column.createIndexer(format.data.entity.id) };

    const models: Model[] = [];
    let modelStart = 0;
    while (modelStart < atomCount) {
        const modelEnd = findModelEnd(format.data.atom_site.pdbx_PDB_model_num, modelStart);
        const atom_site = await sortAtomSite(ctx, format.data.atom_site, modelStart, modelEnd);
        const model = createStandardModel(format, atom_site, entities, formatData, models.length > 0 ? models[models.length - 1] : void 0);
        attachProps(model);
        models.push(model);
        modelStart = modelEnd;
    }
    return models;
}

function splitTable<T extends Table<any>>(table: T, col: Column<number>) {
    const ret = new Map<number, T>()
    const rowCount = table._rowCount;
    let modelStart = 0;
    while (modelStart < rowCount) {
        const modelEnd = findModelEnd(col, modelStart);
        const id = col.value(modelStart);
        const window = Table.window(table, table._schema, modelStart, modelEnd) as T;
        ret.set(id, window);
        modelStart = modelEnd;
    }
    return ret;
}

async function readIHM(ctx: RuntimeContext, format: mmCIF_Format, formatData: FormatData) {
    const { ihm_model_list } = format.data;
    const entities: Entities = { data: format.data.entity, getEntityIndex: Column.createIndexer(format.data.entity.id) };

    if (!format.data.atom_site.ihm_model_id.isDefined) {
        throw new Error('expected _atom_site.ihm_model_id to be defined')
    }

    // TODO: will IHM require sorting or will we trust it?
    const atom_sites = splitTable(format.data.atom_site, format.data.atom_site.ihm_model_id);
    const sphere_sites = splitTable(format.data.ihm_sphere_obj_site, format.data.ihm_sphere_obj_site.model_id);
    const gauss_sites = splitTable(format.data.ihm_gaussian_obj_site, format.data.ihm_gaussian_obj_site.model_id);

    const models: Model[] = [];

    const { model_id, model_name } = ihm_model_list;
    for (let i = 0; i < ihm_model_list._rowCount; i++) {
        const id = model_id.value(i);
        const data: IHMData = {
            model_id: id,
            model_name: model_name.value(i),
            entities: entities,
            atom_site: atom_sites.has(id) ? atom_sites.get(id)! : Table.window(format.data.atom_site, format.data.atom_site._schema, 0, 0),
            ihm_sphere_obj_site: sphere_sites.has(id) ? sphere_sites.get(id)! : Table.window(format.data.ihm_sphere_obj_site, format.data.ihm_sphere_obj_site._schema, 0, 0),
            ihm_gaussian_obj_site: gauss_sites.has(id) ? gauss_sites.get(id)! : Table.window(format.data.ihm_gaussian_obj_site, format.data.ihm_gaussian_obj_site._schema, 0, 0)
        };
        const model = createModelIHM(format, data, formatData);
        attachProps(model);
        models.push(model);
    }

    return models;
}