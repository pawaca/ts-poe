/**
 * This module contains a collection of string templates designed to streamline the integration
 * of features like attachments into the LLM request.
 */

export function textAttachmentTemplate(
	attachmentName: string,
	attachmentParsedContent: string
): string {
	return `Your response must be in the language of the relevant queries related to the document.
Below is the content of ${attachmentName}:\n\n${attachmentParsedContent}`;
}

export function urlAttachmentTemplate(attachmentName: string, content: string): string {
	return `Assume you can access the external URL ${attachmentName}. Your response must be in the language of the relevant queries related to the URL.
Use the URL's content below to respond to the queries:\n\n${content}`;
}

export function imageVisionAttachmentTemplate(
	filename: string,
	parsedImageDescription: string
): string {
	return `I have uploaded an image (${filename}). Assume that you can see the attached image. First, read the image analysis:\n\n<image_analysis>${parsedImageDescription}</image_analysis>\n\nUse any relevant parts to inform your response. Do NOT reference the image analysis in your response. Respond in the same language as my next message.`;
}
