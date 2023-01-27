import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { RequestError } from "@octokit/request-error";
import nock from "nock";

import { Events, Outputs, RefKey, State } from "../src/constants";
import * as actionUtils from "../src/utils/actionUtils";
import * as testUtils from "../src/utils/testUtils";

jest.mock("@actions/core");
jest.mock("@actions/cache");

beforeAll(() => {
    nock.disableNetConnect();
    jest.spyOn(core, "getInput").mockImplementation((name, options) => {
        return jest.requireActual("@actions/core").getInput(name, options);
    });
    testUtils.mockServer.listen({
        onUnhandledRequest: "warn"
    });
});

afterEach(() => {
    delete process.env[Events.Key];
    delete process.env[RefKey];
    delete process.env["GITHUB_REPOSITORY"];
    delete process.env["GITHUB_TOKEN"];
    delete process.env["GITHUB_ACTION"];
});

afterAll(() => {
    testUtils.mockServer.close();
    nock.enableNetConnect();
});

test("isGhes returns true if server url is not github.com", () => {
    try {
        process.env["GITHUB_SERVER_URL"] = "http://example.com";
        expect(actionUtils.isGhes()).toBe(true);
    } finally {
        process.env["GITHUB_SERVER_URL"] = undefined;
    }
});

test("isGhes returns false when server url is github.com", () => {
    try {
        process.env["GITHUB_SERVER_URL"] = "http://github.com";
        expect(actionUtils.isGhes()).toBe(false);
    } finally {
        process.env["GITHUB_SERVER_URL"] = undefined;
    }
});

test("isExactKeyMatch with undefined cache key returns false", () => {
    const key = "linux-rust";
    const cacheKey = undefined;

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(false);
});

test("isExactKeyMatch with empty cache key returns false", () => {
    const key = "linux-rust";
    const cacheKey = "";

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(false);
});

test("isExactKeyMatch with different keys returns false", () => {
    const key = "linux-rust";
    const cacheKey = "linux-";

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(false);
});

test("isExactKeyMatch with different key accents returns false", () => {
    const key = "linux-áccent";
    const cacheKey = "linux-accent";

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(false);
});

test("isExactKeyMatch with same key returns true", () => {
    const key = "linux-rust";
    const cacheKey = "linux-rust";

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(true);
});

test("isExactKeyMatch with same key and different casing returns true", () => {
    const key = "linux-rust";
    const cacheKey = "LINUX-RUST";

    expect(actionUtils.isExactKeyMatch(key, cacheKey)).toBe(true);
});

test("setOutputAndState with undefined entry to set cache-hit output", () => {
    const key = "linux-rust";
    const cacheKey = undefined;

    const setOutputMock = jest.spyOn(core, "setOutput");
    const saveStateMock = jest.spyOn(core, "saveState");

    actionUtils.setOutputAndState(key, cacheKey);

    expect(setOutputMock).toHaveBeenCalledWith(Outputs.CacheHit, "false");
    expect(setOutputMock).toHaveBeenCalledTimes(1);

    expect(saveStateMock).toHaveBeenCalledTimes(0);
});

test("setOutputAndState with exact match to set cache-hit output and state", () => {
    const key = "linux-rust";
    const cacheKey = "linux-rust";

    const setOutputMock = jest.spyOn(core, "setOutput");
    const saveStateMock = jest.spyOn(core, "saveState");

    actionUtils.setOutputAndState(key, cacheKey);

    expect(setOutputMock).toHaveBeenCalledWith(Outputs.CacheHit, "true");
    expect(setOutputMock).toHaveBeenCalledTimes(1);

    expect(saveStateMock).toHaveBeenCalledWith(State.CacheMatchedKey, cacheKey);
    expect(saveStateMock).toHaveBeenCalledTimes(1);
});

test("setOutputAndState with no exact match to set cache-hit output and state", () => {
    const key = "linux-rust";
    const cacheKey = "linux-rust-bb828da54c148048dd17899ba9fda624811cfb43";

    const setOutputMock = jest.spyOn(core, "setOutput");
    const saveStateMock = jest.spyOn(core, "saveState");

    actionUtils.setOutputAndState(key, cacheKey);

    expect(setOutputMock).toHaveBeenCalledWith(Outputs.CacheHit, "false");
    expect(setOutputMock).toHaveBeenCalledTimes(1);

    expect(saveStateMock).toHaveBeenCalledWith(State.CacheMatchedKey, cacheKey);
    expect(saveStateMock).toHaveBeenCalledTimes(1);
});

test("getCacheState with no state returns undefined", () => {
    const getStateMock = jest.spyOn(core, "getState");
    getStateMock.mockImplementation(() => {
        return "";
    });

    const state = actionUtils.getCacheState();

    expect(state).toBe(undefined);

    expect(getStateMock).toHaveBeenCalledWith(State.CacheMatchedKey);
    expect(getStateMock).toHaveBeenCalledTimes(1);
});

test("getCacheState with valid state", () => {
    const cacheKey = testUtils.successCacheKey;

    const getStateMock = jest.spyOn(core, "getState");
    getStateMock.mockImplementation(() => {
        return cacheKey;
    });

    const state = actionUtils.getCacheState();

    expect(state).toEqual(cacheKey);

    expect(getStateMock).toHaveBeenCalledWith(State.CacheMatchedKey);
    expect(getStateMock).toHaveBeenCalledTimes(1);
});

test("logWarning logs a message with a warning prefix", () => {
    const message = "A warning occurred.";

    const infoMock = jest.spyOn(core, "info");

    actionUtils.logWarning(message);

    expect(infoMock).toHaveBeenCalledWith(`[warning]${message}`);
});

test("isValidEvent returns false for event that does not have a branch or tag", () => {
    const event = "foo";
    process.env[Events.Key] = event;

    const isValidEvent = actionUtils.isValidEvent();

    expect(isValidEvent).toBe(false);
});

test("isValidEvent returns true for event that has a ref", () => {
    const event = Events.Push;
    process.env[Events.Key] = event;
    process.env[RefKey] = "ref/heads/feature";

    const isValidEvent = actionUtils.isValidEvent();

    expect(isValidEvent).toBe(true);
});

test("getInputAsArray returns empty array if not required and missing", () => {
    expect(actionUtils.getInputAsArray("foo")).toEqual([]);
});

test("getInputAsArray throws error if required and missing", () => {
    expect(() =>
        actionUtils.getInputAsArray("foo", { required: true })
    ).toThrowError();
});

test("getInputAsArray handles single line correctly", () => {
    testUtils.setInput("foo", "bar");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar"]);
});

test("getInputAsArray handles multiple lines correctly", () => {
    testUtils.setInput("foo", "bar\nbaz");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar", "baz"]);
});

test("getInputAsArray handles different new lines correctly", () => {
    testUtils.setInput("foo", "bar\r\nbaz");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar", "baz"]);
});

test("getInputAsArray handles empty lines correctly", () => {
    testUtils.setInput("foo", "\n\nbar\n\nbaz\n\n");
    expect(actionUtils.getInputAsArray("foo")).toEqual(["bar", "baz"]);
});

test("getInputAsArray removes spaces after ! at the beginning", () => {
    testUtils.setInput(
        "foo",
        "!   bar\n!  baz\n! qux\n!quux\ncorge\ngrault! garply\n!\r\t waldo"
    );
    expect(actionUtils.getInputAsArray("foo")).toEqual([
        "!bar",
        "!baz",
        "!qux",
        "!quux",
        "corge",
        "grault! garply",
        "!waldo"
    ]);
});

test("getInputAsInt returns undefined if input not set", () => {
    expect(actionUtils.getInputAsInt("undefined")).toBeUndefined();
});

test("getInputAsInt returns value if input is valid", () => {
    testUtils.setInput("foo", "8");
    expect(actionUtils.getInputAsInt("foo")).toBe(8);
});

test("getInputAsInt returns undefined if input is invalid or NaN", () => {
    testUtils.setInput("foo", "bar");
    expect(actionUtils.getInputAsInt("foo")).toBeUndefined();
});

test("getInputAsInt throws if required and value missing", () => {
    expect(() =>
        actionUtils.getInputAsInt("undefined", { required: true })
    ).toThrowError();
});

test("getInputAsBool returns false if input not set", () => {
    expect(actionUtils.getInputAsBool("foo", { required: false })).toBe(false);
});

test("getInputAsBool returns true if value is '1'", () => {
    testUtils.setInput("foo", "1");
    expect(actionUtils.getInputAsBool("foo")).toBe(true);
});

test("getInputAsBool returns true if value is true", () => {
    testUtils.setInput("foo", "true");
    expect(actionUtils.getInputAsBool("foo")).toBe(true);
});

test("getInputAsBool returns false if value is '0'", () => {
    testUtils.setInput("foo", "0");
    expect(actionUtils.getInputAsBool("foo")).toBe(false);
});

test("getInputAsBool returns false if value is 'false'", () => {
    testUtils.setInput("foo", "false");
    expect(actionUtils.getInputAsBool("foo")).toBe(false);
});

test("getInputAsBool doesn't throw when input is required but there is a value.'", () => {
    testUtils.setInput("foo", "true");
    expect(() =>
        actionUtils.getInputAsBool("foo", { required: true })
    ).not.toThrowError();
    expect(actionUtils.getInputAsBool("foo", { required:true})).toBe(true);
});

test("getInputAsBool returns false if value is something else", () => {
    testUtils.setInput("foo", "bar");
    expect(actionUtils.getInputAsBool("foo")).toBe(false);
});

test("getInputAsBool throws if required and value missing", () => {
    expect(() =>
        actionUtils.getInputAsBool("FART", { required: true })
    ).toThrowError();
});

test("getInputAsBool throws if required and value missing", () => {
    testUtils.setInput("BADFART", "");
    expect(() =>
        actionUtils.getInputAsBool("BADFART", { required: true })
    ).toThrowError();
});

test("deleteCacheByKey returns 'HttpError: 404' when cache is not found.", async () => {
    const event = Events.Push;

    process.env["GITHUB_REPOSITORY"] = "owner/repo";
    process.env["GITHUB_TOKEN"] =
        "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";
    process.env["GITHUB_ACTION"] = "__owner___run-repo";
    process.env[Events.Key] = event;
    process.env[RefKey] = "ref/heads/feature";
    const logWarningMock = jest.spyOn(actionUtils, "logWarning");
    const response = await actionUtils.deleteCacheByKey(
        testUtils.failureCacheKey,
        "owner",
        "repo"
    );
    expect(logWarningMock).toHaveBeenCalledWith(
        expect.stringMatching(/404: Not Found/i)
    );
    expect(response).toBeInstanceOf(RequestError);
    expect(response).toMatchObject({
        name: "HttpError",
        status: 404
    });
});

test("deleteCacheByKey returns 'HttpError: 401' on an invalid non-mocked request.", async () => {
    const event = Events.Push;

    process.env["GITHUB_REPOSITORY"] = "owner/repo";
    process.env["GITHUB_TOKEN"] =
        "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";
    process.env["GITHUB_ACTION"] = "__owner___run-repo";
    process.env[Events.Key] = event;
    process.env[RefKey] = "ref/heads/feature";
    await nock.enableNetConnect();
    const logWarningMock = jest.spyOn(actionUtils, "logWarning");
    const response = await actionUtils.deleteCacheByKey(
        testUtils.passThroughCacheKey,
        "owner",
        "repo"
    );
    expect(logWarningMock).toHaveBeenCalledWith(
        expect.stringMatching(/401: Bad Credentials/i)
    );
    expect(response).toBeInstanceOf(RequestError);
    expect(response).toMatchObject({
        name: "HttpError",
        status: 401
    });
    nock.disableNetConnect();
});

test("deleteCacheByKey returns matched cache data when successful.", async () => {
    const event = Events.Push;

    process.env["GITHUB_REPOSITORY"] = "owner/repo";
    process.env["GITHUB_TOKEN"] =
        "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";
    process.env["GITHUB_ACTION"] = "__owner___run-repo";
    process.env[Events.Key] = event;
    process.env[RefKey] = "ref/heads/feature";

    const expectedResponse = {
        id: expect.any(Number),
        ref: expect.any(String),
        key: expect.any(String),
        version: expect.any(String),
        last_accessed_at: expect.any(String),
        created_at: expect.any(String),
        size_in_bytes: expect.any(Number)
    };
    const logWarningMock = jest.spyOn(actionUtils, "logWarning");
    const response = await actionUtils.deleteCacheByKey(
        testUtils.successCacheKey,
        "owner",
        "repo"
    );
    expect(response).toMatchObject({
        data: expect.objectContaining({
            total_count: expect.any(Number),
            actions_caches: expect.arrayContaining([
                expect.objectContaining(expectedResponse)
            ])
        })
    });
    expect(logWarningMock).toHaveBeenCalledTimes(0);
});

test("isCacheFeatureAvailable for ac enabled", () => {
    jest.spyOn(cache, "isFeatureAvailable").mockImplementation(() => true);

    expect(actionUtils.isCacheFeatureAvailable()).toBe(true);
});

test("isCacheFeatureAvailable for ac disabled on GHES", () => {
    jest.spyOn(cache, "isFeatureAvailable").mockImplementation(() => false);

    const message = `Cache action is only supported on GHES version >= 3.5. If you are on version >=3.5 Please check with GHES admin if Actions cache service is enabled or not.
Otherwise please upgrade to GHES version >= 3.5 and If you are also using Github Connect, please unretire the actions/cache namespace before upgrade (see https://docs.github.com/en/enterprise-server@3.5/admin/github-actions/managing-access-to-actions-from-githubcom/enabling-automatic-access-to-githubcom-actions-using-github-connect#automatic-retirement-of-namespaces-for-actions-accessed-on-githubcom)`;
    const infoMock = jest.spyOn(core, "info");

    try {
        process.env["GITHUB_SERVER_URL"] = "http://example.com";
        expect(actionUtils.isCacheFeatureAvailable()).toBe(false);
        expect(infoMock).toHaveBeenCalledWith(`[warning]${message}`);
    } finally {
        delete process.env["GITHUB_SERVER_URL"];
    }
});

test("isCacheFeatureAvailable for ac disabled on dotcom", () => {
    jest.spyOn(cache, "isFeatureAvailable").mockImplementation(() => false);

    const message =
        "An internal error has occurred in cache backend. Please check https://www.githubstatus.com/ for any ongoing issue in actions.";
    const infoMock = jest.spyOn(core, "info");

    try {
        process.env["GITHUB_SERVER_URL"] = "http://github.com";
        expect(actionUtils.isCacheFeatureAvailable()).toBe(false);
        expect(infoMock).toHaveBeenCalledWith(`[warning]${message}`);
    } finally {
        delete process.env["GITHUB_SERVER_URL"];
    }
});
