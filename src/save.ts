import * as cache from "@actions/cache";
import * as core from "@actions/core";

import { Events, Inputs, State } from "./constants";
import * as utils from "./utils/actionUtils";

// Catch and log any unhandled exceptions.  These exceptions can leak out of the uploadChunk method in
// @actions/toolkit when a failed upload closes the file descriptor causing any in-process reads to
// throw an uncaught exception.  Instead of failing this action, just warn.
process.on("uncaughtException", e => utils.logWarning(e.message));

async function run(): Promise<void> {
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

        const state = utils.getCacheState();

        // Inputs are re-evaluted before the post action, so we want the original key used for restore
        const primaryKey = core.getState(State.CachePrimaryKey);
        if (!primaryKey) {
            utils.logWarning(`Error retrieving key from state.`);
            return;
        }
        const refreshCache: boolean = utils.getInputAsBool(
            Inputs.RefreshCache,
            { required: false }
        );

        if (utils.isExactKeyMatch(primaryKey, state)) {
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
                        `Can't refresh cache, repository info or a valid token are missing.`
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

        const cacheId = await cache.saveCache(cachePaths, primaryKey, {
            uploadChunkSize: utils.getInputAsInt(Inputs.UploadChunkSize)
        });

        if (cacheId != -1) {
            core.info(`Cache saved with key: ${primaryKey}`);
        }
    } catch (error: unknown) {
        utils.logWarning((error as Error).message);
    }
}

run();

export default run;
