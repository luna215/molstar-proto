/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { State, Transform, Transformer } from 'mol-state';
import * as React from 'react';
import { PurePluginComponent } from '../base';
import { ParameterControls, ParamOnChange } from '../controls/parameters';
import { StateAction } from 'mol-state/action';
import { PluginContext } from 'mol-plugin/context';
import { ParamDefinition as PD } from 'mol-util/param-definition';
import { Subject } from 'rxjs';

export { StateTransformParameters, TransformContolBase };

class StateTransformParameters extends PurePluginComponent<StateTransformParameters.Props> {
    validate(params: any) {
        // TODO
        return void 0;
    }

    areInitial(params: any) {
        return PD.areEqual(this.props.info.params, params, this.props.info.initialValues);
    }

    onChange: ParamOnChange = ({ name, value }) => {
        const params = { ...this.props.params, [name]: value };
        this.props.events.onChange(params, this.areInitial(params), this.validate(params));
    };

    render() {
        return <ParameterControls params={this.props.info.params} values={this.props.params} onChange={this.onChange} onEnter={this.props.events.onEnter} isDisabled={this.props.isDisabled} />;
    }
}


namespace StateTransformParameters {
    export interface Props {
        info: {
            params: PD.Params,
            initialValues: any,
            isEmpty: boolean
        },
        events: {
            onChange: (params: any, areInitial: boolean, errors?: string[]) => void,
            onEnter: () => void,
        }
        params: any,
        isDisabled?: boolean
    }

    export type Class = React.ComponentClass<Props>

    function areParamsEmpty(params: PD.Params) {
        const keys = Object.keys(params);
        for (const k of keys) {
            if (!params[k].isHidden) return false;
        }
        return true;
    }

    export function infoFromAction(plugin: PluginContext, state: State, action: StateAction, nodeRef: Transform.Ref): Props['info'] {
        const source = state.cells.get(nodeRef)!.obj!;
        const params = action.definition.params ? action.definition.params(source, plugin) : { };
        const initialValues = PD.getDefaultValues(params);
        return {
            initialValues,
            params,
            isEmpty: areParamsEmpty(params)
        };
    }

    export function infoFromTransform(plugin: PluginContext, state: State, transform: Transform): Props['info'] {
        const cell = state.cells.get(transform.ref)!;
        // const source: StateObjectCell | undefined = (cell.sourceRef && state.cells.get(cell.sourceRef)!) || void 0;
        // const create = transform.transformer.definition.params;
        // const params = create ? create((source && source.obj) as any, plugin) : { };
        const params = (cell.params && cell.params.definition) || { };
        const initialValues = (cell.params && cell.params.values) || { };
        return {
            initialValues,
            params,
            isEmpty: areParamsEmpty(params)
        }
    }
}

namespace TransformContolBase {
    export interface ControlState {
        params: any,
        error?: string,
        busy: boolean,
        isInitial: boolean,
        isCollapsed?: boolean
    }
}

abstract class TransformContolBase<P, S extends TransformContolBase.ControlState> extends PurePluginComponent<P, S> {
    abstract applyAction(): Promise<void>;
    abstract getInfo(): StateTransformParameters.Props['info'];
    abstract getHeader(): Transformer.Definition['display'];
    abstract canApply(): boolean;
    abstract getTransformerId(): string;
    abstract canAutoApply(newParams: any): boolean;
    abstract applyText(): string;
    abstract isUpdate(): boolean;
    abstract state: S;

    private busy: Subject<boolean>;

    private onEnter = () => {
        if (this.state.error) return;
        this.apply();
    }

    private autoApplyHandle: number | undefined = void 0;
    private clearAutoApply() {
        if (this.autoApplyHandle !== void 0) {
            clearTimeout(this.autoApplyHandle);
            this.autoApplyHandle = void 0;
        }
    }

    events: StateTransformParameters.Props['events'] = {
        onEnter: this.onEnter,
        onChange: (params, isInitial, errors) => {
            this.clearAutoApply();
            this.setState({ params, isInitial, error: errors && errors[0] }, () => {
                if (!isInitial && !this.state.error && this.canAutoApply(params)) {
                    this.clearAutoApply();
                    this.autoApplyHandle = setTimeout(this.apply, 50) as any as number;
                }
            });
        }
    }

    apply = async () => {
        this.clearAutoApply();
        this.setState({ busy: true });
        try {
            await this.applyAction();
        } finally {
            this.busy.next(false);
        }
    }

    init() {
        this.busy = new Subject();
        this.subscribe(this.busy, busy => this.setState({ busy }));
    }

    refresh = () => {
        this.setState({ params: this.getInfo().initialValues, isInitial: true, error: void 0 });
    }

    setDefault = () => {
        const info = this.getInfo();
        const params = PD.getDefaultValues(info.params);
        this.setState({ params, isInitial: PD.areEqual(info.params, params, info.initialValues), error: void 0 });
    }

    toggleExpanded = () => {
        this.setState({ isCollapsed: !this.state.isCollapsed });
    }

    render() {
        const info = this.getInfo();
        if (info.isEmpty && this.isUpdate()) return null;

        const display = this.getHeader();

        const tId = this.getTransformerId();
        const ParamEditor: StateTransformParameters.Class = this.plugin.customParamEditors.has(tId)
            ? this.plugin.customParamEditors.get(tId)!
            : StateTransformParameters;

        return <div className='msp-transform-wrapper'>
            <div className='msp-transform-header'>
                <button className='msp-btn msp-btn-block' onClick={this.toggleExpanded}>{display.name}</button>
                {!this.state.isCollapsed && <button className='msp-btn msp-btn-link msp-transform-default-params' onClick={this.setDefault} disabled={this.state.busy} style={{ float: 'right'}} title='Set default params'>↻</button>}
            </div>
            {!this.state.isCollapsed && <>
                <ParamEditor info={info} events={this.events} params={this.state.params} isDisabled={this.state.busy} />

                <div className='msp-transform-apply-wrap'>
                    <button className='msp-btn msp-btn-block msp-transform-refresh msp-form-control' title='Refresh params' onClick={this.refresh} disabled={this.state.busy || this.state.isInitial}>
                        ↶ Reset
                    </button>
                    <div className='msp-transform-apply'>
                        <button className={`msp-btn msp-btn-block msp-btn-commit msp-btn-commit-${this.canApply() ? 'on' : 'off'}`} onClick={this.apply} disabled={!this.canApply()}>
                            {this.applyText()}
                        </button>
                    </div>
                </div>
            </>}
        </div>
    }
}