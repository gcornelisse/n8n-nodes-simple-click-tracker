import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type RequestContext = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

const CREDENTIAL_NAME = 'simpleClickTrackerApi';

/** Calls the Simple Click Tracker n8n API and shows the server's plain-language error message when it fails. */
export async function apiRequest(
	this: RequestContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<unknown> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = String(credentials.apiBase).trim().replace(/\/+$/, '');
	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, {
			method,
			url: `${baseUrl}/n8n${path}`,
			body,
			qs,
			json: true,
		});
	} catch (error) {
		const message: unknown =
			error?.response?.data?.error?.message ?? error?.cause?.response?.data?.error?.message;
		throw new NodeApiError(
			this.getNode(),
			error as JsonObject,
			typeof message === 'string' ? { message } : {},
		);
	}
}

/** One page of the "Link" list, newest first. An empty search shows everything; a search filters the page. */
export async function searchLinks(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const page = paginationToken ? Number(paginationToken) : 1;
	const choice_list = (await apiRequest.call(this, 'GET', '/link-choices', undefined, {
		page,
	})) as Array<{ id: number; name: string }>;
	const wanted = (filter ?? '').toLowerCase();

	return {
		results: choice_list
			.filter((choice) => wanted === '' || choice.name.toLowerCase().includes(wanted))
			.map((choice) => ({ name: choice.name, value: choice.id })),
		paginationToken: choice_list.length > 0 ? String(page + 1) : undefined,
	};
}

async function choices(this: ILoadOptionsFunctions, path: string): Promise<INodePropertyOptions[]> {
	const choice_list = (await apiRequest.call(this, 'GET', path)) as Array<{
		id: number;
		name: string;
	}>;

	return choice_list.map((choice) => ({ name: choice.name, value: choice.id }));
}

export async function getDomains(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await choices.call(this, '/domains');
}

export async function getGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await choices.call(this, '/groups');
}
