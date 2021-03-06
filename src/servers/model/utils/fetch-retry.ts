/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import fetch from 'node-fetch';
import { retryIf } from 'mol-util/retry-if';

const RETRIABLE_NETWORK_ERRORS = [
    'ECONNRESET', 'ENOTFOUND', 'ESOCKETTIMEDOUT', 'ETIMEDOUT',
    'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE', 'EAI_AGAIN'
];

function isRetriableNetworkError(error: any) {
    return error && RETRIABLE_NETWORK_ERRORS.includes(error.code);
}

export async function fetchRetry(url: string, timeout: number, retryCount: number) {
    const result = await retryIf(() => fetch(url, { timeout }), {
        retryThenIf: r => r.status >= 500 && r.status < 600,
        // TODO test retryCatchIf
        retryCatchIf: e => isRetriableNetworkError(e),
        retryCount
    });

    return result;
    // if (result.status >= 200 && result.status < 300) return result;
    // throw new Error(result.statusText);
}
