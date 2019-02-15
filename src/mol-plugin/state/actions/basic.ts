/**
 * Copyright (c) 2018-2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { PluginContext } from 'mol-plugin/context';
import { StateTree, Transformer } from 'mol-state';
import { StateAction } from 'mol-state/action';
import { StateSelection } from 'mol-state/state/selection';
import { StateTreeBuilder } from 'mol-state/tree/builder';
import { ParamDefinition as PD } from 'mol-util/param-definition';
import { PluginStateObject } from '../objects';
import { StateTransforms } from '../transforms';
import { Download } from '../transforms/data';
import { StructureRepresentation3DHelpers } from '../transforms/representation';
import { getFileInfo, FileInput } from 'mol-util/file-info';
import { Task } from 'mol-task';

// TODO: "structure/volume parser provider"

export { DownloadStructure };
type DownloadStructure = typeof DownloadStructure
const DownloadStructure = StateAction.build({
    from: PluginStateObject.Root,
    display: { name: 'Download Structure', description: 'Load a structure from the provided source and create its default Assembly and visual.' },
    params: {
        source: PD.MappedStatic('bcif-static', {
            'pdbe-updated': PD.Group({
                id: PD.Text('1cbs', { label: 'Id' }),
                supportProps: PD.Boolean(false)
            }, { isFlat: true }),
            'rcsb': PD.Group({
                id: PD.Text('1tqn', { label: 'Id' }),
                supportProps: PD.Boolean(false)
            }, { isFlat: true }),
            'bcif-static': PD.Group({
                id: PD.Text('1tqn', { label: 'Id' }),
                supportProps: PD.Boolean(false)
            }, { isFlat: true }),
            'url': PD.Group({
                url: PD.Text(''),
                format: PD.Select('cif', [['cif', 'CIF'], ['pdb', 'PDB']]),
                isBinary: PD.Boolean(false),
                supportProps: PD.Boolean(false)
            }, { isFlat: true })
        }, {
            options: [
                ['pdbe-updated', 'PDBe Updated'],
                ['rcsb', 'RCSB'],
                ['bcif-static', 'BinaryCIF (static PDBe Updated)'],
                ['url', 'URL']
            ]
        })
    }
})(({ params, state }, ctx: PluginContext) => {
    const b = state.build();
    const src = params.source;
    let downloadParams: Transformer.Params<Download>;

    switch (src.name) {
        case 'url':
            downloadParams = { url: src.params.url, isBinary: src.params.isBinary };
            break;
        case 'pdbe-updated':
            downloadParams = { url: `https://www.ebi.ac.uk/pdbe/static/entry/${src.params.id.toLowerCase()}_updated.cif`, isBinary: false, label: `PDBe: ${src.params.id}` };
            break;
        case 'rcsb':
            downloadParams = { url: `https://files.rcsb.org/download/${src.params.id.toUpperCase()}.cif`, isBinary: false, label: `RCSB: ${src.params.id}` };
            break;
        case 'bcif-static':
            downloadParams = { url: `https://webchem.ncbr.muni.cz/ModelServer/static/bcif/${src.params.id.toLowerCase()}`, isBinary: true, label: `BinaryCIF: ${src.params.id}` };
            break;
        default: throw new Error(`${(src as any).name} not supported.`);
    }

    const data = b.toRoot().apply(StateTransforms.Data.Download, downloadParams);
    const traj = createModelTree(data, src.name === 'url' ? src.params.format : 'cif');
    return state.updateTree(createStructureTree(ctx, traj, params.source.params.supportProps));
});

export const OpenStructure = StateAction.build({
    display: { name: 'Open Structure', description: 'Load a structure from file and create its default Assembly and visual' },
    from: PluginStateObject.Root,
    params: { file: PD.File({ accept: '.cif,.bcif' }) }
})(({ params, state }, ctx: PluginContext) => {
    const b = state.build();
    const data = b.toRoot().apply(StateTransforms.Data.ReadFile, { file: params.file, isBinary: /\.bcif$/i.test(params.file.name) });
    const traj = createModelTree(data, 'cif');
    return state.updateTree(createStructureTree(ctx, traj, false));
});

function createModelTree(b: StateTreeBuilder.To<PluginStateObject.Data.Binary | PluginStateObject.Data.String>, format: 'pdb' | 'cif' = 'cif') {
    const parsed = format === 'cif'
        ? b.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif)
        : b.apply(StateTransforms.Model.TrajectoryFromPDB);

    return parsed.apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: 0 });
}

function createStructureTree(ctx: PluginContext, b: StateTreeBuilder.To<PluginStateObject.Molecule.Model>, supportProps: boolean): StateTree {
    let root = b;
    if (supportProps) {
        root = root.apply(StateTransforms.Model.CustomModelProperties);
    }
    const structure = root.apply(StateTransforms.Model.StructureAssemblyFromModel);
    complexRepresentation(ctx, structure);

    return root.getTree();
}

function complexRepresentation(ctx: PluginContext, root: StateTreeBuilder.To<PluginStateObject.Molecule.Structure>) {
    root.apply(StateTransforms.Model.StructureComplexElement, { type: 'atomic-sequence' })
        .apply(StateTransforms.Representation.StructureRepresentation3D,
            StructureRepresentation3DHelpers.getDefaultParamsStatic(ctx, 'cartoon'));
    root.apply(StateTransforms.Model.StructureComplexElement, { type: 'atomic-het' })
        .apply(StateTransforms.Representation.StructureRepresentation3D,
            StructureRepresentation3DHelpers.getDefaultParamsStatic(ctx, 'ball-and-stick'));
    root.apply(StateTransforms.Model.StructureComplexElement, { type: 'water' })
        .apply(StateTransforms.Representation.StructureRepresentation3D,
            StructureRepresentation3DHelpers.getDefaultParamsStatic(ctx, 'ball-and-stick', { alpha: 0.51 }));
    root.apply(StateTransforms.Model.StructureComplexElement, { type: 'spheres' })
        .apply(StateTransforms.Representation.StructureRepresentation3D,
            StructureRepresentation3DHelpers.getDefaultParamsStatic(ctx, 'spacefill'));
}

export const CreateComplexRepresentation = StateAction.build({
    display: { name: 'Create Complex', description: 'Split the structure into Sequence/Water/Ligands/... ' },
    from: PluginStateObject.Molecule.Structure
})(({ ref, state }, ctx: PluginContext) => {
    const root = state.build().to(ref);
    complexRepresentation(ctx, root);
    return state.updateTree(root.getTree());
});

export const UpdateTrajectory = StateAction.build({
    display: { name: 'Update Trajectory' },
    params: {
        action: PD.Select<'advance' | 'reset'>('advance', [['advance', 'Advance'], ['reset', 'Reset']]),
        by: PD.makeOptional(PD.Numeric(1, { min: -1, max: 1, step: 1 }))
    }
})(({ params, state }) => {
    const models = state.selectQ(q => q.rootsOfType(PluginStateObject.Molecule.Model)
        .filter(c => c.transform.transformer === StateTransforms.Model.ModelFromTrajectory));

    const update = state.build();

    if (params.action === 'reset') {
        for (const m of models) {
            update.to(m.transform.ref).update(StateTransforms.Model.ModelFromTrajectory,
                () => ({ modelIndex: 0 }));
        }
    } else {
        for (const m of models) {
            const parent = StateSelection.findAncestorOfType(state.tree, state.cells, m.transform.ref, [PluginStateObject.Molecule.Trajectory]);
            if (!parent || !parent.obj) continue;
            const traj = parent.obj as PluginStateObject.Molecule.Trajectory;
            update.to(m.transform.ref).update(StateTransforms.Model.ModelFromTrajectory,
                old => {
                    let modelIndex = (old.modelIndex + params.by!) % traj.data.length;
                    if (modelIndex < 0) modelIndex += traj.data.length;
                    return { modelIndex };
                });
        }
    }

    return state.updateTree(update);
});

//

const VolumeFormats = { 'ccp4': '', 'mrc': '', 'map': '', 'dsn6': '', 'brix': '' }
type VolumeFormat = keyof typeof VolumeFormats

function getVolumeData(format: VolumeFormat, b: StateTreeBuilder.To<PluginStateObject.Data.Binary | PluginStateObject.Data.String>) {
    switch (format) {
        case 'ccp4': case 'mrc': case 'map':
            return b.apply(StateTransforms.Data.ParseCcp4).apply(StateTransforms.Model.VolumeFromCcp4);
        case 'dsn6': case 'brix':
            return b.apply(StateTransforms.Data.ParseDsn6).apply(StateTransforms.Model.VolumeFromDsn6);
    }
}

function createVolumeTree(format: VolumeFormat, ctx: PluginContext, b: StateTreeBuilder.To<PluginStateObject.Data.Binary | PluginStateObject.Data.String>): StateTree {
    return getVolumeData(format, b)
        .apply(StateTransforms.Representation.VolumeRepresentation3D)
            // the parameters will be used automatically by the reconciler and the IsoValue object
            // will get the correct Stats object instead of the empty one
            // VolumeRepresentation3DHelpers.getDefaultParamsStatic(ctx, 'isosurface'))
        .getTree();
}

function getFileFormat(format: VolumeFormat | 'auto', file: FileInput, data?: Uint8Array): VolumeFormat {
    if (format === 'auto') {
        const fileFormat = getFileInfo(file).ext
        if (fileFormat in VolumeFormats) {
            return fileFormat as VolumeFormat
        } else {
            throw new Error('unsupported format')
        }
    } else {
        return format
    }
}

export const OpenVolume = StateAction.build({
    display: { name: 'Open Volume', description: 'Load a volume from file and create its default visual' },
    from: PluginStateObject.Root,
    params: {
        file: PD.File({ accept: '.ccp4,.mrc,.map,.dsn6,.brix'}),
        format: PD.Select('auto', [
            ['auto', 'Automatic'], ['ccp4', 'CCP4'], ['mrc', 'MRC'], ['map', 'MAP'], ['dsn6', 'DSN6'], ['brix', 'BRIX']
        ]),
    }
})(({ params, state }, ctx: PluginContext) => Task.create('Open Volume', async taskCtx => {
    const dataTree = state.build().toRoot().apply(StateTransforms.Data.ReadFile, { file: params.file, isBinary: true });
    const volumeData = await state.updateTree(dataTree).runInContext(taskCtx);

    // Alternative for more complex states where the builder is not a simple StateTreeBuilder.To<>:
    /*
    const dataRef = dataTree.ref;
    await state.updateTree(dataTree).runInContext(taskCtx);
    const dataCell = state.select(dataRef)[0];
    */

    const format = getFileFormat(params.format, params.file, volumeData.data as Uint8Array);
    const volumeTree = state.build().to(dataTree.ref);
    // need to await the 2nd update the so that the enclosing Task finishes after the update is done.
    await state.updateTree(createVolumeTree(format, ctx, volumeTree)).runInContext(taskCtx);
}));

export { DownloadDensity };
type DownloadDensity = typeof DownloadDensity
const DownloadDensity = StateAction.build({
    from: PluginStateObject.Root,
    display: { name: 'Download Density', description: 'Load a density from the provided source and create its default visual.' },
    params: {
        source: PD.MappedStatic('rcsb', {
            'pdbe': PD.Group({
                id: PD.Text('1tqn', { label: 'Id' }),
                type: PD.Select('2fofc', [['2fofc', '2Fo-Fc'], ['fofc', 'Fo-Fc']]),
            }, { isFlat: true }),
            'rcsb': PD.Group({
                id: PD.Text('1tqn', { label: 'Id' }),
                type: PD.Select('2fofc', [['2fofc', '2Fo-Fc'], ['fofc', 'Fo-Fc']]),
            }, { isFlat: true }),
            'url': PD.Group({
                url: PD.Text(''),
                format: PD.Select('auto', [
                    ['auto', 'Automatic'], ['ccp4', 'CCP4'], ['mrc', 'MRC'], ['map', 'MAP'], ['dsn6', 'DSN6'], ['brix', 'BRIX']
                ]),
            }, { isFlat: true })
        }, {
            options: [
                ['pdbe', 'PDBe X-ray maps'],
                ['rcsb', 'RCSB X-ray maps'],
                ['url', 'URL']
            ]
        })
    }
})(({ params, state }, ctx: PluginContext) => {
    const b = state.build();
    const src = params.source;
    let downloadParams: Transformer.Params<Download>;
    let format: VolumeFormat

    switch (src.name) {
        case 'url':
            downloadParams = src.params;
            format = getFileFormat(src.params.format, src.params.url)
            break;
        case 'pdbe':
            downloadParams = {
                url: src.params.type === '2fofc'
                    ? `http://www.ebi.ac.uk/pdbe/coordinates/files/${src.params.id.toLowerCase()}.ccp4`
                    : `http://www.ebi.ac.uk/pdbe/coordinates/files/${src.params.id.toLowerCase()}_diff.ccp4`,
                isBinary: true,
                label: `PDBe X-ray map: ${src.params.id}`
            };
            format = 'ccp4'
            break;
        case 'rcsb':
            downloadParams = {
                url: src.params.type === '2fofc'
                    ? `https://edmaps.rcsb.org/maps/${src.params.id.toLowerCase()}_2fofc.dsn6`
                    : `https://edmaps.rcsb.org/maps/${src.params.id.toLowerCase()}_fofc.dsn6`,
                isBinary: true,
                label: `RCSB X-ray map: ${src.params.id}`
            };
            format = 'dsn6'
            break;
        default: throw new Error(`${(src as any).name} not supported.`);
    }

    const data = b.toRoot().apply(StateTransforms.Data.Download, downloadParams);
    return state.updateTree(createVolumeTree(format, ctx, data));
});