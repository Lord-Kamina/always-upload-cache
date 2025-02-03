import * as cache from "@actions/cache";
import * as core from "@actions/core";

import { Events, Inputs, State } from "./constants";
import { IStateProvider } from "./stateProvider";
import * as utils from "./utils/actionUtils";

// Catch and log any unhandled exceptions.  These exceptions can leak out of the uploadChunk method in
// @actions/toolkit when a failed upload closes the file descriptor causing any in-process reads to
// throw an uncaught exception.  Instead of failing this action, just warn.
process.on("uncaughtException", e => utils.logWarning(e.message));

async function saveImpl(stateProvider: IStateProvider): Promise<number | void> {
    let cacheId = -1;
    try {
        if (!utils.isCacheFeatureAvailable()) {
            return;
        }

        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        // If restore has stored a primary key in state, reuse that
        // Else re-evaluate from inputs
        const primaryKey =
            stateProvider.getState(State.CachePrimaryKey) ||
            core.getInput(Inputs.Key);

        if (!primaryKey) {
            utils.logWarning(`Key is not specified.`);
            return;
        }

        const refreshCache: boolean = utils.getInputAsBool(
            Inputs.RefreshCache,
            { required: false }
        );

        // If matched restore key is same as primary key, either try to refresh the cache, or just notify and do not save.

        let restoredKey = stateProvider.getCacheState();

        if (refreshCache && !restoredKey) {
            // If getCacheState didn't give us a key, we're likely using granular actions. Do a lookup to see if we need to refresh or just do a regular save.
            const cachePaths = utils.getInputAsArray(Inputs.Path, {
                required: true
            });
            const enableCrossOsArchive = utils.getInputAsBool(
                Inputs.EnableCrossOsArchive
            );
            restoredKey = await cache.restoreCache(
                cachePaths,
                primaryKey,
                [],
                { lookupOnly: true },
                enableCrossOsArchive
            );
        }
        if (utils.isExactKeyMatch(primaryKey, restoredKey)) {
            /* istanbul ignore next */
            const { GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env || null;
            if (GITHUB_TOKEN && GITHUB_REPOSITORY && refreshCache === true) {
                core.info(
                    `Cache hit occurred on the primary key ${primaryKey}, attempting to refresh the contents of the cache.`
                );
                const [_owner, _repo] = GITHUB_REPOSITORY.split(`/`);
                if (_owner && _repo) {
                    await utils.deleteCacheByKey(primaryKey, _owner, _repo);
                }
            } else {
                if (refreshCache === true) {
                    utils.logWarning(
                        `Can't refresh cache, either the repository info or a valid token are missing.`
                    );
                    return;
                } else {
                    core.info(
                        `Cache hit occurred on the primary key ${primaryKey}, not saving cache.`
                    );
                    return;
                }
            }
        }

        const cachePaths = utils.getInputAsArray(Inputs.Path, {
            required: true
        });

        const enableCrossOsArchive = utils.getInputAsBool(
            Inputs.EnableCrossOsArchive
        );

        cacheId = await cache.saveCache(
            cachePaths,
            primaryKey,
            { uploadChunkSize: utils.getInputAsInt(Inputs.UploadChunkSize) },
            enableCrossOsArchive
        );

        if (cacheId != -1) {
            core.info(`Cache saved with key: ${primaryKey}`);
        }
    } catch (error: unknown) {
        utils.logWarning((error as Error).message);
    }
    return cacheId;
}

export default saveImpl;
