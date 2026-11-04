import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { apiRequest, searchLinks } from './GenericFunctions';

export class SimpleClickTrackerTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Simple Click Tracker Trigger',
		name: 'simpleClickTrackerTrigger',
		icon: { light: 'file:simpleClickTracker.svg', dark: 'file:simpleClickTracker.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts a workflow when something happens to your Simple Click Tracker links',
		defaults: { name: 'Simple Click Tracker Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'simpleClickTrackerApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				default: 'link.broken',
				options: [
					{
						name: 'Broken Link Found',
						value: 'link.broken',
						description: "A link's destination failed its daily check two days in a row",
					},
					{
						name: 'Click Milestone Reached',
						value: 'click.milestone',
						description: 'A link first reached the click count you set',
					},
					{
						name: 'Link Working Again',
						value: 'link.recovered',
						description: 'A destination that was broken passed a later check',
					},
					{
						name: 'Split-Test Winner Picked',
						value: 'split.winner',
						description: 'A split test has a winner',
					},
				],
			},
			{
				displayName: 'Milestone',
				name: 'milestoneClicks',
				type: 'number',
				required: true,
				default: 1000,
				typeOptions: { minValue: 1 },
				displayOptions: { show: { event: ['click.milestone'] } },
				description:
					'Fire when a link reaches this many clicks. Links already past this number when the workflow turns on are skipped.',
			},
			{
				displayName: 'Click Type',
				name: 'clickType',
				type: 'options',
				default: 'total',
				options: [
					{ name: 'Total Clicks', value: 'total' },
					{ name: 'Unique Clicks', value: 'unique' },
				],
				displayOptions: { show: { event: ['click.milestone'] } },
			},
			{
				displayName: 'Link',
				name: 'link',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				description: 'Leave empty to watch every link, or pick one link to watch',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'searchLinks', searchable: true },
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						placeholder: '123',
					},
				],
			},
		],
	};

	methods = {
		listSearch: { searchLinks },
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (webhookData.webhookId === undefined) {
					return false;
				}
				try {
					const hook = (await apiRequest.call(
						this,
						'GET',
						`/hooks/${webhookData.webhookId}`,
					)) as IDataObject;
					return hook.target_url === this.getNodeWebhookUrl('default');
				} catch (error) {
					// Gone, or turned off in Simple Click Tracker: subscribe again. Subscribing replaces any old row for this address.
					this.logger.debug(`Simple Click Tracker subscription check failed: ${error.message}`);
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const event = this.getNodeParameter('event') as string;
				const body: IDataObject = {
					event,
					target_url: this.getNodeWebhookUrl('default'),
					options: {
						link_id: this.getNodeParameter('link', '', { extractValue: true }) || null,
						milestone_clicks:
							event === 'click.milestone' ? this.getNodeParameter('milestoneClicks') : null,
						click_type: event === 'click.milestone' ? this.getNodeParameter('clickType') : null,
					},
					// A test run waits for a webhook, and real events can be days apart.
					send_sample: this.getMode() === 'manual',
				};
				const response = (await apiRequest.call(this, 'POST', '/hooks', body)) as IDataObject;
				this.getWorkflowStaticData('node').webhookId = response.id;

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (webhookData.webhookId !== undefined) {
					try {
						await apiRequest.call(this, 'DELETE', `/hooks/${webhookData.webhookId}`);
					} catch (error) {
						if (error.httpCode !== '404') {
							return false;
						}
					}
					delete webhookData.webhookId;
				}

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		return {
			workflowData: [this.helpers.returnJsonArray(this.getBodyData())],
		};
	}
}
