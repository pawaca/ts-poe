# ts-poe

An implementation of the
[Poe protocol](https://creator.poe.com/docs/poe-protocol-specification) using TypeScript and Express.js.

> This project is a port of the [Python implementation (v0.0.44)](https://github.com/poe-platform/fastapi_poe/releases/tag/0.0.44) of the Poe protocol.

### Write your own bot

This package can also be used as a base to write your own bot. You can inherit from
`PoeBot` to make a bot:

```typescript
import { PoeBot } from 'ts-poe/base';
import { PartialResponse, type QueryRequest } from 'ts-poe/types';
import type { ServerSentEvent } from 'ts-poe/sse';
import { makeApp } from 'ts-poe/express';
import { logger } from 'ts-poe/logger';

class EchoBot extends PoeBot {
	protected async *getResponse(
		request: QueryRequest
	): AsyncIterable<PartialResponse | ServerSentEvent> {
		const lastMessage = request.query[request.query.length - 1].content;
		yield {
			...PartialResponse.defaultValues(),
			text: lastMessage
		};
	}
}

const bot = new EchoBot('/');
const app = makeApp(bot, undefined, { allowWithoutKey: true });
const port = parseInt(process.env.PORT || '9090');
logger.info('Starting server...');
const server = app.listen(port, async () => {
	logger.info(`Server listening on port ${port}`);
});
```

Now, run your bot using `tsx <filename.ts>`.

- In a different terminal, run [ngrok](https://ngrok.com/) to make it publicly
  accessible.
- Use the publicly accessible url to integrate your bot with
  [poe](https://poe.com/create_bot?server=1)

### Enable authentication

Poe servers send requests containing Authorization HTTP header in the format "Bearer
<access_key>"; the access key is configured in the bot settings page.

To validate that the request is from the Poe servers, you can either set the environment
variable POE_ACCESS_KEY or pass the parameter access_key in the makeApp function like:

```typescript
makeApp(bot, <key>);
```

## Samples

Check out starter code in [examples folder](https://github.com/pawaca/ts-poe/examples) for some examples
you can use to get started with bot development.
