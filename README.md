# n8n-nodes-simple-click-tracker

[n8n](https://n8n.io) community nodes for [Simple Click Tracker](https://simpleclicktracker.com). Start a workflow when something happens to your links, and create, update or find links from a workflow.

## Installation

In n8n, open **Settings > Community Nodes > Install** and enter `n8n-nodes-simple-click-tracker`. See n8n's [community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

1. In Simple Click Tracker, open **Integrations** and click **Create n8n Key**. Your plan needs to include integrations.
2. In n8n, create a **Simple Click Tracker API** credential and paste the key.

## Trigger node

| Event | Starts the workflow when |
|---|---|
| Broken Link Found | A link's destination failed its daily check two days in a row |
| Link Working Again | A destination that was broken passed a later check |
| Split-Test Winner Picked | A split test has a winner |
| Click Milestone Reached | A link first reached the click count you set |

Triggers need an n8n address that Simple Click Tracker can reach: a public `https://` address. On a self-hosted instance, set it in `WEBHOOK_URL`. The action node works without one.

When you test the trigger, Simple Click Tracker sends a sample event within about a minute. Sample events have `is_test: true`.

## Action node

- **Create Link**: makes a standard short link and returns its short URL.
- **Update Link Destination**: changes where a standard link sends visitors.
- **Find Link**: finds links by exact path, part of the name, or both.

## Help

Full guide: [Simple Click Tracker help: n8n](https://app.simpleclicktracker.com/help/n8n).

## License

[MIT](LICENSE.md)
