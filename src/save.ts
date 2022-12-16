import * as cache from "@actions/cache";
import * as core from "@actions/core";

import { Events, Inputs, State } from "./constants";
import * as utils from "./utils/actionUtils";

const { Octokit } = require("@octokit/action");

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

        if (utils.isExactKeyMatch(primaryKey, state)) {
            const { GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env || null
            core.debug(`GITHUB_TOKEN: ${GITHUB_TOKEN}, GITHUB_REPOSITORY: ${GITHUB_REPOSITORY}`)
            if(GITHUB_TOKEN && GITHUB_REPOSITORY) {
                core.info(
                    `Cache hit occurred on the primary key ${primaryKey}, we'll try deleting the cache key, in order to update it.`
                );
                const octokit = new Octokit();
                const [owner, repo] = GITHUB_REPOSITORY.split("/");

                try {
                    await octokit.rest.actions.deleteActionsCacheByKey({
                    owner: owner,
                    repo: repo,
                    key: primaryKey
                    });
                } catch (error) {
                    let message
					if (error instanceof Error) message = error.message
					else message = String(error)
                    console.warn(`Unable to delete cache key: ${primaryKey}. ERROR: ${message}`)
                }
            }
            else {
                core.info(
                    `Cache hit occurred on the primary key ${primaryKey}, not saving cache.`
                );
                return;
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
