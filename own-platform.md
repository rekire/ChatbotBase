# Custom Platforms

Great, you want to use ChatbotBase and want to know how to write a custom platform. Here is a brief overview what you need to do.

## Steps

1. Create a new class which extends `VoicePlatform`
2. Override `platformId()` and return a unique name to identify your platform. This is used to identify special formatted custom messages.
3. Override `isSupported(json: any)` which will get the request body of the caller, just check there if you support the input format with a boolean result.
4. Override `parse(body: any)` which will be invoked when you returned true in `isSupported()`, there you get again the request body. Here you should only parse the request and return a `Input` object.
5. Override `render(reply: Output)` which should return the json which the caller expects.

Optional:  
Add static functions to provide platform specific `Message`s, which include two fields and two functions:
 
- `platform` is a field which must contain the same value as your `platformId()`
- `type` which is used to identify the kind of message for your internal logic
- `render()` must return the json which is generated for this special message, just to encapsulate the generation logic.
- `debug()` must return a textual representation of the message for debugging and for logging
 
Where you actually render the message in the final json is up to you. Consider the Dialogflow platform implementation as a reference. There you can also see that some messages are rendered at differnt places depending on the actual type.
 
## Special structure

Here is a listing of importent classes which are used.
 
### Input
The `Input` is representing the input of a user containing a lot of meta information for handling the user intent or even tracking if you chose one tracking provider. For simplisity the `Input` class has the `reply()` method which clones except of the message the input. By default the id of the answer will be the input id with the suffix `".reply"`.
 
Field | type | meaning
----- | ---- | -------
`id` | `string` | The identifier of the message which comes from the platform to identify messages thrue the system.
`userId` | `string` | The user identifier the same user in a conversation.
`sessionId` | `string` | A session id which is used to identify if an intent was fired in the same or a different season.
`language` | `string` | The language of the user in the [IETF language tag][wiki-IETF] or at least the first two letters (also known as [ISO 639-1][wiki-iso639-1]).
`platform` | `string` | A readable representation of the platform where the message was entered. Like Google Home, Google Assistant, Amazon Alexa or Amazon FireTV.
`time` | `Date` | The time when the message was entered if the input has not this field use the current time. This field can be used in analytics to track the response time.
`intent` | `string` | If you don't analyse the raw messages of the user a platform like Dialogflow or Alexa will give you some intent to identify the intent of the user.
`inputMethod` | `InputMethod` | The input method of the user like `Voice`, `Text` or `Touch`, if you don't know it use the most likely one.
`message` | `string` | The raw message of the user when given.
`context` | `Context` | A map of the context for this conversation.

### Output
The `Output` is used to render the output, to add messages to the reply there are some functions.

Method | Usage
------ | -----
addMessage(message: Message) | Adds a message object to the output, which will be rendered or not based on the compatibilities of the used platform 
addSuggestion(suggestion: Suggestion) | Adds a suggestion to the output, this is in the current implementation only the Google Assistant. 
setRetentionMessage(message: string) | Sets a reetention message to the message which will be said after 8 seconds of input at Amazon Alexa.
setExpectAnswer(answerExpected: boolean) | Defines if an answer is required for this conversation or, if it can just exit.

### Message
A message is an atom element which reply an input of a user. This can be some spoken words, audio files, cards or whatever your target platform supports.

Field/Method | Type | Usage
`platform` | `string` | Must contain the platform name which should render this message or `*` if this is a plain text node which should be interpreted by every platform.
`type` | `string` | Should contain a type which you use to identify the kind of message.
`render()` | `any` | Must return the object which should be rendered by the platform with `JSON.stringify()`.
`debug()` | `string` | Should return a string containing the textual represation of the message for debug logging.

### Context

The context is basically a map with a string as key holding any possible value.

  [wiki-IETF]: https://en.wikipedia.org/wiki/IETF_language_tag
  [wiki-iso639-1]: https://en.wikipedia.org/wiki/ISO_639-1