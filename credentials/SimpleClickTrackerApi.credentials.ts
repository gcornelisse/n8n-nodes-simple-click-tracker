import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class SimpleClickTrackerApi implements ICredentialType {
	name = 'simpleClickTrackerApi';

	displayName = 'Simple Click Tracker API';

	icon: Icon = {
		light: 'file:../nodes/SimpleClickTracker/simpleClickTracker.svg',
		dark: 'file:../nodes/SimpleClickTracker/simpleClickTracker.svg',
	};

	documentationUrl = 'https://app.simpleclicktracker.com/help/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'An n8n key from the Integrations page in Simple Click Tracker. It starts with n8n_.',
		},
		{
			displayName: 'API Base URL',
			name: 'apiBase',
			type: 'string',
			default: 'https://app.simpleclicktracker.com/api/v1',
			description: 'Leave this as it is unless support asks you to change it',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.apiBase}}',
			url: '/n8n/me',
		},
	};
}
