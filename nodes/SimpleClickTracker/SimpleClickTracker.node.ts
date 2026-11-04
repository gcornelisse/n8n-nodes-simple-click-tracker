import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { apiRequest, getDomains, getGroups, searchLinks } from './GenericFunctions';

export class SimpleClickTracker implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Simple Click Tracker',
		name: 'simpleClickTracker',
		icon: { light: 'file:simpleClickTracker.svg', dark: 'file:simpleClickTracker.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Create, update and find short links in Simple Click Tracker',
		defaults: { name: 'Simple Click Tracker' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'simpleClickTrackerApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'create',
				options: [
					{
						name: 'Create Link',
						value: 'create',
						action: 'Create a link',
						description: 'Create a standard short link',
					},
					{
						name: 'Find Link',
						value: 'find',
						action: 'Find links',
						description: 'Find links by exact path, part of the name, or both',
					},
					{
						name: 'Update Link Destination',
						value: 'updateDestination',
						action: 'Update a link destination',
						description: 'Change where a standard link sends visitors',
					},
				],
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { operation: ['create'] } },
				description: 'A name that helps you recognize the link',
			},
			{
				displayName: 'Link',
				name: 'link',
				type: 'resourceLocator',
				required: true,
				default: { mode: 'list', value: '' },
				displayOptions: { show: { operation: ['updateDestination'] } },
				description: 'The standard link to change. Split tests and rotators must be edited in Simple Click Tracker.',
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
			{
				displayName: 'Destination URL',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://example.com/offer',
				displayOptions: { show: { operation: ['create', 'updateDestination'] } },
				description: 'Where the link sends visitors',
			},
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['create'] } },
				description: 'The part after the domain. Leave empty to generate one.',
			},
			{
				displayName: 'Path',
				name: 'findPath',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['find'] } },
				description: 'The exact path to find. Fill in this field, Name Contains, or both.',
			},
			{
				displayName: 'Name Contains',
				name: 'findName',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['find'] } },
				description: 'Part of the link name. Fill in this field, Path, or both.',
			},
			{
				displayName: 'Domain Name or ID',
				name: 'domainId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDomains' },
				default: '',
				displayOptions: { show: { operation: ['create', 'find'] } },
				description:
					'Required to create a link when your account has more than one domain. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Group Name or ID',
				name: 'groupId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getGroups' },
				default: '',
				displayOptions: { show: { operation: ['create'] } },
				description:
					'The group to add the link to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	};

	methods = {
		listSearch: { searchLinks },
		loadOptions: { getDomains, getGroups },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const item_list = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < item_list.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				let result: IDataObject | IDataObject[];

				if (operation === 'create') {
					result = (await apiRequest.call(this, 'POST', '/links', {
						name: this.getNodeParameter('name', i),
						url: this.getNodeParameter('url', i),
						path: this.getNodeParameter('path', i, ''),
						domain_id: this.getNodeParameter('domainId', i, '') || null,
						group_id: this.getNodeParameter('groupId', i, '') || null,
					})) as IDataObject;
				} else if (operation === 'updateDestination') {
					const linkId = this.getNodeParameter('link', i, '', { extractValue: true }) as string;
					result = (await apiRequest.call(
						this,
						'PATCH',
						`/links/${encodeURIComponent(linkId)}/destination`,
						{ url: this.getNodeParameter('url', i) },
					)) as IDataObject;
				} else {
					result = (await apiRequest.call(this, 'GET', '/links', undefined, {
						path: this.getNodeParameter('findPath', i, ''),
						name: this.getNodeParameter('findName', i, ''),
						domain_id: this.getNodeParameter('domainId', i, ''),
					})) as IDataObject[];
				}

				returnData.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
						itemData: { item: i },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
