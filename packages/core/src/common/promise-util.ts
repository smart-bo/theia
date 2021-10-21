/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { CancellationToken, cancelled } from './cancellation';

/**
 * Simple implementation of the deferred pattern.
 * An object that exposes a promise and functions to resolve and reject it.
 */
export class Deferred<T> {
    state: 'resolved' | 'rejected' | 'unresolved' = 'unresolved';
    resolve: (value?: T) => void;
    reject: (err?: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

    promise = new Promise<T>((resolve, reject) => {
        this.resolve = result => {
            resolve(result as T);
            if (this.state === 'unresolved') {
                this.state = 'resolved';
            }
        };
        this.reject = err => {
            reject(err);
            if (this.state === 'unresolved') {
                this.state = 'rejected';
            }
        };
    });
}

/**
 * @returns resolves after a specified number of milliseconds
 * @throws cancelled if a given token is cancelled before a specified number of milliseconds
 */
export function timeout(ms: number, token = CancellationToken.None): Promise<void> {
    const deferred = new Deferred<void>();
    const handle = setTimeout(() => deferred.resolve(), ms);
    token.onCancellationRequested(() => {
        clearTimeout(handle);
        deferred.reject(cancelled());
    });
    return deferred.promise;
}

export async function retry<T>(task: () => Promise<T>, retryDelay: number, retries: number): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < retries; i++) {
        try {
            return await task();
        } catch (error) {
            lastError = error;

            await timeout(retryDelay);
        }
    }

    throw lastError;
}

/**
 * A function to allow a promise resolution to be delayed by a number of milliseconds. Usage is as follows:
 *
 * `const stringValue = await myPromise.then(delay(600)).then(value => value.toString());`
 *
 * @param ms the number of millisecond to delay
 * @returns a function that returns a promise that returns the given value, but delayed
 */
export function delay<T>(ms: number): (value: T) => Promise<T> {
    return value => new Promise((resolve, reject) => { setTimeout(() => resolve(value), ms); });
}

/**
 * Constructs a promise that will resolve after a given delay.
 * @param ms the number of milliseconds to wait
 */
export async function wait(ms: number): Promise<void> {
    await delay(ms)(undefined);
}

export interface DebounceAsyncOptions {
    leading?: boolean
    maxWait?: number
    trailing?: boolean
}

/**
 * Debounce asynchronous functions.
 *
 * It will not wait for the result promise to resolve before scheduling the following calls!
 */
export function debounceAsync<
    // eslint-disable-next-line space-before-function-paren
    F extends (...args: A) => R,
    A extends unknown[] = Parameters<F>,
    R extends Promise<unknown> = ReturnType<F>
// eslint-disable-next-line @typescript-eslint/no-shadow
>(func: F, wait?: number, options?: DebounceAsyncOptions): (...args: A) => R {
    // Lazily load `lodash.debounce` to be nice on startup by not preloading this third-party.
    const debouncedPromise = import('lodash.debounce').then(debounce => debounce(
        (
            resolve: (value: R) => void,
            reject: (error: unknown) => void,
            args: A,
        ) => {
            func(...args).then(resolve, reject);
        },
        wait,
        options,
    ));
    // `lodash.debounce` returns a new function that may return `Promise<R> | undefined`.
    // This `undefined` part is problematic as our APIs often return `Promise<R>` alone.
    // We need to do a few shenanigans to make sure that we always return a promise that
    // resolves once the debounced async function is actually called.
    return (...args: A) => new Promise((resolve, reject) => {
        debouncedPromise.then(debounced => debounced(resolve, reject, args));
    }) as R;
}
