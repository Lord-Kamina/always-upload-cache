import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { RequestError } from "@octokit/request-error"
import { OctokitResponse } from "@octokit/types"

const { Octokit } = require("@octokit/action");

import { Outputs, RefKey, State } from "../constants";

export function isGhes(): boolean {
    const ghUrl = new URL(
        process.env["GITHUB_SERVER_URL"] || /* istanbul ignore next */ "https://github.com"
    );
    return ghUrl.hostname.toUpperCase() !== "GITHUB.COM";
}

export function isExactKeyMatch(key: string, cacheKey?: string): boolean {
    return !!(
        cacheKey &&
        cacheKey.localeCompare(key, undefined, {
            sensitivity: "accent"
        }) === 0
    );
}

export function setCacheState(state: string): void {
    core.saveState(State.CacheMatchedKey, state);
}

export function setCacheHitOutput(isCacheHit: boolean): void {
    core.setOutput(Outputs.CacheHit, isCacheHit.toString());
}

export function setOutputAndState(key: string, cacheKey?: string): void {
    setCacheHitOutput(isExactKeyMatch(key, cacheKey));
    // Store the matched cache key if it exists
    cacheKey && setCacheState(cacheKey);
}

export async function deleteCacheByKey(key: string, owner: string, repo: string) {
    const octokit = new Octokit();
    let response;
    try {
        response = await octokit.rest.actions.deleteActionsCacheByKey({
            owner: owner,
            repo: repo,
            key: key
            });
        if (response.status === 200) {
            core.info(`Succesfully deleted cache with key: ${response.data.actions_caches[0].key}`);
        }
    } catch (e) {
        if (e instanceof RequestError) {
            let err = e as RequestError;
            let errData = err.response?.data as any | undefined;
            exports.logWarning(`${err.name} '${err.status}: ${errData?.message}' trying to delete cache with key: ${key}`);
        }
        response = e;
    }
    return response;
}

export function getCacheState(): string | undefined {
    const cacheKey = core.getState(State.CacheMatchedKey);
    if (cacheKey) {
        core.debug(`Cache state/key: ${cacheKey}`);
        return cacheKey;
    }

    return undefined;
}

export function logWarning(message: string): void {
    const warningPrefix = "[warning]";
    core.info(`${warningPrefix}${message}`);
}

// Cache token authorized for all events that are tied to a ref
// See GitHub Context https://help.github.com/actions/automating-your-workflow-with-github-actions/contexts-and-expression-syntax-for-github-actions#github-context
export function isValidEvent(): boolean {
    return RefKey in process.env && Boolean(process.env[RefKey]);
}

export function getInputAsArray(
    name: string,
    options?: core.InputOptions
): string[] {
    return core
        .getInput(name, options)
        .split("\n")
        .map(s => s.replace(/^!\s+/, "!").trim())
        .filter(x => x !== "");
}

export function getInputAsInt(
    name: string,
    options?: core.InputOptions
): number | undefined {
    const value = parseInt(core.getInput(name, options));
    if (isNaN(value) || value < 0) {
        return undefined;
    }
    return value;
}

export function getInputAsBool(
    name: string,
    options?: core.InputOptions
    ): boolean {
        const value = core.getInput(name, options);
        if (options) {
            const required = (options.required ?? false);
            if (required === true && value == null) {
                throw Error(`Required value undefined for: ${name}`);
            }
        }
    const val : boolean = (value === "true" || parseInt(value) === 1);
    return  val;
}

export function isCacheFeatureAvailable(): boolean {
    if (!cache.isFeatureAvailable()) {
        if (isGhes()) {
            logWarning(
                `Cache action is only supported on GHES version >= 3.5. If you are on version >=3.5 Please check with GHES admin if Actions cache service is enabled or not.
Otherwise please upgrade to GHES version >= 3.5 and If you are also using Github Connect, please unretire the actions/cache namespace before upgrade (see https://docs.github.com/en/enterprise-server@3.5/admin/github-actions/managing-access-to-actions-from-githubcom/enabling-automatic-access-to-githubcom-actions-using-github-connect#automatic-retirement-of-namespaces-for-actions-accessed-on-githubcom)`
            );
        } else {
            logWarning(
                "An internal error has occurred in cache backend. Please check https://www.githubstatus.com/ for any ongoing issue in actions."
            );
        }
        return false;
    }

    return true;
}
