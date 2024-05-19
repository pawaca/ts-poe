import { PoeBot } from 'ts-poe/base';
import type { ServerSentEvent } from 'ts-poe/sse';
import { PartialResponse } from 'ts-poe/types';

const IMAGE_URL =
	'https://images.pexels.com/photos/46254/leopard-wildcat-big-cat-botswana-46254.jpeg';

export class SampleImageResponseBot extends PoeBot {
	protected async *getResponse(): AsyncIterable<PartialResponse | ServerSentEvent> {
		yield {
			...PartialResponse.defaultValues(),
			text: `This is a test image. ![leopard](${IMAGE_URL})`
		};
	}
}
