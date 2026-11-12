// Runs the built nodes against a stand-in for n8n's node context. Run with: npm run build && npm test
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { SimpleClickTracker } = require('../dist/nodes/SimpleClickTracker/SimpleClickTracker.node.js');
const { SimpleClickTrackerTrigger } = require('../dist/nodes/SimpleClickTracker/SimpleClickTrackerTrigger.node.js');

const WEBHOOK = 'https://n8n.example.com/webhook/abc/webhook';

function context({ params = {}, mode = 'trigger', staticData = {}, respond = () => ({}) } = {}) {
	const call_list = [];
	return {
		call_list,
		staticData,
		getCredentials: async () => ({ apiBase: 'https://sct.test/api/v1/' }),
		getNode: () => ({ name: 'SCT', type: 'simpleClickTracker', typeVersion: 1 }),
		getNodeParameter: (name, _second, third) => params[name] ?? third ?? '',
		getNodeWebhookUrl: () => WEBHOOK,
		getWorkflowStaticData: () => staticData,
		getMode: () => mode,
		getInputData: () => [{ json: {} }],
		continueOnFail: () => false,
		logger: { debug() {} },
		helpers: {
			httpRequestWithAuthentication: async (credential, options) => {
				call_list.push({ credential, ...options });
				return respond(options);
			},
			returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
			constructExecutionMetaData: (item_list) => item_list,
		},
	};
}

const hooks = new SimpleClickTrackerTrigger().webhookMethods.default;

test('activating subscribes the webhook address and remembers the id', async () => {
	const ctx = context({ params: { event: 'link.broken', link: '' }, respond: () => ({ id: 42 }) });
	assert.equal(await hooks.create.call(ctx), true);
	const [call] = ctx.call_list;
	assert.equal(call.credential, 'simpleClickTrackerApi');
	assert.equal(call.method, 'POST');
	assert.equal(call.url, 'https://sct.test/api/v1/n8n/hooks');
	assert.equal(call.body.target_url, WEBHOOK);
	assert.equal(call.body.send_sample, false);
	assert.equal(call.body.options.link_id, null);
	assert.equal(ctx.staticData.webhookId, 42);
});

test('a test run asks for a sample event', async () => {
	const ctx = context({ params: { event: 'link.broken' }, mode: 'manual', respond: () => ({ id: 1 }) });
	await hooks.create.call(ctx);
	assert.equal(ctx.call_list[0].body.send_sample, true);
});

test('milestone settings are sent only for the milestone event', async () => {
	const ctx = context({
		params: { event: 'click.milestone', milestoneClicks: 500, clickType: 'unique', link: 9 },
		respond: () => ({ id: 1 }),
	});
	await hooks.create.call(ctx);
	assert.deepEqual(ctx.call_list[0].body.options, { link_id: 9, milestone_clicks: 500, click_type: 'unique' });
});

test('checkExists needs a stored id, a live subscription and the same address', async () => {
	assert.equal(await hooks.checkExists.call(context()), false);
	const same = context({ staticData: { webhookId: 5 }, respond: () => ({ target_url: WEBHOOK }) });
	assert.equal(await hooks.checkExists.call(same), true);
	assert.equal(same.call_list[0].url, 'https://sct.test/api/v1/n8n/hooks/5');
	const moved = context({ staticData: { webhookId: 5 }, respond: () => ({ target_url: 'https://other.test/x' }) });
	assert.equal(await hooks.checkExists.call(moved), false);
	const gone = context({
		staticData: { webhookId: 5 },
		respond: () => {
			throw Object.assign(new Error('Not found'), { httpCode: '404' });
		},
	});
	assert.equal(await hooks.checkExists.call(gone), false);
});

test('deleting clears the id, and treats an already gone subscription as success', async () => {
	const ok = context({ staticData: { webhookId: 5 } });
	assert.equal(await hooks.delete.call(ok), true);
	assert.equal(ok.call_list[0].method, 'DELETE');
	assert.equal(ok.staticData.webhookId, undefined);

	const gone = context({
		staticData: { webhookId: 5 },
		respond: () => {
			throw Object.assign(new Error('Not found'), { response: { status: 404 }, httpCode: '404' });
		},
	});
	assert.equal(await hooks.delete.call(gone), true);
	assert.equal(gone.staticData.webhookId, undefined);

	const down = context({
		staticData: { webhookId: 5 },
		respond: () => {
			throw Object.assign(new Error('Down'), { response: { status: 503 }, httpCode: '503' });
		},
	});
	assert.equal(await hooks.delete.call(down), false);
	assert.equal(down.staticData.webhookId, 5);
});

test('the webhook passes the event body on as one item', async () => {
	const body = { id: 7, event: 'link.broken', link: { id: 1 } };
	const result = await new SimpleClickTrackerTrigger().webhook.call({
		getBodyData: () => body,
		helpers: { returnJsonArray: (data) => [{ json: data }] },
	});
	assert.deepEqual(result.workflowData, [[{ json: body }]]);
});

async function run(params, respond) {
	const ctx = context({ params, respond });
	const output = await new SimpleClickTracker().execute.call(ctx);
	return { ctx, output };
}

test('create link sends null for an empty domain and group', async () => {
	const { ctx, output } = await run(
		{ operation: 'create', name: 'Sale', url: 'https://example.com', path: '' },
		() => ({ id: 3, short_url: 'https://go.test/x' }),
	);
	const [call] = ctx.call_list;
	assert.equal(call.url, 'https://sct.test/api/v1/n8n/links');
	assert.equal(call.body.domain_id, null);
	assert.equal(call.body.group_id, null);
	assert.equal(output[0][0].json.short_url, 'https://go.test/x');
});

test('update destination patches the chosen link', async () => {
	const { ctx } = await run(
		{ operation: 'updateDestination', link: 12, url: 'https://example.com/new' },
		() => ({ id: 12 }),
	);
	assert.equal(ctx.call_list[0].method, 'PATCH');
	assert.equal(ctx.call_list[0].url, 'https://sct.test/api/v1/n8n/links/12/destination');
	assert.deepEqual(ctx.call_list[0].body, { url: 'https://example.com/new' });
});

test('find returns one item per link', async () => {
	const { ctx, output } = await run({ operation: 'find', findPath: 'spring' }, () => [{ id: 1 }, { id: 2 }]);
	assert.equal(ctx.call_list[0].qs.path, 'spring');
	assert.equal(output[0].length, 2);
});

test('simplify keeps the main link fields, and full output is the default', async () => {
	const simplify = new SimpleClickTracker().description.properties.find((property) => property.name === 'simplify');
	assert.equal(simplify?.type, 'boolean');
	assert.equal(simplify?.default, false);

	const link = {
		id: 1,
		name: 'Sale',
		type: 'standard',
		url: 'https://example.com',
		path: 'sale',
		domain_id: 2,
		domain: 'go.test',
		group_id: 3,
		short_url: 'https://go.test/sale',
		is_archived: false,
		total_clicks: 10,
		unique_clicks: 8,
	};
	const full = await run({ operation: 'find', findPath: 'sale' }, () => [link]);
	assert.deepEqual(full.output[0][0].json, link);

	const simple = await run({ operation: 'find', findPath: 'sale', simplify: true }, () => [link]);
	assert.deepEqual(simple.output[0][0].json, {
		id: 1,
		name: 'Sale',
		type: 'standard',
		url: 'https://example.com',
		path: 'sale',
		short_url: 'https://go.test/sale',
		total_clicks: 10,
		unique_clicks: 8,
	});
});

test("the server's plain-language error reaches the user", async () => {
	const failure = Object.assign(new Error('Request failed with status code 422'), {
		response: { status: 422, data: { error: { message: "You've reached your plan's link limit." } } },
	});
	await assert.rejects(
		run({ operation: 'create', name: 'Sale', url: 'https://example.com' }, () => {
			throw failure;
		}),
		/reached your plan's link limit/,
	);
});
