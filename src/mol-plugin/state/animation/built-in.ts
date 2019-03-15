/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { PluginStateAnimation } from './model';
import { PluginStateObject } from '../objects';
import { StateTransforms } from '../transforms';
import { StateSelection, StateTransform } from 'mol-state';
import { PluginCommands } from 'mol-plugin/command';
import { ParamDefinition as PD } from 'mol-util/param-definition';
import { PluginContext } from 'mol-plugin/context';

export const AnimateModelIndex = PluginStateAnimation.create({
    name: 'built-in.animate-model-index',
    display: { name: 'Animate Trajectory' },
    params: () => ({
        mode: PD.MappedStatic('palindrome', {
            palindrome: PD.Group({ }),
            loop: PD.Group({ }),
            once: PD.Group({ direction: PD.Select('forward', [['forward', 'Forward'], ['backward', 'Backward']]) }, { isFlat: true })
        }, { options: [['palindrome', 'Palindrome'], ['loop', 'Loop'], ['once', 'Once']] }),
        maxFPS: PD.Numeric(15, { min: 1, max: 30, step: 1 })
    }),
    initialState: () => ({} as { palindromeDirections?: { [id: string]: -1 | 1 | undefined } }),
    async apply(animState, t, ctx) {
        // limit fps
        if (t.current > 0 && t.current - t.lastApplied < 1000 / ctx.params.maxFPS) {
            return { kind: 'skip' };
        }

        const state = ctx.plugin.state.dataState;
        const models = state.select(StateSelection.Generators.ofTransformer(StateTransforms.Model.ModelFromTrajectory));

        if (models.length === 0) {
            // nothing more to do here
            return { kind: 'finished' };
        }

        const update = state.build();

        const params = ctx.params;
        const palindromeDirections = animState.palindromeDirections || { };
        let isEnd = false, allSingles = true;

        for (const m of models) {
            const parent = StateSelection.findAncestorOfType(state.tree, state.cells, m.transform.ref, [PluginStateObject.Molecule.Trajectory]);
            if (!parent || !parent.obj) continue;
            const traj = parent.obj;
            update.to(m).update(old => {
                const len = traj.data.length;
                if (len !== 1) {
                    allSingles = false;
                } else {
                    return old;
                }
                let dir: -1 | 1 = 1;
                if (params.mode.name === 'once') {
                    dir = params.mode.params.direction === 'backward' ? -1 : 1;
                    // if we are at start or end already, do nothing.
                    if ((dir === -1 && old.modelIndex === 0) || (dir === 1 && old.modelIndex === len - 1)) {
                        isEnd = true;
                        return old;
                    }
                } else if (params.mode.name === 'palindrome') {
                    if (old.modelIndex === 0) dir = 1;
                    else if (old.modelIndex === len - 1) dir = -1;
                    else dir = palindromeDirections[m.transform.ref] || 1;
                }
                palindromeDirections[m.transform.ref] = dir;

                let modelIndex = (old.modelIndex + dir) % len;
                if (modelIndex < 0) modelIndex += len;

                isEnd = isEnd || (dir === -1 && modelIndex === 0) || (dir === 1 && modelIndex === len - 1);

                return { modelIndex };
            });
        }

        await PluginCommands.State.Update.dispatch(ctx.plugin, { state, tree: update, options: { doNotLogTiming: true } });

        if (allSingles || (params.mode.name === 'once' && isEnd)) return { kind: 'finished' };
        if (params.mode.name === 'palindrome') return { kind: 'next', state: { palindromeDirections } };
        return { kind: 'next', state: {} };
    }
})

export const AnimateAssemblyUnwind = PluginStateAnimation.create({
    name: 'built-in.animate-assembly-unwind',
    display: { name: 'Unwind Assembly' },
    params: (plugin: PluginContext) => {
        const targets: [string, string][] = [['all', 'All']];
        const structures = plugin.state.dataState.select(StateSelection.Generators.rootsOfType(PluginStateObject.Molecule.Structure));

        for (const s of structures) {
            targets.push([s.transform.ref, s.obj!.data.models[0].label]);
        }

        return {
            durationInMs: PD.Numeric(3000, { min: 100, max: 10000, step: 100}),
            playOnce: PD.Boolean(false),
            target: PD.Select(targets[0][0], targets)
        };
    },
    initialState: () => ({ t: 0 }),
    async setup(params, plugin) {
        const state = plugin.state.dataState;
        const root = !params.target || params.target === 'all' ? StateTransform.RootRef : params.target;
        const reprs = state.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D, root));

        const update = state.build();
        let changed = false;
        for (const r of reprs) {
            // TODO: find a better way to handle this, perhaps add a different state object??
            if (r.transform.transformer === StateTransforms.Representation.StructureLabels3D) continue;

            const unwinds = state.select(StateSelection.Generators.ofTransformer(StateTransforms.Representation.UnwindStructureAssemblyRepresentation3D, r.transform.ref));
            if (unwinds.length > 0) continue;

            changed = true;
            update.to(r)
                .apply(StateTransforms.Representation.UnwindStructureAssemblyRepresentation3D, { t: 0 }, { props: { tag: 'animate-assembly-unwind' } });
        }

        if (!changed) return;

        return plugin.runTask(state.updateTree(update, { doNotUpdateCurrent: true }));
    },
    async teardown(_, plugin) {
        const state = plugin.state.dataState;
        const reprs = state.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3DState)
            .filter(c => c.transform.props.tag === 'animate-assembly-unwind'));
        if (reprs.length === 0) return;

        const update = state.build();
        for (const r of reprs) update.delete(r.transform.ref);
        return plugin.runTask(state.updateTree(update));
    },
    async apply(animState, t, ctx) {
        const state = ctx.plugin.state.dataState;
        const root = !ctx.params.target || ctx.params.target === 'all' ? StateTransform.RootRef : ctx.params.target;
        const anims = state.select(StateSelection.Generators.ofTransformer(StateTransforms.Representation.UnwindStructureAssemblyRepresentation3D, root));

        if (anims.length === 0) {
            return { kind: 'finished' };
        }

        const update = state.build();

        const d = (t.current - t.lastApplied) / ctx.params.durationInMs;
        let newTime = (animState.t + d), finished = false;
        if (ctx.params.playOnce && newTime >= 1) {
            finished = true;
            newTime = 1;
        } else {
            newTime = newTime % 1;
        }

        for (const m of anims) {
            update.to(m).update({ t: newTime });
        }

        await PluginCommands.State.Update.dispatch(ctx.plugin, { state, tree: update, options: { doNotLogTiming: true } });

        if (finished) return { kind: 'finished' };
        return { kind: 'next', state: { t: newTime } };
    }
})

export const AnimateUnitsExplode = PluginStateAnimation.create({
    name: 'built-in.animate-units-explode',
    display: { name: 'Explode Units' },
    params: () => ({
        durationInMs: PD.Numeric(3000, { min: 100, max: 10000, step: 100})
    }),
    initialState: () => ({ t: 0 }),
    async setup(_, plugin) {
        const state = plugin.state.dataState;
        const reprs = state.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3D));

        const update = state.build();
        let changed = false;
        for (const r of reprs) {
            // TODO: find a better way to handle this, perhaps add a different state object??
            if (r.transform.transformer === StateTransforms.Representation.StructureLabels3D) continue;

            const explodes = state.select(StateSelection.Generators.ofTransformer(StateTransforms.Representation.ExplodeStructureRepresentation3D, r.transform.ref));
            if (explodes.length > 0) continue;

            changed = true;
            update.to(r.transform.ref)
                .apply(StateTransforms.Representation.ExplodeStructureRepresentation3D, { t: 0 }, { props: { tag: 'animate-units-explode' } });
        }

        if (!changed) return;

        return plugin.runTask(state.updateTree(update, { doNotUpdateCurrent: true }));
    },
    async teardown(_, plugin) {
        const state = plugin.state.dataState;
        const reprs = state.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure.Representation3DState)
            .filter(c => c.transform.props.tag === 'animate-units-explode'));
        if (reprs.length === 0) return;

        const update = state.build();
        for (const r of reprs) update.delete(r.transform.ref);
        return plugin.runTask(state.updateTree(update));
    },
    async apply(animState, t, ctx) {
        const state = ctx.plugin.state.dataState;
        const anims = state.select(StateSelection.Generators.ofTransformer(StateTransforms.Representation.ExplodeStructureRepresentation3D));

        if (anims.length === 0) {
            return { kind: 'finished' };
        }

        const update = state.build();

        const d = (t.current - t.lastApplied) / ctx.params.durationInMs;
        const newTime = (animState.t + d) % 1;

        for (const m of anims) {
            update.to(m).update({ t: newTime });
        }

        await PluginCommands.State.Update.dispatch(ctx.plugin, { state, tree: update, options: { doNotLogTiming: true } });

        return { kind: 'next', state: { t: newTime } };
    }
})