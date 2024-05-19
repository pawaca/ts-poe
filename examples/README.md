# Poe server bot examples

Welcome to the Poe server bot examples. This folder serves as a companion to the Poe
[tutorial](https://creator.poe.com/docs/quick-start) and contains starter code that
allows you to quickly get a bot running. The following are some of the examples included
in this repo. Note that the starter code assumes you have Modal setup for deployment
(the instructions for which are described in the aforementioned
[tutorial](https://creator.poe.com/docs/quick-start))

### EchoBot

This bot simply repeats the user's query in the response and provides a good starting
point to build any type of bot.

A correct implementation would look like https://poe.com/EchoBotDemonstration

### TurboAllCapsBot

- This bot responds to the user's query using GPT-3.5-Turbo. It demonstrates how to use
  the Poe platform to cover the inference costs for your chatbot.
- Before you are able to use the bot, you also need to synchronize the bot's settings
  with the Poe Platform, the instructions for which are specified
  [here](https://creator.poe.com/docs/server-bots-functional-guides#updating-bot-settings).

A correct implementation would look like https://poe.com/AllCapsBotDemo

### CatBot

A sample bot that demonstrates the Markdown capabilities of the Poe API.

A correct implementation would look like https://poe.com/CatBotDemo

### ImageResponseBot

A bot that demonstrates how to render an image in the response using Markdown.

A correct implementation would look like https://poe.com/ImageResponseBotDemo

### PDFCounterBot

- A bot that demonstrates how to enable file upload for the users of your bot.
- Before you are able to use the bot, you also need to synchronize the bot's settings
  with the Poe Platform, the instructions for which are specified
  [here](https://creator.poe.com/docs/server-bots-functional-guides#updating-bot-settings).

A correct implementation would look like https://poe.com/PDFCounterBotDemo

### VideoBot

- A bot that demonstrates how to attach files to your bot response. This example
  specifically uses video, but outputting other file types is fairly similar.
- Before you are able to use this bot, you do need to set your access key. You can get
  yours from the [create bot page](https://poe.com/create_bot?server=1).

### Function calling bot

- A bot that demonstrates how to use the Poe API for function calling.
- Before you are able to use the bot, you also need to synchronize the bot's settings
  with the Poe Platform, the instructions for which are specified
  [here](https://creator.poe.com/docs/server-bots-functional-guides#updating-bot-settings).

### HttpRequestBot

Provides an example of how to access HTTP request information in your bot.

### HuggingFaceBot

Provides an example of a bot powered by a model hosted on HuggingFace. This bot requires
you to provide your HuggingFace key.

### Langchain OpenAI

Provides an example of a bot powered by Langchain. This bot requires you to provide your
OpenAI key.

### TurboVsClaudeBot

- This is a more advanced example that demonstrates how to render output in realtime
  comparing two different bots.
- Before you are able to use the bot, you also need to synchronize the bot's settings
  with the Poe Platform, the instructions for which are specified
  [here](https://creator.poe.com/docs/server-bots-functional-guides#updating-bot-settings).

A correct implementation would look like https://poe.com/TurboVsClaudeBotDemo
